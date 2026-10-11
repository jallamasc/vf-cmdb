"""Update concerns for the CMDB: silent GitHub release detection, semver
comparison, and the marker/status file I/O that bridges the no-auth container
to the host-side update mechanism.

Trust boundary: the backend container runs rootless and MUST NEVER call
``podman`` or ``systemctl`` or otherwise touch the host. The only privileged
action it takes is writing a *marker file* inside its bind-mounted update
directory; a host-side systemd ``.path`` unit watches that file and runs the
update. The backend only reads the *status file* the host script writes back.

Migration-rollback caveat (code layer of the 3-layer rule): re-pulling an older
image does NOT undo an Alembic migration that already ran on container start
(``backend/entrypoint.sh`` runs ``alembic upgrade head`` every boot). The only
true schema rollback is restoring the pre-update database backup taken by
``deploy/scripts/vf-cmdb-backup.sh`` (restored via
``deploy/scripts/vf-cmdb-restore.sh``). The host update script takes that
backup before every applied update.

Silent-on-failure networking (NFR 1): every outbound call to ``api.github.com``
has a bounded timeout, catches ALL exceptions, and degrades to "no update info".
It never raises to the caller, never blocks beyond the timeout, and never
crashes the app.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .version import get_version_info

# ---------------------------------------------------------------------------
# GitHub release lookup (anonymous, cached, silent-on-failure)
# ---------------------------------------------------------------------------
GITHUB_LATEST = "https://api.github.com/repos/jallamasc/vf-cmdb/releases/latest"
_CACHE_TTL = 600  # seconds (10 min)
# (fetched_at_monotonic, tag_or_None) — process-global; the GIL guards the
# simple read/write and a lost update at worst costs one extra GitHub call.
_cache: tuple[float, str | None] = (0.0, None)


async def latest_release_tag() -> str | None:
    """Return the latest GitHub release tag (e.g. ``"v1.6.0"``) or ``None``.

    Cached for 10 minutes. On ANY failure (network, timeout, 403 rate-limit,
    404 no release, bad JSON) this returns the last successful value WITHOUT
    advancing the cache timestamp, so a transient outage never replaces a good
    value with ``None`` and the next real lookup happens on the first poll after
    the previous success ages past the TTL. Before any success the initial
    ``(0.0, None)`` means every poll retries.
    """
    global _cache
    now = time.monotonic()
    fetched_at, cached = _cache
    if now - fetched_at < _CACHE_TTL and fetched_at > 0.0:
        return cached
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(
                GITHUB_LATEST,
                headers={"Accept": "application/vnd.github+json"},
            )
            resp.raise_for_status()
            tag = resp.json().get("tag_name")
            tag = tag if isinstance(tag, str) and tag else None
    except Exception:
        # Silent-on-failure (NFR 1): do NOT advance the cache timestamp.
        return cached
    _cache = (now, tag)
    return tag


# ---------------------------------------------------------------------------
# Semver comparison (pure, no network, unit-testable)
# ---------------------------------------------------------------------------
_SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)")


def parse_semver(s: str | None) -> tuple[int, int, int] | None:
    """Parse the leading ``X.Y.Z`` (optionally ``v``-prefixed) of *s*.

    Returns ``None`` for empty/None input or anything without three numeric
    components. A trailing suffix (e.g. ``-rc1`` or a 4th component) is ignored.
    """
    if not s:
        return None
    m = _SEMVER.match(s.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def is_newer(candidate: str | None, running: str | None) -> bool:
    """True only if *candidate* is strictly newer than *running*.

    Any unknown/malformed/``"dev"`` input yields ``False``, so a dev build
    never nags and an unparseable value never claims an update is available.
    """
    c, r = parse_semver(candidate), parse_semver(running)
    if c is None or r is None:
        return False
    return c > r


def _normalize_tag(tag: str | None) -> str | None:
    """``"v1.6.0"`` -> ``"1.6.0"``; ``None``/malformed -> ``None``."""
    parsed = parse_semver(tag)
    if parsed is None:
        return None
    return f"{parsed[0]}.{parsed[1]}.{parsed[2]}"


# ---------------------------------------------------------------------------
# Marker / status file I/O (container <-> host bridge)
# ---------------------------------------------------------------------------
UPDATE_DIR = Path(os.getenv("VF_UPDATE_DIR", "/var/lib/vf-cmdb"))
MARKER = UPDATE_DIR / "update.request"
STATUS = UPDATE_DIR / "update.status"  # JSON written by the host script

# The camelCase status shape — identical keys here and in the Bash writer.
_STATUS_KEYS = ("state", "message", "requestedVersion", "startedAt", "finishedAt")


def _read_status(default_state: str) -> dict:
    """Read the host-written status file, or return a default on absent/garbage.

    The default uses the same camelCase shape so the frontend reads one shape
    regardless of whether the host script has written anything yet.
    """
    try:
        return json.loads(STATUS.read_text())
    except (OSError, ValueError):
        return {
            "state": default_state,
            "message": "",
            "requestedVersion": None,
            "startedAt": None,
            "finishedAt": None,
        }


def write_marker(to_tag: str | None) -> None:
    """Write the update-request marker the host ``.path`` unit watches.

    ``to_tag`` is advisory only — the host script always follows ``:latest``
    regardless of this value (it never parses ``to_tag`` to decide what to
    pull). Raises ``OSError`` if the update directory is not writable (not
    mounted); the caller translates that into a 503.
    """
    info = get_version_info()
    UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    MARKER.write_text(
        json.dumps(
            {
                "requested_at": datetime.now(timezone.utc).isoformat(),
                "from_version": info.version,
                "to_tag": to_tag,
            }
        )
    )
