"""Phase 5 Task 24 — field_visibility_overrides (Req 20.1/20.2).

The absence of a row for an (entity_slug, field_key) pair means "visible" —
these tests cover the row itself (create/uniqueness/defaults); the actual
column-hiding behavior is exercised on the frontend (NetworkDevices.tsx +
lib/columns.tsx's useFieldVisibility, see NetworkDevices.test.tsx).
"""
from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app import crud, models


async def test_create_round_trips(session):
    row = await crud.create_item(
        session,
        models.FieldVisibilityOverride,
        {"entity_slug": "network-devices", "field_key": "serial_number", "visible": False},
    )
    assert row.entity_slug == "network-devices"
    assert row.field_key == "serial_number"
    assert row.visible is False


async def test_visible_defaults_to_false(session):
    row = await crud.create_item(
        session,
        models.FieldVisibilityOverride,
        {"entity_slug": "network-devices", "field_key": "notes"},
    )
    assert row.visible is False


async def test_entity_slug_and_field_key_pair_is_unique(session):
    await crud.create_item(
        session,
        models.FieldVisibilityOverride,
        {"entity_slug": "network-devices", "field_key": "serial_number", "visible": False},
    )
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.FieldVisibilityOverride,
            {"entity_slug": "network-devices", "field_key": "serial_number", "visible": True},
        )


async def test_same_field_key_allowed_on_a_different_entity_slug(session):
    row1 = await crud.create_item(
        session,
        models.FieldVisibilityOverride,
        {"entity_slug": "network-devices", "field_key": "serial_number", "visible": False},
    )
    row2 = await crud.create_item(
        session,
        models.FieldVisibilityOverride,
        {"entity_slug": "physical-servers", "field_key": "serial_number", "visible": False},
    )
    assert row1.id != row2.id


async def test_update_toggles_visibility(session):
    row = await crud.create_item(
        session,
        models.FieldVisibilityOverride,
        {"entity_slug": "network-devices", "field_key": "serial_number", "visible": False},
    )
    updated = await crud.update_item(
        session, models.FieldVisibilityOverride, row.id, {"visible": True}
    )
    assert updated.visible is True


async def test_delete_removes_the_override(session):
    row = await crud.create_item(
        session,
        models.FieldVisibilityOverride,
        {"entity_slug": "network-devices", "field_key": "serial_number", "visible": False},
    )
    ok = await crud.delete_item(session, models.FieldVisibilityOverride, row.id)
    assert ok is True
    assert await session.get(models.FieldVisibilityOverride, row.id) is None
