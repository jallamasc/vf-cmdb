"""Phase 6 Task 26 (Req 10.1) — every hardcoded device/entity instance table
now has its own stencil_url/stencil_url_back, independent of any device-TYPE
lookup's own stencil columns."""
from __future__ import annotations

from app import crud, models


async def test_stencil_override_round_trips_on_network_device(session):
    row = await crud.create_item(
        session,
        models.NetworkDevice,
        {"model": "Catalyst 9300", "stencil_url": "https://x/nd.svg", "stencil_url_back": "https://x/nd-back.svg"},
    )
    assert row.stencil_url == "https://x/nd.svg"
    assert row.stencil_url_back == "https://x/nd-back.svg"
    fetched = await session.get(models.NetworkDevice, row.id)
    assert fetched.stencil_url == "https://x/nd.svg"


async def test_stencil_override_round_trips_on_physical_server(session):
    row = await crud.create_item(
        session, models.PhysicalServer, {"model": "DL380", "stencil_url": "https://x/srv.svg"}
    )
    assert row.stencil_url == "https://x/srv.svg"


async def test_stencil_override_round_trips_on_virtual_machine(session):
    row = await crud.create_item(
        session, models.VirtualMachine, {"friendly_name": "vm1", "stencil_url": "https://x/vm.svg"}
    )
    assert row.stencil_url == "https://x/vm.svg"


async def test_stencil_override_round_trips_on_container_app(session):
    row = await crud.create_item(
        session, models.ContainerApp, {"friendly_name": "app1", "stencil_url": "https://x/app.svg"}
    )
    assert row.stencil_url == "https://x/app.svg"


async def test_stencil_override_round_trips_on_workstation(session):
    row = await crud.create_item(
        session, models.Workstation, {"stencil_url": "https://x/ws.svg"}
    )
    assert row.stencil_url == "https://x/ws.svg"


async def test_stencil_override_round_trips_on_power_device(session):
    row = await crud.create_item(
        session, models.PowerDevice, {"device_type": "pdu", "stencil_url": "https://x/pdu.svg"}
    )
    assert row.stencil_url == "https://x/pdu.svg"


async def test_stencil_override_round_trips_on_patch_panel(session):
    row = await crud.create_item(
        session, models.PatchPanel, {"panel_id_label": "PP1", "stencil_url": "https://x/pp.svg"}
    )
    assert row.stencil_url == "https://x/pp.svg"


async def test_stencil_override_round_trips_on_rack(session):
    row = await crud.create_item(
        session, models.Rack, {"total_units": 42, "stencil_url": "https://x/rack.svg"}
    )
    assert row.stencil_url == "https://x/rack.svg"


async def test_stencil_override_is_optional_and_independent_of_device_type_column(session):
    """A device-instance row's own stencil_url is a SEPARATE column from its
    device-type's stencil_url — creating one never touches the other."""
    device_type = await crud.create_item(
        session,
        models.NetworkDeviceType,
        {"full_name": "Switch Model X", "abbreviation": "smx", "stencil_url": "https://x/type.svg"},
    )
    device = await crud.create_item(
        session,
        models.NetworkDevice,
        {"model": "Switch Model X unit", "device_type_id": device_type.id},
    )
    assert device.stencil_url is None  # no override set — the type's stencil is untouched
    refreshed_type = await session.get(models.NetworkDeviceType, device_type.id)
    assert refreshed_type.stencil_url == "https://x/type.svg"
