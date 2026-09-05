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
async def test_patch_panel_port_candidates(session):
    """Phase 4 Task 21 — patch_panel_port resolves via PatchPanel.rack_id,
    is scoped/excluded like the other port kinds, and reports the PANEL (not
    the individual port) as the owner."""
    ids = await _topology(session)
    panel = models.PatchPanel(rack_id=(await session.get(models.NetworkDevice, ids["nd"])).rack_id, panel_id_label="PP-A")
    session.add(panel)
    await session.flush()
    p1 = models.PatchPanelPort(patch_panel_id=panel.id, port_number=1, label="P1")
    p2 = models.PatchPanelPort(patch_panel_id=panel.id, port_number=2, label="P2")
    session.add_all([p1, p2])
    await session.commit()

    res = await ports.candidate_ports(session, "network-devices", ids["nd"], "interface", ids["src"])
    cand = {(c["port_kind"], c["port_id"]): c for c in res["candidates"]}
    assert ("patch_panel_port", p1.id) in cand
    assert ("patch_panel_port", p2.id) in cand
    c1 = cand[("patch_panel_port", p1.id)]
    assert c1["owner_type"] == "patch-panels"
    assert c1["owner_id"] == panel.id  # owner is the PANEL, not the port
    assert c1["owner_name"] == "PP-A"
    assert c1["label"] == "P1"
    assert c1["same_rack"] is True

    # Excluding the source itself when the source IS a patch_panel_port.
    res2 = await ports.candidate_ports(session, "patch-panels", panel.id, "patch_panel_port", p1.id)
    cand2 = {(c["port_kind"], c["port_id"]) for c in res2["candidates"]}
    assert ("patch_panel_port", p1.id) not in cand2
    assert ("patch_panel_port", p2.id) in cand2


@pytest.mark.asyncio
async def test_patch_panel_port_unmounted_panel_excluded(session):
    """A patch panel with no rack_id (unmounted) never appears as a candidate."""
    ids = await _topology(session)
    panel = models.PatchPanel(rack_id=None, panel_id_label="PP-unmounted")
    session.add(panel)
    await session.flush()
    port = models.PatchPanelPort(patch_panel_id=panel.id, port_number=1)
    session.add(port)
    await session.commit()

    res = await ports.candidate_ports(session, "network-devices", ids["nd"], "interface", ids["src"])
    cand = {(c["port_kind"], c["port_id"]) for c in res["candidates"]}
    assert ("patch_panel_port", port.id) not in cand


@pytest.mark.asyncio
async def test_interface_owner_resolution(session):
    """Property 3: owner pair wins, else network_device_id."""
    a = models.DeviceInterface(owner_device_type="physical-servers", owner_device_id=7)
    assert ports.interface_owner(a) == ("physical-servers", 7)
    b = models.DeviceInterface(network_device_id=9)
    assert ports.interface_owner(b) == ("network-devices", 9)
