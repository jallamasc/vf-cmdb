"""Phase 6 Task 39 (Requirement 14) — IP_Auto_Sync: create/update/delete of
a hardcoded device's own IP-bearing column(s) mirrors a matching polymorphic
IpAssignment row (auto_generated=True), keyed by
(assigned_to_type, assigned_to_id, interface_name).

Goes through the public `crud.create_item`/`update_item`/`delete_item` path
(not the module directly) since that's how the hook is actually reached in
production, and it also exercises the changelog ("auto_sync" source).
"""
from sqlalchemy import select

import pytest

from app import crud, models


async def _find(session, assigned_to_type, assigned_to_id, interface_name=None):
    stmt = select(models.IpAssignment).where(
        models.IpAssignment.assigned_to_type == assigned_to_type,
        models.IpAssignment.assigned_to_id == assigned_to_id,
    )
    if interface_name is not None:
        stmt = stmt.where(models.IpAssignment.interface_name == interface_name)
    return (await session.execute(stmt)).scalars().all()


@pytest.mark.asyncio
async def test_create_with_management_ip_creates_an_assignment(session):
    nd = await crud.create_item(
        session, models.NetworkDevice, {"management_ipv4": "10.1.1.5"}
    )
    rows = await _find(session, "network-devices", nd.id, "management")
    assert len(rows) == 1
    assert str(rows[0].ipv4_address) == "10.1.1.5"
    assert rows[0].is_primary is True
    assert rows[0].auto_generated is True
    assert rows[0].status == "active"


@pytest.mark.asyncio
async def test_create_with_no_ip_creates_nothing(session):
    nd = await crud.create_item(session, models.NetworkDevice, {})
    rows = await _find(session, "network-devices", nd.id)
    assert rows == []


@pytest.mark.asyncio
async def test_update_changes_the_existing_assignment_not_a_new_one(session):
    nd = await crud.create_item(
        session, models.NetworkDevice, {"management_ipv4": "10.1.1.5"}
    )
    await crud.update_item(session, models.NetworkDevice, nd.id, {"management_ipv4": "10.1.1.9"})
    rows = await _find(session, "network-devices", nd.id, "management")
    assert len(rows) == 1
    assert str(rows[0].ipv4_address) == "10.1.1.9"


@pytest.mark.asyncio
async def test_update_clearing_the_ip_removes_the_assignment(session):
    nd = await crud.create_item(
        session, models.NetworkDevice, {"management_ipv4": "10.1.1.5"}
    )
    await crud.update_item(session, models.NetworkDevice, nd.id, {"management_ipv4": None})
    rows = await _find(session, "network-devices", nd.id, "management")
    assert rows == []


@pytest.mark.asyncio
async def test_update_setting_the_ip_later_creates_the_assignment(session):
    nd = await crud.create_item(session, models.NetworkDevice, {})
    await crud.update_item(session, models.NetworkDevice, nd.id, {"management_ipv4": "10.1.1.5"})
    rows = await _find(session, "network-devices", nd.id, "management")
    assert len(rows) == 1
    assert str(rows[0].ipv4_address) == "10.1.1.5"


@pytest.mark.asyncio
async def test_delete_removes_the_assignment(session):
    nd = await crud.create_item(
        session, models.NetworkDevice, {"management_ipv4": "10.1.1.5"}
    )
    await crud.delete_item(session, models.NetworkDevice, nd.id)
    rows = await _find(session, "network-devices", nd.id, "management")
    assert rows == []


@pytest.mark.asyncio
async def test_physical_server_gets_two_roles_management_and_ilo_ipmi(session):
    ps = await crud.create_item(
        session,
        models.PhysicalServer,
        {"management_ipv4": "10.2.0.1", "ilo_ipmi_ipv4": "10.2.9.1"},
    )
    mgmt = await _find(session, "physical-servers", ps.id, "management")
    ilo = await _find(session, "physical-servers", ps.id, "ilo_ipmi")
    assert len(mgmt) == 1 and str(mgmt[0].ipv4_address) == "10.2.0.1" and mgmt[0].is_primary is True
    assert len(ilo) == 1 and str(ilo[0].ipv4_address) == "10.2.9.1" and ilo[0].is_primary is False


@pytest.mark.asyncio
async def test_physical_server_dual_stack_management_role_carries_both_addresses(session):
    ps = await crud.create_item(
        session,
        models.PhysicalServer,
        {"management_ipv4": "10.2.0.1", "management_ipv6": "fd00::1"},
    )
    rows = await _find(session, "physical-servers", ps.id, "management")
    assert len(rows) == 1
    assert str(rows[0].ipv4_address) == "10.2.0.1"
    assert str(rows[0].ipv6_address) == "fd00::1"


@pytest.mark.asyncio
async def test_container_app_uses_the_app_role(session):
    ps = await crud.create_item(session, models.PhysicalServer, {})
    ca = await crud.create_item(
        session,
        models.ContainerApp,
        {"host_server_id": ps.id, "ipv4_address": "10.9.9.9"},
    )
    rows = await _find(session, "containers-apps", ca.id, "app")
    assert len(rows) == 1
    assert str(rows[0].ipv4_address) == "10.9.9.9"


@pytest.mark.asyncio
async def test_manually_created_assignment_is_never_touched(session):
    """A manually-created (non-auto_generated) IpAssignment row that happens
    to share the same (assigned_to_type, assigned_to_id, interface_name) is
    left alone: the sync creates its OWN row alongside it rather than
    adopting/overwriting/deleting the manual one."""
    nd = await crud.create_item(session, models.NetworkDevice, {})
    manual = await crud.create_item(
        session,
        models.IpAssignment,
        {
            "assigned_to_type": "network-devices",
            "assigned_to_id": nd.id,
            "interface_name": "management",
            "ipv4_address": "10.5.5.5",
        },
    )
    assert manual.auto_generated is False

    await crud.update_item(session, models.NetworkDevice, nd.id, {"management_ipv4": "10.1.1.5"})
    rows = await _find(session, "network-devices", nd.id, "management")
    assert len(rows) == 2
    autos = [r for r in rows if r.auto_generated]
    manuals = [r for r in rows if not r.auto_generated]
    assert len(autos) == 1 and str(autos[0].ipv4_address) == "10.1.1.5"
    assert len(manuals) == 1 and str(manuals[0].ipv4_address) == "10.5.5.5"

    # Clearing the device's own field removes only the auto-generated row.
    await crud.update_item(session, models.NetworkDevice, nd.id, {"management_ipv4": None})
    rows = await _find(session, "network-devices", nd.id, "management")
    assert len(rows) == 1
    assert rows[0].id == manual.id


@pytest.mark.asyncio
async def test_changelog_records_auto_sync_source(session):
    nd = await crud.create_item(
        session, models.NetworkDevice, {"management_ipv4": "10.1.1.5"}
    )
    rows = await _find(session, "network-devices", nd.id, "management")
    changes = await crud.list_items(session, models.ChangeLog, limit=100)
    matching = [
        c for c in changes
        if c.table_name == "ip_assignments" and c.record_id == rows[0].id
    ]
    assert matching, "expected a ChangeLog row for the auto-created assignment"
    assert all(c.change_source == "auto_sync" for c in matching)
