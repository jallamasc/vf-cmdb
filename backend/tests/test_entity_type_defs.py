"""Phase 5 Task 16 — entity_type_defs: capability model.

``capabilities`` is a JSONB array of strings drawn from the fixed
``models.CAPABILITY_VALUES`` set, validated at the application layer
(``crud._validate_entity_type_def``) rather than a DB CHECK constraint,
since Postgres has no cheap way to constrain "every element of this JSON
array is one of N strings".
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app import crud, models


async def test_create_with_valid_capabilities_round_trips(session):
    row = await crud.create_item(
        session,
        models.EntityTypeDef,
        {
            "slug": "monitor",
            "label": "Monitor",
            "icon": "monitor",
            "capabilities": ["photo", "power_ports"],
            "notes": "A display, not a server.",
        },
    )
    assert row.slug == "monitor"
    assert row.capabilities == ["photo", "power_ports"]

    fetched = await session.get(models.EntityTypeDef, row.id)
    assert fetched is not None
    assert fetched.capabilities == ["photo", "power_ports"]


async def test_capabilities_defaults_to_empty_list_when_omitted(session):
    row = await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": "placeholder", "label": "Placeholder"},
    )
    assert row.capabilities == []


async def test_unknown_capability_is_rejected(session):
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.EntityTypeDef,
            {
                "slug": "bogus",
                "label": "Bogus",
                "capabilities": ["photo", "not_a_real_capability"],
            },
        )
    assert exc.value.status_code == 422
    assert "not_a_real_capability" in exc.value.detail


async def test_non_list_capabilities_is_rejected(session):
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.EntityTypeDef,
            {"slug": "bad-shape", "label": "Bad Shape", "capabilities": "photo"},
        )
    assert exc.value.status_code == 422


async def test_slug_is_unique(session):
    await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": "monitor", "label": "Monitor"},
    )
    with pytest.raises(IntegrityError):
        await crud.create_item(
            session,
            models.EntityTypeDef,
            {"slug": "monitor", "label": "Duplicate Monitor"},
        )


async def test_all_fixed_capability_values_are_individually_accepted(session):
    for cap in models.CAPABILITY_VALUES:
        row = await crud.create_item(
            session,
            models.EntityTypeDef,
            {"slug": f"cap-{cap}", "label": f"Cap {cap}", "capabilities": [cap]},
        )
        assert row.capabilities == [cap]
