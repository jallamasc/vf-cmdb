"""Phase 5 Task 22/23 — per-record photo upload.

Unlike a stencil (a device-*model*-level SVG, optionally downloaded from a
remote Visio Café URL and cache-served independently of any DB column), a
photo belongs to one specific *record* (e.g. one GenericEntity, one
PhysicalServer) and is only ever supplied by upload. The uploaded file is
stored on disk and the record's own `photo_url` column is set to point at the
GET endpoint that serves it — the URL IS the persisted value, not a separate
cache key.

Resource-agnostic by design (driven by `registry.ENTITY_REGISTRY`, exactly
like `ports.py`'s pattern) so Task 23 (adding `photo_url` to the hardcoded
device tables) reuses this module and the routes in `routers/special.py`
with no changes.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

# Storage directory: backend/static/photos/. Resolved relative to this file
# so it is stable regardless of the process working directory.
_STATIC_ROOT = Path(__file__).resolve().parent.parent / "static"
PHOTO_DIR = _STATIC_ROOT / "photos"
# Phase 5 Task 26/27 (Req 21.3/22.3) — a separate directory for uploaded
# floor-plan blueprints. Same storage/validation code, distinct namespace
# from per-record photos (both use the same `{resource}-{id}` slug shape,
# so keeping them in separate directories avoids any collision even though
# none exists in practice today).
BLUEPRINT_DIR = _STATIC_ROOT / "blueprints"

# Same domain-name-ish charset stencils.py validates model slugs against —
# safe to join onto PHOTO_DIR (no dots, slashes or "..").
_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# No upload size/type limit exists anywhere else in this codebase (confirmed
# via a full-repo check before writing this) — a real photo upload endpoint
# needs one, so this is a new, deliberately generous cap rather than an
# established convention being followed.
MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10 MB

_EXT_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}

# Magic-byte sniffing so a mislabeled (or absent) Content-Type header doesn't
# reject a genuinely valid image — mirrors stencils.py's "declared type OR
# sniffed body" leniency.
_MAGIC_BYTES: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
    (b"RIFF", "webp"),  # WEBP container starts with RIFF....WEBP
]


class InvalidSlug(ValueError):
    """Raised when a photo slug fails the path-traversal charset guard."""


class InvalidPhoto(ValueError):
    """Raised when uploaded content isn't a recognisable image, or is too
    large."""


def ensure_photo_dir(base_dir: Optional[Path] = None) -> None:
    # NOTE: default is resolved here (not as `base_dir: Path = PHOTO_DIR`)
    # so tests that monkeypatch the module-level PHOTO_DIR/BLUEPRINT_DIR
    # constants are honored — a bound default parameter value would freeze
    # in the value PHOTO_DIR had at import time, before any monkeypatch.
    (base_dir or PHOTO_DIR).mkdir(parents=True, exist_ok=True)


def validate_slug(slug: str) -> str:
    cleaned = (slug or "").strip().lower()
    if not _SLUG_RE.match(cleaned):
        raise InvalidSlug(
            f"Invalid photo slug '{slug}'. Slugs may contain only lowercase "
            "letters, digits and single hyphens."
        )
    return cleaned


def _detect_extension(data: bytes, content_type: Optional[str]) -> Optional[str]:
    if content_type:
        ext = _EXT_BY_CONTENT_TYPE.get(content_type.lower())
        if ext:
            return ext
    for magic, ext in _MAGIC_BYTES:
        if data.startswith(magic):
            return ext
    return None


def existing_path(slug: str, base_dir: Optional[Path] = None) -> Optional[Path]:
    """The on-disk file for a slug, whichever extension it was stored with."""
    slug = validate_slug(slug)
    base_dir = base_dir or PHOTO_DIR
    if not base_dir.is_dir():
        return None
    matches = sorted(base_dir.glob(f"{slug}.*"))
    return matches[0] if matches else None


def store_bytes(
    slug: str,
    data: bytes,
    content_type: Optional[str] = None,
    base_dir: Optional[Path] = None,
) -> Path:
    """Validate + write an uploaded photo, overwriting any previous copy
    (including one saved under a different extension)."""
    slug = validate_slug(slug)
    base_dir = base_dir or PHOTO_DIR
    if len(data) > MAX_PHOTO_BYTES:
        raise InvalidPhoto(
            f"Photo is too large ({len(data)} bytes) — the limit is "
            f"{MAX_PHOTO_BYTES // (1024 * 1024)} MB."
        )
    ext = _detect_extension(data, content_type)
    if ext is None:
        raise InvalidPhoto(
            "Uploaded file is not a recognised image (expected JPEG, PNG, "
            "GIF or WEBP)."
        )
    ensure_photo_dir(base_dir)
    # Remove any previously stored file for this slug under a different
    # extension, so re-uploading a PNG over a JPEG doesn't leave a stale copy.
    for old in base_dir.glob(f"{slug}.*"):
        old.unlink()
    path = base_dir / f"{slug}.{ext}"
    path.write_bytes(data)
    return path
