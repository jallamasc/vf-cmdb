"""Phase 5 Task 26/27 — Room/Section hierarchy levels + blueprint upload
(Req 21, 22).

Room itself predates Phase 5 (model/table/registry already existed) — these
tests cover what's actually new: blueprint_url on Floor/Room, the new
Section model, and the at-most-one-of(floor/room/section) validation on
Rack (crud._validate_rack), which didn't exist before this task (Room
placement was previously unenforced).
"""
from __future__ import annotations

import pathlib
import tempfile

import httpx
import pytest
from fastapi import HTTPException

from app import crud, models, photos
from app.main import app

_JPEG_BYTES = bytes.fromhex("ffd8ffe000104a46494600010100000100010000ffd9")


@pytest.fixture(autouse=True)
def _tmp_blueprint_dir(monkeypatch):
    tmp = pathlib.Path(tempfile.mkdtemp()) / "blueprints"
    monkeypatch.setattr(photos, "BLUEPRINT_DIR", tmp)
    yield tmp


async def _make_floor(session):
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1"})
    return await crud.create_item(
        session, models.DatacenterFloor, {"name": "Floor 1", "datacenter_id": dc.id}
    )


async def _make_room(session, floor=None):
    floor = floor or await _make_floor(session)
    return await crud.create_item(
        session, models.Room, {"name": "Room 1", "datacenter_floor_id": floor.id}
    )


async def test_room_blueprint_url_round_trips(session):
    room = await _make_room(session)
    assert room.blueprint_url is None
    updated = await crud.update_item(
        session, models.Room, room.id, {"blueprint_url": "https://example.com/plan.png"}
    )
    assert updated.blueprint_url == "https://example.com/plan.png"


async def test_floor_blueprint_url_round_trips(session):
    floor = await _make_floor(session)
    updated = await crud.update_item(
        session, models.DatacenterFloor, floor.id, {"blueprint_url": "https://example.com/f.png"}
    )
    assert updated.blueprint_url == "https://example.com/f.png"


@pytest.mark.parametrize("resource,model_getter", [("rooms", _make_room), ("datacenter-floors", _make_floor)])
async def test_blueprint_upload_endpoint_works(session, resource, model_getter):
    row = await model_getter(session)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/blueprints/{resource}/{row.id}",
            files={"file": ("plan.jpg", _JPEG_BYTES, "image/jpeg")},
        )
        assert resp.status_code == 200
        blueprint_url = resp.json()["blueprint_url"]

        served = await client.get(blueprint_url)
        assert served.status_code == 200
        assert served.content == _JPEG_BYTES


async def test_section_requires_a_room(session):
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(session, models.Section, {"name": "No room"})
    assert exc.value.status_code == 422


async def test_section_create_round_trips_and_blueprint_uploads(session):
    room = await _make_room(session)
    section = await crud.create_item(
        session, models.Section, {"name": "Section A", "room_id": room.id}
    )
    assert section.room_id == room.id
    assert section.blueprint_url is None

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            f"/api/v1/blueprints/sections/{section.id}",
            files={"file": ("plan.jpg", _JPEG_BYTES, "image/jpeg")},
        )
        assert resp.status_code == 200


async def test_rack_may_be_placed_on_floor_only(session):
    floor = await _make_floor(session)
    rack = await crud.create_item(session, models.Rack, {"datacenter_floor_id": floor.id})
    assert rack.datacenter_floor_id == floor.id
    assert rack.room_id is None
    assert rack.section_id is None


async def test_rack_may_be_placed_on_room_only(session):
    room = await _make_room(session)
    rack = await crud.create_item(session, models.Rack, {"room_id": room.id})
    assert rack.room_id == room.id
    assert rack.datacenter_floor_id is None


async def test_rack_may_be_placed_on_section_only(session):
    room = await _make_room(session)
    section = await crud.create_item(session, models.Section, {"name": "S1", "room_id": room.id})
    rack = await crud.create_item(session, models.Rack, {"section_id": section.id})
    assert rack.section_id == section.id
    assert rack.room_id is None


async def test_rack_may_have_none_of_the_three(session):
    rack = await crud.create_item(session, models.Rack, {"grid_coordinates": "X01"})
    assert rack.datacenter_floor_id is None
    assert rack.room_id is None
    assert rack.section_id is None


async def test_rack_cannot_have_both_floor_and_room(session):
    floor = await _make_floor(session)
    room = await _make_room(session, floor)
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.Rack,
            {"datacenter_floor_id": floor.id, "room_id": room.id},
        )
    assert exc.value.status_code == 422


async def test_rack_cannot_have_both_room_and_section(session):
    room = await _make_room(session)
    section = await crud.create_item(session, models.Section, {"name": "S1", "room_id": room.id})
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.Rack,
            {"room_id": room.id, "section_id": section.id},
        )
    assert exc.value.status_code == 422


async def test_update_that_would_create_a_second_parent_is_rejected(session):
    room = await _make_room(session)
    rack = await crud.create_item(session, models.Rack, {"room_id": room.id})
    with pytest.raises(HTTPException) as exc:
        await crud.update_item(
            session, models.Rack, rack.id, {"datacenter_floor_id": room.datacenter_floor_id}
        )
    assert exc.value.status_code == 422
    # Rejected update must not have persisted a partial/conflicting state.
    reloaded = await session.get(models.Rack, rack.id)
    await session.refresh(reloaded)
    assert reloaded.room_id == room.id
