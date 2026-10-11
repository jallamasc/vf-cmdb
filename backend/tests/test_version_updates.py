"""FEAT-002 — version awareness + silent GitHub release detection +
one-click-update marker/status endpoints.

The semver / version-info / _read_status cases need no DB and run as plain
functions. The endpoint cases follow the httpx.ASGITransport(app=app) +
AsyncClient pattern of test_automation_endpoints.py.
"""

from __future__ import annotations

import json

import httpx
import pytest

from app import updates
from app.main import app
from app.version import VersionInfo, get_version_info


# ---------------------------------------------------------------------------
# ASGI client (no DB needed for these endpoints)
# ---------------------------------------------------------------------------
async def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture(autouse=True)
def _reset_github_cache():
    """Each test starts with a fresh (0.0, None) GitHub cache so cached values
    never leak between tests."""
    updates._cache = (0.0, None)
    yield
    updates._cache = (0.0, None)


# ---------------------------------------------------------------------------
# parse_semver / is_newer (AC-10 table)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "candidate,running,expected",
    [
        ("1.5.0", "1.4.0", True),
        ("1.5.0", "1.5.0", False),
        ("1.5.0", "1.6.0", False),
        (None, "1.4.0", False),
        ("not-a-version", "1.4.0", False),
        ("1.5.0", "dev", False),
        ("dev", "1.4.0", False),
        ("1.5.0", None, False),
    ],
)
def test_is_newer_table(candidate, running, expected):
    assert updates.is_newer(candidate, running) is expected


def test_parse_semver_variants():
    assert updates.parse_semver("1.2") is None
    assert updates.parse_semver("v1.2.3.4") == (1, 2, 3)
    assert updates.parse_semver("1.2.3") == (1, 2, 3)
    assert updates.parse_semver("v1.6.0") == (1, 6, 0)
    assert updates.parse_semver("1.5.0-rc1") == (1, 5, 0)
    assert updates.parse_semver(None) is None
    assert updates.parse_semver("") is None
    assert updates.parse_semver("garbage") is None


def test_normalize_tag():
    assert updates._normalize_tag("v1.6.0") == "1.6.0"
    assert updates._normalize_tag("1.6.0") == "1.6.0"
    assert updates._normalize_tag(None) is None
    assert updates._normalize_tag("latest") is None


# ---------------------------------------------------------------------------
# get_version_info (env set / unset / empty)
# ---------------------------------------------------------------------------
def test_get_version_info_unset(monkeypatch):
    for key in ("VF_VERSION", "VF_GIT_SHA", "VF_BUILT_AT"):
        monkeypatch.delenv(key, raising=False)
    get_version_info.cache_clear()
    info = get_version_info()
    assert info == VersionInfo("dev", "unknown", "unknown")


def test_get_version_info_set(monkeypatch):
    monkeypatch.setenv("VF_VERSION", "1.5.0")
    monkeypatch.setenv("VF_GIT_SHA", "a1b2c3d")
    monkeypatch.setenv("VF_BUILT_AT", "2026-01-10T04:00:00Z")
    get_version_info.cache_clear()
    info = get_version_info()
    assert info.version == "1.5.0"
    assert info.git_sha == "a1b2c3d"
    assert info.built_at == "2026-01-10T04:00:00Z"


def test_get_version_info_empty_is_unset(monkeypatch):
    monkeypatch.setenv("VF_VERSION", "")
    monkeypatch.setenv("VF_GIT_SHA", "   ")
    monkeypatch.delenv("VF_BUILT_AT", raising=False)
    get_version_info.cache_clear()
    info = get_version_info()
    assert info.version == "dev"
    assert info.git_sha == "unknown"
    assert info.built_at == "unknown"


@pytest.fixture(autouse=True)
def _clear_version_cache():
    """Keep the lru_cache from leaking an env-driven value across tests."""
    get_version_info.cache_clear()
    yield
    get_version_info.cache_clear()


# ---------------------------------------------------------------------------
# latest_release_tag — success / timeout / 403 / 404 / bad JSON
# ---------------------------------------------------------------------------
def _mock_github(monkeypatch, handler):
    """Point latest_release_tag()'s httpx client at a MockTransport WITHOUT
    mutating the shared httpx module (that would also break the ASGI client the
    endpoint tests use). We swap the module reference `updates.httpx` for a tiny
    shim whose AsyncClient builds a real client over a MockTransport."""

    class _Shim:
        def AsyncClient(self, *args, **kwargs):
            return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(updates, "httpx", _Shim())


async def test_latest_release_tag_success(monkeypatch):
    def handler(request):
        return httpx.Response(200, json={"tag_name": "v1.6.0"})

    _mock_github(monkeypatch, handler)
    assert await updates.latest_release_tag() == "v1.6.0"


async def test_latest_release_tag_timeout_returns_none(monkeypatch):
    def handler(request):
        raise httpx.ConnectTimeout("boom", request=request)

    _mock_github(monkeypatch, handler)
    assert await updates.latest_release_tag() is None


async def test_latest_release_tag_403_returns_last_good(monkeypatch):
    def handler(request):
        return httpx.Response(403, json={"message": "rate limited"})

    _mock_github(monkeypatch, handler)
    assert await updates.latest_release_tag() is None


async def test_latest_release_tag_404_returns_none(monkeypatch):
    def handler(request):
        return httpx.Response(404, json={"message": "not found"})

    _mock_github(monkeypatch, handler)
    assert await updates.latest_release_tag() is None


