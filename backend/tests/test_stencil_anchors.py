"""Phase 4 Task 13 — stencil_anchors table + GET /stencils/{slug}/anchors.

Feature: phase-4-ux-graphical-views. Covers Requirement 19.1, 19.3, 19.4.
"""
import pytest

from app import crud, models


@pytest.mark.asyncio
async def test_anchor_crud_round_trip(session):
    ndt = await crud.create_item(session, models.NetworkDeviceType, {
        "full_name": "48-port switch", "abbreviation": "sw48",
    })
    anchor = await crud.create_item(session, models.StencilAnchor, {
        "owner_resource": "network-device-types",
        "owner_id": ndt.id,
        "face": "back",
        "port_key": "24",
        "x": 0.42,
        "y": 0.55,
        "label": "Port 24",
    })
    assert anchor.x == pytest.approx(0.42)

    fetched = await session.get(models.StencilAnchor, anchor.id)
    assert fetched is not None
    assert fetched.port_key == "24"

    ok = await crud.delete_item(session, models.StencilAnchor, anchor.id)
    assert ok is True
    assert await session.get(models.StencilAnchor, anchor.id) is None


@pytest.mark.asyncio
async def test_anchor_unique_constraint(session):
    ndt = await crud.create_item(session, models.NetworkDeviceType, {
        "full_name": "24-port switch", "abbreviation": "sw24",
    })
    await crud.create_item(session, models.StencilAnchor, {
        "owner_resource": "network-device-types", "owner_id": ndt.id,
        "face": "front", "port_key": "1", "x": 0.1, "y": 0.1,
    })
    with pytest.raises(Exception):
        # Same (owner_resource, owner_id, face, port_key) must be rejected.
        await crud.create_item(session, models.StencilAnchor, {
            "owner_resource": "network-device-types", "owner_id": ndt.id,
            "face": "front", "port_key": "1", "x": 0.9, "y": 0.9,
        })


@pytest.mark.asyncio
async def test_anchor_crud_round_trip_power_device_type(session):
    """Phase 4 Task 22 — power-device-types gets identical anchor treatment
    to network-device-types (same StencilAnchor table, just a different
    owner_resource string)."""
    pdt = await crud.create_item(session, models.PowerDeviceType, {
        "full_name": "Rack PDU 48-outlet", "abbreviation": "pdu48",
    })
    anchor = await crud.create_item(session, models.StencilAnchor, {
        "owner_resource": "power-device-types",
        "owner_id": pdt.id,
        "face": "front",
        "port_key": "12",
        "x": 0.3,
        "y": 0.65,
        "label": "Outlet 12",
    })
    assert anchor.x == pytest.approx(0.3)

    fetched = await session.get(models.StencilAnchor, anchor.id)
    assert fetched is not None
    assert fetched.owner_resource == "power-device-types"

    ok = await crud.delete_item(session, models.StencilAnchor, anchor.id)
    assert ok is True
    assert await session.get(models.StencilAnchor, anchor.id) is None


@pytest.mark.asyncio
async def test_anchor_unique_constraint_power_device_type(session):
    pdt = await crud.create_item(session, models.PowerDeviceType, {
        "full_name": "Rack PDU 8-outlet", "abbreviation": "pdu8",
    })
    await crud.create_item(session, models.StencilAnchor, {
        "owner_resource": "power-device-types", "owner_id": pdt.id,
        "face": "back", "port_key": "1", "x": 0.2, "y": 0.2,
    })
    with pytest.raises(Exception):
        await crud.create_item(session, models.StencilAnchor, {
            "owner_resource": "power-device-types", "owner_id": pdt.id,
            "face": "back", "port_key": "1", "x": 0.8, "y": 0.8,
        })


@pytest.mark.asyncio
async def test_power_device_type_has_stencil_columns(session):
    pdt = await crud.create_item(session, models.PowerDeviceType, {
        "full_name": "Rack PDU 24-outlet", "abbreviation": "pdu24",
    })
    updated = await crud.update_item(session, models.PowerDeviceType, pdt.id, {
        "stencil_url": "https://example.com/pdu.svg",
        "stencil_url_back": "https://example.com/pdu-back.svg",
    })
    assert updated.stencil_url.endswith("pdu.svg")
    assert updated.stencil_url_back.endswith("pdu-back.svg")
