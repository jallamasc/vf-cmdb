"""Phase 5 Task 28 — Code Mode toggle for naming-engine fields (Req 23).

Scoped to the 5 tables whose naming.py generator actually sets a field
(sites, datacenters, racks, patch_panels, power_devices) — see
naming.py's `_is_auto()` and models.py's `NAMING_MODE_VALUES` comment for
why datacenter_floors/rooms/sections were excluded (no generator to gate).

`naming_mode="manual"` has two halves that both have to work together:
naming.py's generators must skip the computed field (already existed as
a concept before this task, e.g. Site's own `site_code_type`), AND
crud.sanitize_payload must stop treating that field as always-computed
so a client's own value can actually reach the row in the first place —
the second half is new in this task; before it, `COMPUTED_FIELDS`
unconditionally stripped vf_long_name/vf_short_name/tia606b_name from
every incoming payload regardless of any mode.
"""
from __future__ import annotations

from app import crud, models


async def test_naming_mode_defaults_to_auto(session):
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(session, models.Datacenter, {"name": "DC1", "site_id": site.id})
    rack = await crud.create_item(session, models.Rack, {"grid_coordinates": "AA01"})
    panel = await crud.create_item(session, models.PatchPanel, {"rack_id": rack.id})
    dev = await crud.create_item(session, models.PowerDevice, {"site_id": site.id})

    assert site.naming_mode == "auto"
    assert dc.naming_mode == "auto"
    assert rack.naming_mode == "auto"
    assert panel.naming_mode == "auto"
    assert dev.naming_mode == "auto"


async def test_manual_site_accepts_and_preserves_a_hand_typed_long_name(session):
    site = await crud.create_item(session, models.Site, {"naming_mode": "manual"})
    updated = await crud.update_item(
        session, models.Site, site.id, {"vf_long_name": "HAND-TYPED"}
    )
    assert updated.vf_long_name == "HAND-TYPED"

    # An unrelated update must not regenerate/clear it.
    unrelated = await crud.update_item(
        session, models.Site, site.id, {"description": "unrelated change"}
    )
    assert unrelated.vf_long_name == "HAND-TYPED"


async def test_switching_a_manual_site_back_to_auto_regenerates(session):
    site = await crud.create_item(
        session, models.Site, {"naming_mode": "manual", "vf_long_name": "HAND-TYPED"}
    )
    assert site.vf_long_name == "HAND-TYPED"

    reverted = await crud.update_item(session, models.Site, site.id, {"naming_mode": "auto"})
    # Regenerated (empty inputs here, so it's no longer the hand-typed value).
    assert reverted.vf_long_name != "HAND-TYPED"


async def test_auto_mode_still_overwrites_on_unrelated_update_no_regression(session):
    rack = await crud.create_item(session, models.Rack, {"grid_coordinates": "AA03"})
    assert rack.vf_long_name and "AA03" in rack.vf_long_name

    updated = await crud.update_item(
        session, models.Rack, rack.id, {"grid_coordinates": "BB04"}
    )
    assert "BB04" in updated.vf_long_name
    assert "AA03" not in updated.vf_long_name


async def test_manual_rack_preserves_hand_typed_name_across_an_unrelated_field_change(session):
    rack = await crud.create_item(
        session,
        models.Rack,
        {"grid_coordinates": "CC05", "naming_mode": "manual"},
    )
    await crud.update_item(session, models.Rack, rack.id, {"vf_long_name": "MY-RACK"})

    updated = await crud.update_item(
        session, models.Rack, rack.id, {"grid_coordinates": "DD06"}
    )
    assert updated.vf_long_name == "MY-RACK"
    assert updated.grid_coordinates == "DD06"


async def test_manual_datacenter_preserves_hand_typed_long_name(session):
    site = await crud.create_item(session, models.Site, {})
    dc = await crud.create_item(
        session,
        models.Datacenter,
        {"name": "DC1", "site_id": site.id, "naming_mode": "manual"},
    )
    await crud.update_item(session, models.Datacenter, dc.id, {"vf_long_name": "MY-DC"})

    updated = await crud.update_item(
        session, models.Datacenter, dc.id, {"description": "unrelated"}
    )
    assert updated.vf_long_name == "MY-DC"


async def test_manual_power_device_preserves_hand_typed_long_name(session):
    site = await crud.create_item(session, models.Site, {})
    dev = await crud.create_item(
        session,
        models.PowerDevice,
        {"site_id": site.id, "naming_mode": "manual"},
    )
    await crud.update_item(session, models.PowerDevice, dev.id, {"vf_long_name": "MY-PDU"})

    updated = await crud.update_item(
        session, models.PowerDevice, dev.id, {"notes": "unrelated"}
    )
    assert updated.vf_long_name == "MY-PDU"


async def test_manual_patch_panel_preserves_hand_typed_id_label(session):
    rack = await crud.create_item(session, models.Rack, {"grid_coordinates": "EE07"})
    panel = await crud.create_item(
        session, models.PatchPanel, {"rack_id": rack.id, "naming_mode": "manual"}
    )
    await crud.update_item(
        session, models.PatchPanel, panel.id, {"panel_id_label": "MY-PANEL"}
    )

    updated = await crud.update_item(session, models.PatchPanel, panel.id, {"side": "rear"})
    assert updated.panel_id_label == "MY-PANEL"
