"""Phase 4 Task 26 — Cable_Sync_Service (Requirement 20).

Feature: phase-4-ux-graphical-views. Covers Requirement 20.1 (create/update on
set), 20.2 (delete on clear, only if auto-generated), 20.3 (never touch a
manually-created cable).
"""
import pytest
from sqlalchemy import select

from app import crud, models


async def _topology(session):
    """SW-A (network device) with one interface, SRV-B (physical server)."""
    nd = await crud.create_item(session, models.NetworkDevice, {"vf_long_name": "SW-A"})
    ps = await crud.create_item(session, models.PhysicalServer, {"vf_long_name": "SRV-B"})
    return nd, ps


@pytest.mark.asyncio
async def test_create_on_set(session):
    """20.1 — setting connected-* fields on CREATE auto-creates a Cable."""
    nd, ps = await _topology(session)
    iface = await crud.create_item(
        session,
        models.DeviceInterface,
        {
            "network_device_id": nd.id,
            "port_number": 1,
            "description": "uplink",
            "connected_device_type": "physical-servers",
            "connected_device_id": ps.id,
            "connected_port": "nic1",
        },
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    assert len(cables) == 1
    cable = cables[0]
    assert cable.auto_generated is True
    assert cable.port_a_type == "network-devices"
    assert cable.port_a_id == nd.id
    assert cable.port_b_type == "physical-servers"
    assert cable.port_b_id == ps.id
    assert cable.label_a == "uplink"
    assert cable.label_b == "nic1"
    assert cable.label  # naming.generate_cable ran


@pytest.mark.asyncio
async def test_no_cable_when_not_connected(session):
    """Baseline: an interface with no connected-* fields creates no Cable."""
    nd, _ps = await _topology(session)
    await crud.create_item(
        session,
        models.DeviceInterface,
        {"network_device_id": nd.id, "port_number": 5, "description": "spare"},
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    assert cables == []


@pytest.mark.asyncio
async def test_update_on_change(session):
    """20.1 — setting connected-* fields on UPDATE creates the Cable, and a
    later change to the far end UPDATES the same Cable row (not a new one)."""
    nd, ps = await _topology(session)
    iface = await crud.create_item(
        session,
        models.DeviceInterface,
        {"network_device_id": nd.id, "port_number": 2, "description": "e0"},
    )
    assert (await session.execute(select(models.Cable))).scalars().all() == []

    await crud.update_item(
        session,
        models.DeviceInterface,
        iface.id,
        {
            "connected_device_type": "physical-servers",
            "connected_device_id": ps.id,
            "connected_port": "nic1",
        },
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    assert len(cables) == 1
    cable_id = cables[0].id
    assert cables[0].label_b == "nic1"

    # Change the far-end port label — must UPDATE the same row.
    await crud.update_item(
        session, models.DeviceInterface, iface.id, {"connected_port": "nic2"}
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    assert len(cables) == 1
    assert cables[0].id == cable_id
    assert cables[0].label_b == "nic2"


@pytest.mark.asyncio
async def test_rename_keeps_the_same_cable_in_sync(session):
    """Renaming the interface's own label (description) must update the
    EXISTING auto-generated cable's label_a, not orphan it + create a
    duplicate under the new label."""
    nd, ps = await _topology(session)
    iface = await crud.create_item(
        session,
        models.DeviceInterface,
        {
            "network_device_id": nd.id,
            "port_number": 3,
            "description": "old-name",
            "connected_device_type": "physical-servers",
            "connected_device_id": ps.id,
            "connected_port": "nic1",
        },
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    assert len(cables) == 1
    cable_id = cables[0].id
    assert cables[0].label_a == "old-name"

    await crud.update_item(
        session, models.DeviceInterface, iface.id, {"description": "new-name"}
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    assert len(cables) == 1  # still exactly one — no orphan/duplicate
    assert cables[0].id == cable_id
    assert cables[0].label_a == "new-name"


@pytest.mark.asyncio
async def test_clear_on_null_deletes_auto_generated_cable(session):
    """20.2 — clearing connected-* fields deletes the auto-generated Cable."""
    nd, ps = await _topology(session)
    iface = await crud.create_item(
        session,
        models.DeviceInterface,
        {
            "network_device_id": nd.id,
            "port_number": 4,
            "description": "e1",
            "connected_device_type": "physical-servers",
            "connected_device_id": ps.id,
            "connected_port": "nic1",
        },
    )
    assert len((await session.execute(select(models.Cable))).scalars().all()) == 1

    await crud.update_item(
        session,
        models.DeviceInterface,
        iface.id,
        {"connected_device_type": None, "connected_device_id": None, "connected_port": None},
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    assert cables == []


@pytest.mark.asyncio
async def test_manual_cable_never_touched(session):
    """20.3 — a manually-created cable describing the SAME two ports is never
    modified or deleted by the sync hook, even when the interface's own
    auto-generated cable is created and later cleared."""
    nd, ps = await _topology(session)

    manual_cable = await crud.create_item(
        session,
        models.Cable,
        {
            "cable_type": "copper",
            "port_a_type": "network-devices",
            "port_a_id": nd.id,
            "port_b_type": "physical-servers",
            "port_b_id": ps.id,
            "label_a": "e2",
            "label_b": "nic1",
        },
    )
    assert manual_cable.auto_generated is False

    iface = await crud.create_item(
        session,
        models.DeviceInterface,
        {
            "network_device_id": nd.id,
            "port_number": 6,
            "description": "e2",  # same label_a as the manual cable, on purpose
            "connected_device_type": "physical-servers",
            "connected_device_id": ps.id,
            "connected_port": "nic1",
        },
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    # The manual cable is untouched AND a distinct auto-generated one exists.
    assert len(cables) == 2
    auto = [c for c in cables if c.auto_generated]
    manual = [c for c in cables if not c.auto_generated]
    assert len(auto) == 1
    assert len(manual) == 1
    assert manual[0].id == manual_cable.id
    assert manual[0].label_a == "e2"  # unchanged

    # Clearing the interface's connection must delete ONLY the auto one.
    await crud.update_item(
        session,
        models.DeviceInterface,
        iface.id,
        {"connected_device_type": None, "connected_device_id": None, "connected_port": None},
    )
    remaining = (await session.execute(select(models.Cable))).scalars().all()
    assert len(remaining) == 1
    assert remaining[0].id == manual_cable.id
    assert remaining[0].auto_generated is False


@pytest.mark.asyncio
async def test_interface_with_no_resolvable_owner_is_a_no_op(session):
    """An interface with neither owner_device_* nor network_device_id set has
    no owner to attach a Cable to — the hook must not error, just skip."""
    _nd, ps = await _topology(session)
    await crud.create_item(
        session,
        models.DeviceInterface,
        {
            "connected_device_type": "physical-servers",
            "connected_device_id": ps.id,
            "connected_port": "nic1",
        },
    )
    cables = (await session.execute(select(models.Cable))).scalars().all()
    assert cables == []
