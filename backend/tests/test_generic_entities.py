"""Phase 5 Task 18 — generic_entities: the record store for admin-defined
Entity_Type_Defs.

`attributes` is a JSONB object keyed by each EntityFieldDef's `key`,
validated at the application layer as an object (not e.g. a list) in
`crud._validate_generic_entity`. Per-field/required-field validation against
the owning Entity_Type_Def's fields belongs to the generic form layer
(Task 20), not this table's own CRUD layer.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app import crud, models


async def _make_entity_type(session, slug="widget", capabilities=None):
    return await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": slug, "label": slug.title(), "capabilities": capabilities or []},
    )


async def test_create_round_trips_attributes(session):
    et = await _make_entity_type(session)
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": et.id, "attributes": {"color": "black", "brand": "Dell"}},
    )
    assert row.entity_type_id == et.id
    assert row.attributes == {"color": "black", "brand": "Dell"}

    fetched = await session.get(models.GenericEntity, row.id)
    assert fetched.attributes == {"color": "black", "brand": "Dell"}


async def test_attributes_defaults_to_empty_dict_when_omitted(session):
    et = await _make_entity_type(session)
    row = await crud.create_item(session, models.GenericEntity, {"entity_type_id": et.id})
    assert row.attributes == {}


async def test_non_object_attributes_is_rejected(session):
    et = await _make_entity_type(session)
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.GenericEntity,
            {"entity_type_id": et.id, "attributes": ["not", "an", "object"]},
        )
    assert exc.value.status_code == 422


async def test_invalid_entity_type_id_is_rejected(session):
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.GenericEntity,
            {"entity_type_id": 999999, "attributes": {}},
        )


async def test_rack_placement_fields_round_trip(session):
    """Even without a real Rack fixture, the plain rack_unit column (no FK)
    round-trips; rack_id itself is exercised together with a real Rack in
    the Task 21 capability-integration tests."""
    et = await _make_entity_type(session, capabilities=["rack_placement"])
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": et.id, "attributes": {}, "rack_unit": 12},
    )
    assert row.rack_unit == 12
    assert row.rack_id is None


async def test_update_replaces_attributes(session):
    et = await _make_entity_type(session)
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": et.id, "attributes": {"color": "black"}},
    )
    updated = await crud.update_item(
        session, models.GenericEntity, row.id, {"attributes": {"color": "white"}}
    )
    assert updated.attributes == {"color": "white"}


async def test_delete_removes_the_row(session):
    et = await _make_entity_type(session)
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    ok = await crud.delete_item(session, models.GenericEntity, row.id)
    assert ok is True
    assert await session.get(models.GenericEntity, row.id) is None
