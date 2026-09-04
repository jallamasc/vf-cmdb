"""FEAT-6 (6C) — Cable label generation + validation.

Feature: rack-back-and-cabling
Covers Requirements 9 (auto Cable_Label), 8.4/8.5/8.6 (A/B mapping + cable_type),
8.7 (self-connect), 11 (changelog).
"""
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app import crud, models


@pytest.mark.asyncio
async def test_cable_label_generated_and_regenerated(session):
    """Property 4: label == {fromName}-{a}→{toName}-{b}, regenerated on update."""
    nd = await crud.create_item(session, models.NetworkDevice, {})
    ps = await crud.create_item(session, models.PhysicalServer, {})
    # Give recognizable names for the label.
    nd_row = await session.get(models.NetworkDevice, nd.id)
    nd_row.vf_long_name = "SW1"
    ps_row = await session.get(models.PhysicalServer, ps.id)
    ps_row.vf_long_name = "SRV1"
    await session.commit()

    cable = await crud.create_item(
        session,
        models.Cable,
        {
            "cable_type": "copper",
            "port_a_type": "network-devices",
            "port_a_id": nd.id,
            "port_b_type": "physical-servers",
            "port_b_id": ps.id,
            "label_a": "e0",
            "label_b": "nic1",
            "label": "IGNORED",  # computed — must be ignored
        },
    )
    assert cable.label == "SW1-e0→SRV1-nic1"

    updated = await crud.update_item(
        session, models.Cable, cable.id, {"label_b": "nic2"}
    )
    assert updated.label == "SW1-e0→SRV1-nic2"


@pytest.mark.asyncio
async def test_invalid_cable_type_rejected(session):
    """Req 8.6: cable_type outside the allowed set -> 422."""
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.Cable,
            {"cable_type": "laser", "port_a_type": "network-devices", "port_a_id": 1},
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_self_connect_rejected(session):
    """Req 8.7: a cable cannot connect a port to itself -> 400."""
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.Cable,
            {
                "cable_type": "copper",
                "port_a_type": "network-devices",
                "port_a_id": 5,
                "port_b_type": "Network-Devices",  # case-insensitive match
                "port_b_id": 5,
            },
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_cable_writes_changelog(session):
    """Req 11: create/update/delete each record changelog rows for the cable."""
    cable = await crud.create_item(
        session,
        models.Cable,
        {"cable_type": "patchcord", "port_a_type": "network-devices", "port_a_id": 1},
    )
    await crud.update_item(session, models.Cable, cable.id, {"media_type": "cat6"})
    await crud.delete_item(session, models.Cable, cable.id)
    rows = (
        await session.execute(
            select(models.ChangeLog).where(models.ChangeLog.table_name == "cables")
        )
    ).scalars().all()
    # At least: create fields + one update + one delete marker.
    assert any(r.field_name == "__deleted__" for r in rows)
    assert len(rows) >= 3
