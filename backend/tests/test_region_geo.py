"""Phase 6 Task 17 (Req 7.1) — Region latitude/longitude round-trip."""
from __future__ import annotations

from app import crud, models


async def test_region_lat_lng_round_trips(session):
    row = await crud.create_item(
        session,
        models.Region,
        {"full_name": "Test Region", "abbreviation": "trg", "latitude": 4.7110, "longitude": -74.0721},
    )
    assert row.latitude == 4.7110
    assert row.longitude == -74.0721
    fetched = await session.get(models.Region, row.id)
    assert fetched.latitude == 4.7110


async def test_region_lat_lng_optional(session):
    row = await crud.create_item(session, models.Region, {"full_name": "No Geo", "abbreviation": "ng"})
    assert row.latitude is None
    assert row.longitude is None
