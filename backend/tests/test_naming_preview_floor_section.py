"""Phase 6 Task 13/14 (Req 6.1/6.2) — the live naming-preview endpoint now
knows about Floor/Section's new generators, so their Quick Add form's
preview card can show the real code before Create.
"""
from __future__ import annotations

import httpx

from app.main import app


async def _client():
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def test_floor_preview_reports_generated_code(session):
    from app import crud, models

    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1", "code": "DC1"})
    async with await _client() as client:
        r = await client.get(
            f"/api/v1/naming/generate?entity_type=datacenter_floor&datacenter_id={dc.id}"
        )
    assert r.status_code == 200
    body = r.json()
    assert body["generated"] is True
    assert body["code"] == "DC1-F1"


async def test_section_preview_reports_generated_code(session):
    from app import crud, models

    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1", "code": "DC1"})
    floor = await crud.create_item(session, models.DatacenterFloor, {"name": "F", "datacenter_id": dc.id})
    room = await crud.create_item(session, models.Room, {"name": "Room 1", "datacenter_floor_id": floor.id})
    async with await _client() as client:
        r = await client.get(f"/api/v1/naming/generate?entity_type=section&room_id={room.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["generated"] is True
    assert body["code"] == "S1"
