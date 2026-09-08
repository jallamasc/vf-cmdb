"""Phase 6 Task 33 (Requirement 13.1) — category-appropriate Hardware_Spec
fields on the 4 device-type registries."""
from __future__ import annotations

from app import crud, models


async def test_compute_device_type_spec_fields_round_trip(session):
    row = await crud.create_item(
        session,
        models.ComputeDeviceType,
        {
            "full_name": "ProLiant DL380",
            "abbreviation": "dl380",
            "rack_units": 2,
            "cpu_sockets": 2,
            "max_cpu_cores": 64,
            "max_memory_gb": 3072,
            "drive_bays": 8,
            "max_power_watts": 800,
        },
    )
    assert row.rack_units == 2
    assert row.cpu_sockets == 2
    assert row.max_cpu_cores == 64
    assert row.max_memory_gb == 3072
    assert row.drive_bays == 8
    assert row.max_power_watts == 800


async def test_network_device_type_spec_fields_round_trip(session):
    row = await crud.create_item(
        session,
        models.NetworkDeviceType,
        {
            "full_name": "Catalyst 9300",
            "abbreviation": "c9300",
            "rack_units": 1,
            "port_count": 48,
            "port_speed_gbps": 10.0,
            "poe_supported": True,
            "max_power_watts": 715,
        },
    )
    assert row.port_count == 48
    assert row.port_speed_gbps == 10.0
    assert row.poe_supported is True
    assert row.max_power_watts == 715


async def test_storage_device_type_spec_fields_round_trip(session):
    row = await crud.create_item(
        session,
        models.StorageDeviceType,
        {
            "full_name": "PowerVault ME4024",
            "abbreviation": "me4024",
            "rack_units": 2,
            "capacity_tb": 96.0,
            "drive_bays": 24,
            "interface_type": "SAS",
            "max_power_watts": 580,
        },
    )
    assert row.capacity_tb == 96.0
    assert row.drive_bays == 24
    assert row.interface_type == "SAS"
    assert row.max_power_watts == 580


async def test_power_device_type_spec_fields_round_trip(session):
    """Requirement 13's own user-story example: "a UPS's max capacity and
    output count"."""
    row = await crud.create_item(
        session,
        models.PowerDeviceType,
        {
            "full_name": "Smart-UPS 3000VA",
            "abbreviation": "sup3000",
            "rack_units": 2,
            "capacity_va": 3000,
            "output_count": 8,
            "input_voltage": "208V",
        },
    )
    assert row.capacity_va == 3000
    assert row.output_count == 8
    assert row.input_voltage == "208V"


async def test_spec_fields_are_all_optional(session):
    """A device-type row with no confirmed specs yet must save fine — every
    field defaults to None, not a placeholder value."""
    row = await crud.create_item(
        session, models.PowerDeviceType, {"full_name": "Unknown PDU", "abbreviation": "unkpdu"}
    )
    assert row.rack_units is None
    assert row.capacity_va is None
    assert row.output_count is None
    assert row.input_voltage is None
