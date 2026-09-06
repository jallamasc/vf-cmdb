"""Phase 5 Task 22/23 — per-record photo upload (Req 18.1, 19.1).

Module-level tests mirror `test_stencils.py`'s style (an autouse fixture
redirects the on-disk directory to a temp path). The endpoint-level test
drives the real ASGI app via `httpx.ASGITransport` (same pattern as
`test_cors_headers.py`) layered on top of the `session` fixture — safe to
combine because `crud.create_item`/`crud.update_item` commit, so a row
created through `session` is visible to the separate connection the app's
own (monkeypatched, per conftest.py) `AsyncSessionLocal` opens for the HTTP
request.
"""
from __future__ import annotations

import pathlib
import tempfile

import httpx
import pytest

from app import crud, models, photos
from app.main import app

# A 1x1 JPEG (real magic bytes, minimal valid-enough body for magic-byte
# sniffing — this endpoint doesn't decode the image, only sniffs its header).
_JPEG_BYTES = bytes.fromhex("ffd8ffe000104a46494600010100000100010000ffd9")


@pytest.fixture(autouse=True)
def _tmp_photo_dir(monkeypatch):
    tmp = pathlib.Path(tempfile.mkdtemp()) / "photos"
    monkeypatch.setattr(photos, "PHOTO_DIR", tmp)
    yield tmp


def test_invalid_slug_rejected():
    with pytest.raises(photos.InvalidSlug):
        photos.validate_slug("Bad_Slug")
    with pytest.raises(photos.InvalidSlug):
        photos.validate_slug("../etc/passwd")
    assert photos.validate_slug("generic-entities-3") == "generic-entities-3"


def test_non_image_upload_rejected():
    with pytest.raises(photos.InvalidPhoto):
        photos.store_bytes("generic-entities-1", b"not an image", "text/plain")


def test_oversized_upload_rejected():
    huge = b"\xff\xd8\xff" + b"0" * (photos.MAX_PHOTO_BYTES + 1)
    with pytest.raises(photos.InvalidPhoto):
        photos.store_bytes("generic-entities-1", huge, "image/jpeg")


def test_store_and_find_by_magic_bytes_without_a_content_type():
    path = photos.store_bytes("generic-entities-1", _JPEG_BYTES, None)
    assert path.is_file()
    assert path.suffix == ".jpg"
    found = photos.existing_path("generic-entities-1")
    assert found == path


def test_reupload_under_a_different_extension_removes_the_stale_file():
    photos.store_bytes("generic-entities-1", _JPEG_BYTES, "image/jpeg")
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    photos.store_bytes("generic-entities-1", png_bytes, "image/png")
    matches = list(photos.PHOTO_DIR.glob("generic-entities-1.*"))
    assert len(matches) == 1
    assert matches[0].suffix == ".png"


async def test_upload_endpoint_sets_photo_url_and_serves_it_back(session):
    entity_type = await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": "camera-mount", "label": "Camera Mount", "capabilities": ["photo"]},
    )
    entity = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": entity_type.id, "attributes": {}},
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/photos/generic-entities/{entity.id}",
            files={"file": ("photo.jpg", _JPEG_BYTES, "image/jpeg")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["resource"] == "generic-entities"
        assert body["id"] == entity.id
        photo_url = body["photo_url"]
        assert photo_url == f"/api/v1/photos/generic-entities-{entity.id}"

        served = await client.get(photo_url)
        assert served.status_code == 200
        assert served.content == _JPEG_BYTES
        assert served.headers["content-type"] == "image/jpeg"

    refreshed = await session.get(models.GenericEntity, entity.id)
    await session.refresh(refreshed)
    assert refreshed.photo_url == photo_url


async def test_upload_endpoint_rejects_an_unsupported_resource(session):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/photos/regions/1",
            files={"file": ("photo.jpg", _JPEG_BYTES, "image/jpeg")},
        )
    assert resp.status_code == 400


async def test_get_photo_404s_when_nothing_uploaded(session):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/photos/generic-entities-999")
    assert resp.status_code == 404