async def test_latest_release_tag_bad_json_returns_none(monkeypatch):
    def handler(request):
        return httpx.Response(200, content=b"not json")

    _mock_github(monkeypatch, handler)
    assert await updates.latest_release_tag() is None


# ---------------------------------------------------------------------------
# GET /meta/version — shape + camelCase + silent-on-failure
# ---------------------------------------------------------------------------
async def test_meta_version_shape_with_update_available(monkeypatch):
    monkeypatch.setenv("VF_VERSION", "1.5.0")
    get_version_info.cache_clear()

    def handler(request):
        return httpx.Response(200, json={"tag_name": "v1.6.0"})

    _mock_github(monkeypatch, handler)
    async with await _client() as client:
        r = await client.get("/api/v1/meta/version")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "version",
        "gitSha",
        "builtAt",
        "latest",
        "latestTag",
        "updateAvailable",
    }
    assert body["version"] == "1.5.0"
    assert body["latest"] == "1.6.0"
    assert body["latestTag"] == "v1.6.0"
    assert body["updateAvailable"] is True


async def test_meta_version_github_unreachable_is_silent(monkeypatch):
    monkeypatch.setenv("VF_VERSION", "1.5.0")
    get_version_info.cache_clear()

    def handler(request):
        raise httpx.ConnectError("offline", request=request)

    _mock_github(monkeypatch, handler)
    async with await _client() as client:
        r = await client.get("/api/v1/meta/version")
    assert r.status_code == 200
    body = r.json()
    assert body["latest"] is None
    assert body["latestTag"] is None
    assert body["updateAvailable"] is False


async def test_meta_version_same_version_no_update(monkeypatch):
    monkeypatch.setenv("VF_VERSION", "1.6.0")
    get_version_info.cache_clear()

    def handler(request):
        return httpx.Response(200, json={"tag_name": "v1.6.0"})

    _mock_github(monkeypatch, handler)
    async with await _client() as client:
        r = await client.get("/api/v1/meta/version")
    body = r.json()
    assert body["updateAvailable"] is False


# ---------------------------------------------------------------------------
# Marker write + _read_status against tmp_path
# ---------------------------------------------------------------------------
def test_read_status_absent_returns_default(monkeypatch, tmp_path):
    monkeypatch.setattr(updates, "STATUS", tmp_path / "update.status")
    out = updates._read_status(default_state="idle")
    assert out == {
        "state": "idle",
        "message": "",
        "requestedVersion": None,
        "startedAt": None,
        "finishedAt": None,
    }


def test_read_status_garbage_returns_default(monkeypatch, tmp_path):
    status = tmp_path / "update.status"
    status.write_text("}{ not json")
    monkeypatch.setattr(updates, "STATUS", status)
    out = updates._read_status(default_state="requested")
    assert out["state"] == "requested"


def test_read_status_reads_host_file(monkeypatch, tmp_path):
    status = tmp_path / "update.status"
    status.write_text(
        json.dumps(
            {
                "state": "running",
                "message": "Pulling new images",
                "requestedVersion": "1.6.0",
                "startedAt": "2026-01-10T04:00:00Z",
                "finishedAt": None,
            }
        )
    )
    monkeypatch.setattr(updates, "STATUS", status)
    out = updates._read_status(default_state="idle")
    assert out["state"] == "running"
    assert out["requestedVersion"] == "1.6.0"


def test_write_marker_writes_json(monkeypatch, tmp_path):
    monkeypatch.setenv("VF_VERSION", "1.5.0")
    get_version_info.cache_clear()
    monkeypatch.setattr(updates, "UPDATE_DIR", tmp_path)
    monkeypatch.setattr(updates, "MARKER", tmp_path / "update.request")
    updates.write_marker("v1.6.0")
    marker = json.loads((tmp_path / "update.request").read_text())
    assert marker["from_version"] == "1.5.0"
    assert marker["to_tag"] == "v1.6.0"
    assert "requested_at" in marker


# ---------------------------------------------------------------------------
# POST /admin/update + GET /admin/update/status (finding 4)
# ---------------------------------------------------------------------------
async def test_post_update_returns_requested(monkeypatch, tmp_path):
    monkeypatch.setattr(updates, "UPDATE_DIR", tmp_path)
    monkeypatch.setattr(updates, "MARKER", tmp_path / "update.request")
    monkeypatch.setattr(updates, "STATUS", tmp_path / "update.status")

    def handler(request):
        raise httpx.ConnectError("offline", request=request)

    _mock_github(monkeypatch, handler)
    async with await _client() as client:
        r = await client.post("/api/v1/admin/update")
    assert r.status_code == 200
    assert r.json()["state"] == "requested"
    # marker was actually written
    assert (tmp_path / "update.request").exists()


async def test_post_update_503_when_dir_unwritable(monkeypatch, tmp_path):
    bad = tmp_path / "not-mounted"
    monkeypatch.setattr(updates, "UPDATE_DIR", bad)
    monkeypatch.setattr(updates, "MARKER", bad / "update.request")

    def handler(request):
        raise httpx.ConnectError("offline", request=request)

    _mock_github(monkeypatch, handler)

    def boom(*args, **kwargs):
        raise OSError("read-only file system")

    monkeypatch.setattr(updates.Path, "mkdir", boom)
    async with await _client() as client:
        r = await client.post("/api/v1/admin/update")
    assert r.status_code == 503


async def test_get_status_idle_before_any_file(monkeypatch, tmp_path):
    monkeypatch.setattr(updates, "STATUS", tmp_path / "update.status")
    async with await _client() as client:
        r = await client.get("/api/v1/admin/update/status")
    assert r.status_code == 200
    assert r.json()["state"] == "idle"
