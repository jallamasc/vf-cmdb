"""Phase 6 Task 13 (Req 6.1/6.2/6.3) — Floor/Section naming-engine
generators: sequential F{n}/S{n} scoped to their parent, gated by
naming_mode.
"""
from __future__ import annotations

from app import crud, models


async def test_floor_code_generated_sequentially_within_datacenter(session):
    # code="DC1" — DatacenterFloor.code is already globally unique via the
    # Abbreviation_Registry (abbrev.py, predates this task), so the
    # generator prefixes with the parent's own code; giving the datacenter
    # one here exercises that real prefix, not just the bare "F{n}" suffix.
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1", "code": "DC1"})
    f1 = await crud.create_item(session, models.DatacenterFloor, {"name": "Ground", "datacenter_id": dc.id})
    f2 = await crud.create_item(session, models.DatacenterFloor, {"name": "First", "datacenter_id": dc.id})
    assert f1.code == "DC1-F1"
    assert f2.code == "DC1-F2"


async def test_floor_sequence_restarts_for_a_different_datacenter(session):
    dc1 = await crud.create_item(session, models.Datacenter, {"name": "DC1", "code": "DC1"})
    dc2 = await crud.create_item(session, models.Datacenter, {"name": "DC2", "code": "DC2"})
    await crud.create_item(session, models.DatacenterFloor, {"name": "Ground", "datacenter_id": dc1.id})
    f = await crud.create_item(session, models.DatacenterFloor, {"name": "Ground", "datacenter_id": dc2.id})
    # Both datacenters' first floor is "F1" locally, but the real stored
    # code stays globally unique via the datacenter's own prefix.
    assert f.code == "DC2-F1"


async def test_section_code_generated_sequentially_within_room(session):
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1"})
    floor = await crud.create_item(session, models.DatacenterFloor, {"name": "F", "datacenter_id": dc.id})
    room = await crud.create_item(session, models.Room, {"name": "Room 1", "datacenter_floor_id": floor.id})
    s1 = await crud.create_item(session, models.Section, {"name": "Sec A", "room_id": room.id})
    s2 = await crud.create_item(session, models.Section, {"name": "Sec B", "room_id": room.id})
    assert s1.code == "S1"
    assert s2.code == "S2"


async def test_floor_prefix_falls_back_to_datacenter_id_when_code_is_unset(session):
    # Two datacenters with NO code set — the numeric-id fallback must still
    # keep both floors' generated codes globally unique (this exact
    # scenario broke the naive bare-"F{n}" version against the real
    # Abbreviation_Registry).
    dc1 = await crud.create_item(session, models.Datacenter, {"name": "Alpha"})
    dc2 = await crud.create_item(session, models.Datacenter, {"name": "Beta"})
    f1 = await crud.create_item(session, models.DatacenterFloor, {"name": "Ground", "datacenter_id": dc1.id})
    f2 = await crud.create_item(session, models.DatacenterFloor, {"name": "Ground", "datacenter_id": dc2.id})
    assert f1.code != f2.code
    assert f1.code == f"DC{dc1.id}-F1"
    assert f2.code == f"DC{dc2.id}-F1"


async def test_naming_mode_manual_leaves_code_untouched(session):
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1"})
    floor = await crud.create_item(
        session,
        models.DatacenterFloor,
        {"name": "F", "datacenter_id": dc.id, "naming_mode": "manual", "code": "CUSTOM"},
    )
    assert floor.code == "CUSTOM"


async def test_section_naming_mode_manual_leaves_code_untouched(session):
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1"})
    floor = await crud.create_item(session, models.DatacenterFloor, {"name": "F", "datacenter_id": dc.id})
    room = await crud.create_item(session, models.Room, {"name": "Room 1", "datacenter_floor_id": floor.id})
    section = await crud.create_item(
        session,
        models.Section,
        {"name": "Sec", "room_id": room.id, "naming_mode": "manual", "code": "CUSTOM-S"},
    )
    assert section.code == "CUSTOM-S"


async def test_naming_mode_check_constraint_rejects_invalid_value(session):
    import pytest
    from sqlalchemy.exc import IntegrityError

    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1"})
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.DatacenterFloor,
            {"name": "Bad", "datacenter_id": dc.id, "naming_mode": "bogus"},
        )
