"""Phase 5 Task 32 (Req 26.1/26.2) — dual IP assignment (usage + management).

A Generic_Entity whose Entity_Type_Def carries the ip_assignment Capability
must have BOTH `ip_id` (usage) and `management_ip_id` linked, on every
create and update. This is the first Capability this app actually enforces
at the CRUD layer — every other one (rack_placement, photo, ...) only gates
frontend UI, never a requirement server-side.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app import crud, models


async def _make_entity_type(session, slug="widget", capabilities=None):
    return await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": slug, "label": slug.title(), "capabilities": capabilities or []},
    )


async def _make_ip(session, ipv4="10.0.0.5"):
    return await crud.create_item(
        session, models.IpAssignment, {"ipv4_address": ipv4, "status": "active"}
    )


async def test_creation_without_either_ip_is_rejected(session):
    et = await _make_entity_type(session, capabilities=["ip_assignment"])
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
        )
    assert exc.value.status_code == 422
    assert "usage IP" in exc.value.detail
    assert "management IP" in exc.value.detail


async def test_creation_with_only_usage_ip_is_rejected(session):
    et = await _make_entity_type(session, capabilities=["ip_assignment"])
    usage = await _make_ip(session, "10.0.0.5")
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.GenericEntity,
            {"entity_type_id": et.id, "attributes": {}, "ip_id": usage.id},
        )
    assert exc.value.status_code == 422
    assert "management IP" in exc.value.detail


async def test_creation_with_only_management_ip_is_rejected(session):
    et = await _make_entity_type(session, capabilities=["ip_assignment"])
    management = await _make_ip(session, "10.0.1.5")
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.GenericEntity,
            {
                "entity_type_id": et.id,
                "attributes": {},
                "management_ip_id": management.id,
            },
        )
    assert exc.value.status_code == 422
    assert "usage IP" in exc.value.detail


async def test_creation_with_both_ips_links_correctly(session):
    et = await _make_entity_type(session, capabilities=["ip_assignment"])
    usage = await _make_ip(session, "10.0.0.5")
    management = await _make_ip(session, "10.0.1.5")
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {
            "entity_type_id": et.id,
            "attributes": {},
            "ip_id": usage.id,
            "management_ip_id": management.id,
        },
    )
    assert row.ip_id == usage.id
    assert row.management_ip_id == management.id


async def test_ip_assignment_not_required_without_the_capability(session):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert row.ip_id is None
    assert row.management_ip_id is None


async def test_update_that_would_strip_one_ip_is_rejected(session):
    et = await _make_entity_type(session, capabilities=["ip_assignment"])
    usage = await _make_ip(session, "10.0.0.5")
    management = await _make_ip(session, "10.0.1.5")
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {
            "entity_type_id": et.id,
            "attributes": {},
            "ip_id": usage.id,
            "management_ip_id": management.id,
        },
    )
    with pytest.raises(HTTPException) as exc:
        await crud.update_item(
            session, models.GenericEntity, row.id, {"management_ip_id": None}
        )
    assert exc.value.status_code == 422


async def test_update_of_an_unrelated_field_still_requires_both_ips_present(session):
    """Once the capability is on, the invariant holds on every subsequent
    update too — not just the initial create."""
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    # Simulate the Entity_Type_Def acquiring the capability after this row
    # already existed, then attempt an unrelated update on the row.
    await crud.update_item(
        session, models.EntityTypeDef, et.id, {"capabilities": ["ip_assignment"]}
    )
    with pytest.raises(HTTPException) as exc:
        await crud.update_item(
            session, models.GenericEntity, row.id, {"attributes": {"note": "x"}}
        )
    assert exc.value.status_code == 422
