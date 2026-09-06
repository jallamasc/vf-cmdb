"""Phase 5 Task 23 — photo_url on the hardcoded device types (Req 19.1).

The upload/serve infrastructure itself (backend/app/photos.py,
routers/special.py's /photos/... routes) was already fully resource-agnostic
before this task (Task 22) — these tests confirm the column exists and that
the SAME upload endpoint (with zero code changes) now works for each of the
five hardcoded device tables.
"""
from __future__ import annotations

import pathlib
import tempfile

import httpx
import pytest

from app import crud, models, photos
from app.main import app

_JPEG_BYTES = bytes.fromhex("ffd8ffe000104a46494600010100000100010000ffd9")


@pytest.fixture(autouse=True)
def _tmp_photo_dir(monkeypatch):
    tmp = pathlib.Path(tempfile.mkdtemp()) / "photos"
    monkeypatch.setattr(photos, "PHOTO_DIR", tmp)
    yield tmp


@pytest.mark.parametrize(
    "resource,model",
    [
        ("network-devices", models.NetworkDevice),
        ("physical-servers", models.PhysicalServer),
        ("workstations", models.Workstation),
        ("power-devices", models.PowerDevice),
        ("patch-panels", models.PatchPanel),
    ],
)
async def test_photo_url_column_round_trips(session, resource, model):
    row = await crud.create_item(session, model, {})
    assert row.photo_url is None
    updated = await crud.update_item(
        session, model, row.id, {"photo_url": "https://example.com/pic.jpg"}
    )
    assert updated.photo_url == "https://example.com/pic.jpg"


@pytest.mark.parametrize(
    "resource,model",
    [
        ("network-devices", models.NetworkDevice),
        ("physical-servers", models.PhysicalServer),
        ("workstations", models.Workstation),
        ("power-devices", models.PowerDevice),
        ("patch-panels", models.PatchPanel),
    ],
)
async def test_upload_endpoint_works_for_every_hardcoded_type(session, resource, model):
    row = await crud.create_item(session, model, {})

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/photos/{resource}/{row.id}",
            files={"file": ("photo.jpg", _JPEG_BYTES, "image/jpeg")},
        )
        assert resp.status_code == 200
        photo_url = resp.json()["photo_url"]

        served = await client.get(photo_url)
        assert served.status_code == 200
        assert served.content == _JPEG_BYTES

    refreshed = await session.get(model, row.id)
    await session.refresh(refreshed)
    assert refreshed.photo_url == photo_url
