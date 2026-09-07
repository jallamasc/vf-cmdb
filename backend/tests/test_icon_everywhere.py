"""Phase 6 Task 9 (Req 4.1) — every registry now has an `icon` column."""
from __future__ import annotations

from app import crud, models


async def test_icon_round_trips_on_a_previously_bare_lookup(session):
    row = await crud.create_item(
        session,
        models.Organization,
        {"full_name": "IconCo", "abbreviation": "ic", "icon": "Building2"},
    )
    assert row.icon == "Building2"
    fetched = await session.get(models.Organization, row.id)
    assert fetched.icon == "Building2"


async def test_icon_round_trips_on_rack_type_and_field_type_def(session):
    rt = await crud.create_item(
        session, models.RackType, {"name": "Half Rack", "icon": "Rows3"}
    )
    assert rt.icon == "Rows3"
    ft = await crud.create_item(
        session,
        models.FieldTypeDef,
        {"slug": "icon-test", "label": "Icon Test", "storage_kind": "text", "icon": "Tag"},
    )
    assert ft.icon == "Tag"


async def test_icon_is_optional(session):
    row = await crud.create_item(session, models.Region, {"full_name": "Nowhere", "abbreviation": "now"})
    assert row.icon is None
