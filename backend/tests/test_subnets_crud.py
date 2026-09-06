"""Phase 5 Task 4 — Subnets CRUD.

The backend already exposed full CRUD for subnets-ipv4/ipv6 before this task
(only the frontend was a read-only dead end); this test locks in the one
behavior the frontend migration depends on: deleting a subnet that still has
IP assignments referencing it must not silently orphan those assignments.
There is no ``ondelete=CASCADE`` on ``ip_assignments.subnet_ipv4_id`` /
``subnet_ipv6_id``, so Postgres's default FK RESTRICT should reject the
delete outright.
"""
from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import crud, models


async def test_create_update_delete_subnet_ipv4(session):
    subnet = await crud.create_item(
        session, models.SubnetIpv4, {"description": "test subnet", "network_cidr": "10.10.0.0/24"}
    )
    assert subnet.id is not None

    updated = await crud.update_item(
        session, models.SubnetIpv4, subnet.id, {"reserved_count": 5}
    )
    assert updated.reserved_count == 5

    ok = await crud.delete_item(session, models.SubnetIpv4, subnet.id)
    assert ok is True
    assert await session.get(models.SubnetIpv4, subnet.id) is None


async def test_delete_subnet_with_ip_assignment_does_not_orphan_it(session, db_engine):
    subnet = await crud.create_item(
        session, models.SubnetIpv4, {"network_cidr": "10.20.0.0/24"}
    )
    assignment = await crud.create_item(
        session,
        models.IpAssignment,
        {"subnet_ipv4_id": subnet.id, "ipv4_address": "10.20.0.5"},
    )
    # Capture plain ids before the delete attempt — once it fails, this
    # session's transaction is dead and even *reading* an attribute off
    # `subnet`/`assignment` would try to refresh from it and raise
    # PendingRollbackError.
    subnet_id, assignment_id = subnet.id, assignment.id

    with pytest.raises(IntegrityError):
        await crud.delete_item(session, models.SubnetIpv4, subnet_id)

    # Verify from a brand-new session/connection rather than continuing to
    # use the one whose transaction just aborted — the failed delete was
    # rolled back at the database level, so a fresh read proves neither row
    # was actually touched (the subnet survives and the assignment still
    # points at it, rather than being left dangling).
    Maker = async_sessionmaker(bind=db_engine, class_=AsyncSession, expire_on_commit=False)
    async with Maker() as fresh:
        surviving_subnet = await fresh.get(models.SubnetIpv4, subnet_id)
        surviving_assignment = await fresh.get(models.IpAssignment, assignment_id)
    assert surviving_subnet is not None
    assert surviving_assignment is not None
    assert surviving_assignment.subnet_ipv4_id == subnet_id
