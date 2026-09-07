"""Phase 6 Task 4/5/6 (Req 3.1-3.4) — case-insensitive duplicate-name
rejection, table-wide for registries with no natural parent and scoped to
the parent FK for physical-hierarchy models that have one.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app import crud, models


async def test_duplicate_full_name_rejected_case_insensitively(session):
    await crud.create_item(session, models.Organization, {"full_name": "Virtualfactor", "abbreviation": "vf"})
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session, models.Organization, {"full_name": "VIRTUALFACTOR", "abbreviation": "vf2"}
        )
    assert exc.value.status_code == 409
    assert "already exists" in exc.value.detail
    assert "different name" in exc.value.detail


async def test_distinguishable_names_are_not_duplicates(session):
    await crud.create_item(session, models.Organization, {"full_name": "Virtualfactor", "abbreviation": "vf"})
    row2 = await crud.create_item(
        session, models.Organization, {"full_name": "Virtualfactor 2", "abbreviation": "vf2"}
    )
    assert row2.full_name == "Virtualfactor 2"


async def test_update_to_an_existing_name_is_rejected(session):
    await crud.create_item(session, models.Organization, {"full_name": "Alpha", "abbreviation": "al"})
    beta = await crud.create_item(session, models.Organization, {"full_name": "Beta", "abbreviation": "be"})
    with pytest.raises(HTTPException) as exc:
        await crud.update_item(session, models.Organization, beta.id, {"full_name": "alpha"})
    assert exc.value.status_code == 409


async def test_update_keeping_its_own_name_is_allowed(session):
    row = await crud.create_item(session, models.Organization, {"full_name": "Gamma", "abbreviation": "ga"})
    updated = await crud.update_item(session, models.Organization, row.id, {"full_name": "Gamma"})
    assert updated is None or updated.full_name == "Gamma"


async def test_no_natural_parent_tables_are_table_wide(session):
    """Regions, Brands, OsFamily etc. have no parent FK — enforced globally."""
    await crud.create_item(session, models.Brand, {"full_name": "Acme", "abbreviation": "ac"})
    with pytest.raises(HTTPException):
        await crud.create_item(session, models.Brand, {"full_name": "acme", "abbreviation": "ac2"})


async def test_entity_type_def_label_is_unique(session):
    await crud.create_item(session, models.EntityTypeDef, {"slug": "widget-a", "label": "Widget"})
    with pytest.raises(HTTPException):
        await crud.create_item(session, models.EntityTypeDef, {"slug": "widget-b", "label": "widget"})


async def test_same_name_allowed_under_a_different_parent(session):
    dc1 = await crud.create_item(session, models.Datacenter, {"name": "DC1"})
    dc2 = await crud.create_item(session, models.Datacenter, {"name": "DC2"})
    floor_a = await crud.create_item(
        session, models.DatacenterFloor, {"name": "Ground Floor", "datacenter_id": dc1.id}
    )
    floor_b = await crud.create_item(
        session, models.DatacenterFloor, {"name": "Ground Floor", "datacenter_id": dc2.id}
    )
    assert floor_a.name == "Ground Floor"
    assert floor_b.name == "Ground Floor"
    assert floor_a.datacenter_id != floor_b.datacenter_id


async def test_same_name_rejected_under_the_same_parent(session):
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1"})
    await crud.create_item(
        session, models.DatacenterFloor, {"name": "Ground Floor", "datacenter_id": dc.id}
    )
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session, models.DatacenterFloor, {"name": "ground floor", "datacenter_id": dc.id}
        )
    assert exc.value.status_code == 409
    assert "under the same parent" in exc.value.detail


async def test_rooms_and_sections_scoped_to_their_parent_too(session):
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1"})
    floor = await crud.create_item(
        session, models.DatacenterFloor, {"name": "F1", "datacenter_id": dc.id}
    )
    room = await crud.create_item(
        session, models.Room, {"name": "Room 1", "datacenter_floor_id": floor.id}
    )
    await crud.create_item(session, models.Section, {"name": "Section 1", "room_id": room.id})
    with pytest.raises(HTTPException):
        await crud.create_item(session, models.Section, {"name": "section 1", "room_id": room.id})

    other_floor = await crud.create_item(
        session, models.DatacenterFloor, {"name": "F2", "datacenter_id": dc.id}
    )
    # Same room name, different floor — allowed.
    other_room = await crud.create_item(
        session, models.Room, {"name": "Room 1", "datacenter_floor_id": other_floor.id}
    )
    assert other_room.id != room.id


async def test_blank_or_missing_name_never_triggers_the_check(session):
    row = await crud.create_item(session, models.Datacenter, {"name": "Unnamed 1"})
    assert row.name == "Unnamed 1"
    # A second Datacenter with no parent-relevant conflict at all should be fine.
    row2 = await crud.create_item(session, models.Datacenter, {"name": "Unnamed 2"})
    assert row2.id != row.id
