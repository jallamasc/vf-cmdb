"""Phase 5 Task 9 — icon metadata on the 4 device-type lookup tables."""
from __future__ import annotations

from app import crud, models

MODELS = (
    models.NetworkDeviceType,
    models.ComputeDeviceType,
    models.StorageDeviceType,
    models.PowerDeviceType,
)


async def test_icon_round_trips_for_every_device_type_lookup(session):
    for i, model in enumerate(MODELS):
        row = await crud.create_item(
            session,
            model,
            {"full_name": f"Icon test {i}", "abbreviation": f"icontest{i}", "icon": "Router"},
        )
        assert row.icon == "Router"


async def test_icon_is_optional(session):
    row = await crud.create_item(
        session, models.NetworkDeviceType, {"full_name": "No icon", "abbreviation": "noicon"}
    )
    assert row.icon is None
