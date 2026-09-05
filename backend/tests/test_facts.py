"""Phase 4 Task 27 — Ansible-depth device facts (Requirement 21).

Feature: phase-4-ux-graphical-views. Covers Requirement 21.1 (JSONB
catch-all), 21.2 (promoted columns, in addition to the blob), 21.3
(last_fact_sync_at stamping).
"""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app import crud, models
from app.routers.special import build_facts_payload, ingest_facts


def test_build_facts_payload_promotes_and_keeps_everything_in_the_blob():
    payload = build_facts_payload(
        None,
        {"cpu_cores": 8, "memory_mb": 16384, "os_distribution": "Ubuntu 22.04", "kernel": "5.15.0"},
    )
    # Promoted keys land on their own dict entries too...
    assert payload["cpu_cores"] == 8
    assert payload["memory_mb"] == 16384
    assert payload["os_distribution"] == "Ubuntu 22.04"
    # ...AND every key (promoted or not) is ALSO in the blob (Req 21.1/21.2).
    assert payload["ansible_facts"] == {
        "cpu_cores": 8,
        "memory_mb": 16384,
        "os_distribution": "Ubuntu 22.04",
        "kernel": "5.15.0",
    }
    assert isinstance(payload["last_fact_sync_at"], datetime)


def test_build_facts_payload_merges_partial_payload_with_existing_blob():
    existing = {"kernel": "5.10.0", "arch": "x86_64"}
    payload = build_facts_payload(existing, {"cpu_cores": 4})
    assert payload["cpu_cores"] == 4
    # A partial payload never erases previously-recorded facts.
    assert payload["ansible_facts"] == {"kernel": "5.10.0", "arch": "x86_64", "cpu_cores": 4}


def test_build_facts_payload_overwrites_only_keys_present_in_this_payload():
    existing = {"kernel": "5.10.0"}
    payload = build_facts_payload(existing, {"kernel": "5.15.0", "arch": "x86_64"})
    assert payload["ansible_facts"] == {"kernel": "5.15.0", "arch": "x86_64"}


@pytest.mark.asyncio
async def test_ingest_facts_end_to_end(session):
    ps = await crud.create_item(session, models.PhysicalServer, {})
    result = await ingest_facts(
        device_type="physical-servers",
        device_id=ps.id,
        facts={"cpu_cores": 8, "memory_mb": 32768, "os_distribution": "RHEL 9", "serial": "ABC123"},
        session=session,
    )
    assert result["cpu_cores"] == 8
    assert result["memory_mb"] == 32768
    assert result["os_distribution"] == "RHEL 9"
    assert result["ansible_facts"] == {
        "cpu_cores": 8, "memory_mb": 32768, "os_distribution": "RHEL 9", "serial": "ABC123",
    }
    assert result["last_fact_sync_at"] is not None


@pytest.mark.asyncio
async def test_ingest_facts_accumulates_across_two_calls(session):
    """21.1 — a second, partial ingestion merges into the existing blob
    rather than replacing it wholesale."""
    nd = await crud.create_item(session, models.NetworkDevice, {})
    await ingest_facts(
        device_type="network-devices", device_id=nd.id,
        facts={"cpu_cores": 4, "serial": "SN1"}, session=session,
    )
    result = await ingest_facts(
        device_type="network-devices", device_id=nd.id,
        facts={"memory_mb": 8192}, session=session,
    )
    assert result["cpu_cores"] == 4  # still set from the first call
    assert result["memory_mb"] == 8192
    assert result["ansible_facts"] == {"cpu_cores": 4, "serial": "SN1", "memory_mb": 8192}


@pytest.mark.asyncio
async def test_ingest_facts_every_device_type_accepted(session):
    """All 5 FACT_TABLES entries (physical-servers, virtual-machines,
    network-devices, workstations, containers-apps) accept facts."""
    ps = await crud.create_item(session, models.PhysicalServer, {})
    vm = await crud.create_item(session, models.VirtualMachine, {"host_server_id": ps.id})
    ws = await crud.create_item(session, models.Workstation, {})
    nd = await crud.create_item(session, models.NetworkDevice, {})
    ca = await crud.create_item(session, models.ContainerApp, {"host_server_id": ps.id})

    for device_type, obj in (
        ("physical-servers", ps),
        ("virtual-machines", vm),
        ("workstations", ws),
        ("network-devices", nd),
        ("containers-apps", ca),
    ):
        result = await ingest_facts(
            device_type=device_type, device_id=obj.id,
            facts={"cpu_cores": 2}, session=session,
        )
        assert result["cpu_cores"] == 2


@pytest.mark.asyncio
async def test_ingest_facts_unknown_device_type_404(session):
    with pytest.raises(HTTPException) as exc:
        await ingest_facts(device_type="bogus-type", device_id=1, facts={}, session=session)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_ingest_facts_missing_device_404(session):
    with pytest.raises(HTTPException) as exc:
        await ingest_facts(
            device_type="physical-servers", device_id=999999, facts={"cpu_cores": 1}, session=session
        )
    assert exc.value.status_code == 404
