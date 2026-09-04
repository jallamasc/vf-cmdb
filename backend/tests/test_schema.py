"""FEAT-6 schema — the 0006 columns exist and behave as designed.

Feature: rack-back-and-cabling
Covers Requirement 6 (polymorphic ports, nullable network_device_id), 3 (stencil_url),
9 (cables.label). The live Alembic 0006 upgrade/backfill was verified separately
against Postgres; here we assert the resulting shape the app depends on.
"""
import pytest
from sqlalchemy import inspect


@pytest.mark.asyncio
async def test_feat6_columns_present(session, db_engine):
    engine = db_engine

    def _cols(conn):
        insp = inspect(conn)
        return {
            "device_interfaces": {c["name"]: c for c in insp.get_columns("device_interfaces")},
            "cables": {c["name"] for c in insp.get_columns("cables")},
            "network_device_types": {c["name"] for c in insp.get_columns("network_device_types")},
            "compute_device_types": {c["name"] for c in insp.get_columns("compute_device_types")},
            "storage_device_types": {c["name"] for c in insp.get_columns("storage_device_types")},
        }

    async with engine.connect() as conn:
        cols = await conn.run_sync(_cols)

    di = cols["device_interfaces"]
    assert "owner_device_type" in di and "owner_device_id" in di
    assert di["network_device_id"]["nullable"] is True  # relaxed by 0006
    assert "label" in cols["cables"]
    for t in ("network_device_types", "compute_device_types", "storage_device_types"):
        assert "stencil_url" in cols[t]


@pytest.mark.asyncio
async def test_non_network_device_can_own_interface(session):
    """A physical server can own a data port (nullable network_device_id)."""
    from app import crud, models

    ps = await crud.create_item(session, models.PhysicalServer, {})
    iface = models.DeviceInterface(
        owner_device_type="physical-servers",
        owner_device_id=ps.id,
        description="nic0",
    )
    session.add(iface)
    await session.commit()
    got = await session.get(models.DeviceInterface, iface.id)
    assert got.network_device_id is None
    assert got.owner_device_type == "physical-servers"
    assert got.owner_device_id == ps.id
