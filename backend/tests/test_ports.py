"""FEAT-6 (6C) — port candidates: scoping, source exclusion, ownership.

Feature: rack-back-and-cabling
Covers Requirements 6 (ownership resolution), 8.2/8.3 (scope), 8.7 (exclude source).
"""
import pytest

from app import models, ports


async def _topology(session):
    """DC1(floor1->rackA,rackB) + DC2(floor2->rackC). Devices + interfaces."""
    dc1 = models.Datacenter(name="DC1")
    dc2 = models.Datacenter(name="DC2")
    session.add_all([dc1, dc2])
    await session.flush()
    f1 = models.DatacenterFloor(name="F1", datacenter_id=dc1.id)
    f2 = models.DatacenterFloor(name="F2", datacenter_id=dc2.id)
    session.add_all([f1, f2])
    await session.flush()
    rackA = models.Rack(datacenter_floor_id=f1.id, code="AA01")
    rackB = models.Rack(datacenter_floor_id=f1.id, code="AA02")
    rackC = models.Rack(datacenter_floor_id=f2.id, code="BB01")
    session.add_all([rackA, rackB, rackC])
    await session.flush()
    nd = models.NetworkDevice(rack_id=rackA.id, vf_long_name="SW-A")
    srvB = models.PhysicalServer(rack_id=rackB.id, vf_long_name="SRV-B")
    srvC = models.PhysicalServer(rack_id=rackC.id, vf_long_name="SRV-C")
    session.add_all([nd, srvB, srvC])
    await session.flush()
    src = models.DeviceInterface(network_device_id=nd.id, description="e0", speed="1G")
    ifB = models.DeviceInterface(
        owner_device_type="physical-servers", owner_device_id=srvB.id,
        description="nic1", speed="10G-SFP",
    )
    ifC = models.DeviceInterface(
        owner_device_type="physical-servers", owner_device_id=srvC.id, description="nic1"
    )
    session.add_all([src, ifB, ifC])
    await session.commit()
    return dict(nd=nd.id, src=src.id, ifB=ifB.id, ifC=ifC.id)


@pytest.mark.asyncio
async def test_candidates_scope_and_exclusion(session):
    """Property 2: same-DC included, other-DC excluded, source excluded."""
    ids = await _topology(session)
    res = await ports.candidate_ports(session, "network-devices", ids["nd"], "interface", ids["src"])
    cand = {(c["port_kind"], c["port_id"]) for c in res["candidates"]}
    assert res["scope"] == "datacenter"
    assert ("interface", ids["ifB"]) in cand      # same datacenter
    assert ("interface", ids["ifC"]) not in cand  # other datacenter
    assert ("interface", ids["src"]) not in cand  # source excluded


@pytest.mark.asyncio
async def test_fiber_classification(session):
    """Interface speed containing SFP -> fiber port_type."""
    ids = await _topology(session)
    res = await ports.candidate_ports(session, "network-devices", ids["nd"], "interface", ids["src"])
    ifB = next(c for c in res["candidates"] if c["port_id"] == ids["ifB"] and c["port_kind"] == "interface")
    assert ifB["port_type"] == "fiber"


@pytest.mark.asyncio
async def test_orphan_source_raises(session):
    """A source not mounted in any rack -> LookupError (endpoint returns 404)."""
    orphan = models.NetworkDevice(vf_long_name="orphan")
    session.add(orphan)
    await session.commit()
    oif = models.DeviceInterface(network_device_id=orphan.id, description="x")
    session.add(oif)
    await session.commit()
    with pytest.raises(LookupError):
        await ports.candidate_ports(session, "network-devices", orphan.id, "interface", oif.id)


@pytest.mark.asyncio
async def test_interface_owner_resolution(session):
    """Property 3: owner pair wins, else network_device_id."""
    a = models.DeviceInterface(owner_device_type="physical-servers", owner_device_id=7)
    assert ports.interface_owner(a) == ("physical-servers", 7)
    b = models.DeviceInterface(network_device_id=9)
    assert ports.interface_owner(b) == ("network-devices", 9)
