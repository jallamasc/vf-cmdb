"""Post-Phase-6 QA (round 3) — "Everything needs a fantastic name and a
real coded name" for Datacenter/Floor (and, since the columns already
existed, Room/Section too). Datacenter gets a NEW `theme_name`/
`theme_category` pair (migration 0033_datacenter_theme_name); Floor/Room/
Section already had the columns from an earlier migration but nothing
ever wrote to or read them — this just confirms the plain generic-CRUD
round trip now that the frontend actually exposes them.

None of these fields are naming-engine-computed (no generator sets them),
so this is a thin confirmation that the column exists, round-trips, and
coexists independently alongside the real coded name (`code`) — not a
naming.py behavior test.
"""
from app import crud, models


async def test_datacenter_theme_name_round_trips_alongside_code(session):
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(
        session,
        models.Datacenter,
        {"name": "Main DC", "site_id": site.id, "code": "dc1", "theme_name": "Ironforge", "theme_category": "fantasy"},
    )
    assert dc.code == "dc1"
    assert dc.theme_name == "Ironforge"
    assert dc.theme_category == "fantasy"


async def test_datacenter_theme_name_is_optional(session):
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(session, models.Datacenter, {"name": "No Theme DC", "site_id": site.id})
    assert dc.theme_name is None


async def test_updating_datacenter_theme_name_does_not_touch_code_or_vf_long_name(session):
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(
        session, models.Datacenter, {"name": "Main DC", "site_id": site.id, "code": "dc1"}
    )
    original_long_name = dc.vf_long_name
    updated = await crud.update_item(session, models.Datacenter, dc.id, {"theme_name": "Stormwind"})
    assert updated.theme_name == "Stormwind"
    assert updated.code == "dc1"
    assert updated.vf_long_name == original_long_name


async def test_floor_theme_name_round_trips_alongside_generated_code(session):
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(session, models.Datacenter, {"name": "Main DC", "site_id": site.id, "code": "dc1"})
    floor = await crud.create_item(
        session,
        models.DatacenterFloor,
        {"name": "First Floor", "datacenter_id": dc.id, "theme_name": "Skyloft"},
    )
    # `code` is still auto-generated ("F{n}") regardless of theme_name.
    assert floor.code == "dc1-F1"
    assert floor.theme_name == "Skyloft"


async def test_room_and_section_theme_names_round_trip(session):
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(session, models.Datacenter, {"name": "Main DC", "site_id": site.id})
    floor = await crud.create_item(session, models.DatacenterFloor, {"name": "F1", "datacenter_id": dc.id})
    room = await crud.create_item(
        session,
        models.Room,
        {"name": "Server Room", "datacenter_floor_id": floor.id, "theme_name": "The Vault"},
    )
    section = await crud.create_item(
        session, models.Section, {"name": "Row A", "room_id": room.id, "theme_name": "Aisle Nine"}
    )
    assert room.theme_name == "The Vault"
    assert section.theme_name == "Aisle Nine"
    assert section.code == "S1"  # still auto-generated, independent of theme_name
