"""Phase 5 Task 3 — naming-engine generators for PatchPanel / PowerDevice.

Previously neither model had a generator: PatchPanel.panel_id_label was
manually-typed-only and PowerDevice.vf_long_name was rendered read-only in the
UI yet never computed by anything, so it was permanently blank.
"""
from __future__ import annotations

from app import crud, models


async def test_patch_panel_gets_generated_id_on_create(session):
    rack = await crud.create_item(
        session, models.Rack, {"grid_coordinates": "AA01"}
    )

    panel = await crud.create_item(
        session, models.PatchPanel, {"rack_id": rack.id, "rack_unit": 12}
    )

    assert panel.panel_id_label
    assert "PP12" in panel.panel_id_label


async def test_patch_panel_without_rack_unit_gets_sequential_id(session):
    rack = await crud.create_item(
        session, models.Rack, {"grid_coordinates": "AA02"}
    )

    first = await crud.create_item(session, models.PatchPanel, {"rack_id": rack.id})
    second = await crud.create_item(session, models.PatchPanel, {"rack_id": rack.id})

    assert first.panel_id_label.endswith("PP1")
    assert second.panel_id_label.endswith("PP2")
    assert first.panel_id_label != second.panel_id_label


async def test_power_device_gets_generated_name_on_create(session):
    site = await crud.create_item(session, models.Site, {})
    site.vf_long_name = "VFHMCC1"
    await session.commit()

    dev = await crud.create_item(
        session,
        models.PowerDevice,
        {"site_id": site.id, "device_type": "ups", "device_number": 3},
    )

    assert dev.vf_long_name
    assert dev.vf_long_name == "VFHMCC1UPS3"


async def test_power_device_without_device_number_gets_sequential_name(session):
    site = await crud.create_item(session, models.Site, {})

    first = await crud.create_item(
        session, models.PowerDevice, {"site_id": site.id, "device_type": "pdu"}
    )
    second = await crud.create_item(
        session, models.PowerDevice, {"site_id": site.id, "device_type": "pdu"}
    )

    assert first.vf_long_name.endswith("PDU1")
    assert second.vf_long_name.endswith("PDU2")
    assert first.vf_long_name != second.vf_long_name
