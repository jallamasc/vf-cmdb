"""Phase 5 Task 14 — field_type_defs: model + seed of 6 builtin storage kinds.

The migration's seed step only runs once at `alembic upgrade head` time, not
per test (the test DB is built straight from the current ORM metadata via
`drop_all`/`create_all`, see conftest.py), so these tests seed the same 6
rows directly and assert the model/constraints behave as the migration
expects, rather than re-running the migration's own SQL.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app import crud, models

BUILTIN_ROWS = [
    ("text", "Text", "text"),
    ("number", "Number", "number"),
    ("boolean", "Boolean", "boolean"),
    ("date", "Date", "date"),
    ("reference", "Reference", "reference"),
    ("file", "File", "file"),
]


async def test_seed_shape_matches_the_six_storage_kinds(session):
    for slug, label, storage_kind in BUILTIN_ROWS:
        row = await crud.create_item(
            session,
            models.FieldTypeDef,
            {"slug": slug, "label": label, "storage_kind": storage_kind, "builtin": True},
        )
        assert row.builtin is True
        assert row.storage_kind == storage_kind


async def test_slug_is_unique(session):
    await crud.create_item(
        session,
        models.FieldTypeDef,
        {"slug": "mac-address", "label": "MAC Address", "storage_kind": "text"},
    )
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.FieldTypeDef,
            {"slug": "mac-address", "label": "Duplicate", "storage_kind": "text"},
        )


async def test_storage_kind_is_constrained_to_the_fixed_set(session):
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.FieldTypeDef,
            {"slug": "bogus", "label": "Bogus", "storage_kind": "not-a-real-kind"},
        )


async def test_builtin_field_type_cannot_be_deleted(session):
    row = await crud.create_item(
        session,
        models.FieldTypeDef,
        {"slug": "text", "label": "Text", "storage_kind": "text", "builtin": True},
    )
    with pytest.raises(HTTPException) as exc:
        await crud.delete_item(session, models.FieldTypeDef, row.id)
    assert exc.value.status_code == 400
    assert await session.get(models.FieldTypeDef, row.id) is not None


async def test_non_builtin_field_type_can_be_deleted(session):
    row = await crud.create_item(
        session,
        models.FieldTypeDef,
        {"slug": "mac-address", "label": "MAC Address", "storage_kind": "text"},
    )
    ok = await crud.delete_item(session, models.FieldTypeDef, row.id)
    assert ok is True
    assert await session.get(models.FieldTypeDef, row.id) is None


async def test_named_type_can_be_added_on_top_of_a_builtin_storage_kind(session):
    """An admin-added named type ('MAC Address') resolving to the same
    'text' storage kind an existing builtin uses — confirms named types
    aren't limited to one-per-storage-kind."""
    await crud.create_item(
        session,
        models.FieldTypeDef,
        {"slug": "text", "label": "Text", "storage_kind": "text", "builtin": True},
    )
    mac = await crud.create_item(
        session,
        models.FieldTypeDef,
        {"slug": "mac-address", "label": "MAC Address", "storage_kind": "text"},
    )
    assert mac.storage_kind == "text"
    assert mac.builtin is False
