"""Phase 5 Task 17 — entity_field_defs: custom fields on an Entity_Type_Def.

`field_type_id` names which Field_Type_Def (and storage kind) backs the
field's values inside a Generic_Entity's `attributes` JSONB (Task 18).
`sort_order` drives display order in the generic dynamic form/grid
(Task 20). Uniqueness is enforced on (entity_type_id, key) so two fields on
the same type can't collide inside `attributes`.
"""
from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app import crud, models


async def _make_entity_type(session, slug="widget"):
    return await crud.create_item(
        session, models.EntityTypeDef, {"slug": slug, "label": slug.title()}
    )


async def _make_field_type(session, slug="text", storage_kind="text"):
    return await crud.create_item(
        session,
        models.FieldTypeDef,
        {"slug": slug, "label": slug.title(), "storage_kind": storage_kind},
    )


async def test_create_round_trips(session):
    et = await _make_entity_type(session)
    ft = await _make_field_type(session)
    row = await crud.create_item(
        session,
        models.EntityFieldDef,
        {
            "entity_type_id": et.id,
            "key": "color",
            "label": "Color",
            "field_type_id": ft.id,
            "required": True,
            "sort_order": 1,
        },
    )
    assert row.entity_type_id == et.id
    assert row.field_type_id == ft.id
    assert row.required is True
    assert row.sort_order == 1
    assert row.reference_target_type is None


async def test_required_and_sort_order_default(session):
    et = await _make_entity_type(session)
    ft = await _make_field_type(session)
    row = await crud.create_item(
        session,
        models.EntityFieldDef,
        {"entity_type_id": et.id, "key": "note", "label": "Note", "field_type_id": ft.id},
    )
    assert row.required is False
    assert row.sort_order == 0


async def test_key_is_unique_per_entity_type(session):
    et = await _make_entity_type(session)
    ft = await _make_field_type(session)
    await crud.create_item(
        session,
        models.EntityFieldDef,
        {"entity_type_id": et.id, "key": "color", "label": "Color", "field_type_id": ft.id},
    )
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.EntityFieldDef,
            {
                "entity_type_id": et.id,
                "key": "color",
                "label": "Color Again",
                "field_type_id": ft.id,
            },
        )


async def test_same_key_allowed_on_a_different_entity_type(session):
    et1 = await _make_entity_type(session, slug="widget-a")
    et2 = await _make_entity_type(session, slug="widget-b")
    ft = await _make_field_type(session)
    row1 = await crud.create_item(
        session,
        models.EntityFieldDef,
        {"entity_type_id": et1.id, "key": "color", "label": "Color", "field_type_id": ft.id},
    )
    row2 = await crud.create_item(
        session,
        models.EntityFieldDef,
        {"entity_type_id": et2.id, "key": "color", "label": "Color", "field_type_id": ft.id},
    )
    assert row1.id != row2.id
    assert row1.key == row2.key == "color"


async def test_invalid_entity_type_id_is_rejected(session):
    ft = await _make_field_type(session)
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.EntityFieldDef,
            {"entity_type_id": 999999, "key": "bogus", "label": "Bogus", "field_type_id": ft.id},
        )


async def test_invalid_field_type_id_is_rejected(session):
    et = await _make_entity_type(session)
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.EntityFieldDef,
            {"entity_type_id": et.id, "key": "bogus", "label": "Bogus", "field_type_id": 999999},
        )


async def test_reference_target_type_is_stored_when_provided(session):
    et = await _make_entity_type(session)
    ft = await _make_field_type(session, slug="reference", storage_kind="reference")
    row = await crud.create_item(
        session,
        models.EntityFieldDef,
        {
            "entity_type_id": et.id,
            "key": "owner_site",
            "label": "Owner Site",
            "field_type_id": ft.id,
            "reference_target_type": "sites",
        },
    )
    assert row.reference_target_type == "sites"
