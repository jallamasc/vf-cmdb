"""Post-Phase-6 QA (round 4) — "Treat wall section as section, according
to TIA and use the TIA indications to form this name." PowerOutlet's
wall-mounted location is now a real reference to `Section` (which already
carries a TIA-606-derived `code`, "S{n}" per room) instead of a
disconnected free-text `wall_section` string.
"""
from app import crud, models


async def test_power_outlet_section_id_round_trips(session):
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1", "site_id": site.id})
    floor = await crud.create_item(session, models.DatacenterFloor, {"name": "F1", "datacenter_id": dc.id})
    room = await crud.create_item(session, models.Room, {"name": "Room 1", "datacenter_floor_id": floor.id})
    section = await crud.create_item(session, models.Section, {"name": "Row A", "room_id": room.id})
    assert section.code == "S1"  # TIA-derived, naming.generate_section

    outlet = await crud.create_item(
        session, models.PowerOutlet, {"label": "Wall outlet 1", "section_id": section.id}
    )
    assert outlet.section_id == section.id

    fetched = await session.get(models.PowerOutlet, outlet.id)
    assert fetched.section_id == section.id


async def test_power_outlet_section_id_is_optional(session):
    outlet = await crud.create_item(session, models.PowerOutlet, {"label": "Unassigned outlet"})
    assert outlet.section_id is None
