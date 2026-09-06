"""Phase 5 Task 21 — capability integration: rack placement, ports, cabling.

A Generic_Entity whose Entity_Type_Def enables rack_placement/network_ports/
cabling behaves exactly like a hardcoded device type (NetworkDevice,
PhysicalServer, ...) for rack/port/cabling resolution (Req 17.1/17.2/17.3).

This works with no new backend logic beyond registering "generic-entities"
in `ports.RACKABLE_SLUGS` (belt-and-suspenders — `ENTITY_REGISTRY` already
covers it as a fallback): `ports.device_rack_id`, `ports.interface_owner`,
`ports._device_name`, and `naming._device_display_name` all resolve any
ENTITY_REGISTRY slug generically, so a GenericEntity was already reachable
through every one of those functions the moment `generic-entities` was
registered (Task 18). These tests exist to prove that end-to-end, the same
way `test_cables.py`/`test_cable_sync.py` prove it for hardcoded types.
"""
from app import crud, models, ports


async def _make_entity_type(session, slug="widget", capabilities=None):
    return await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": slug, "label": slug.title(), "capabilities": capabilities or []},
    )


async def test_generic_entity_rack_placement_resolves_like_a_hardcoded_device(session):
    entity_type = await _make_entity_type(session, capabilities=["rack_placement"])
    rack = await crud.create_item(session, models.Rack, {"grid_coordinates": "AA01"})
    entity = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": entity_type.id, "attributes": {}},
    )
    await crud.update_item(
        session,
        models.GenericEntity,
        entity.id,
        {"rack_id": rack.id, "rack_unit": 3},
    )

    resolved_rack_id = await ports.device_rack_id(session, "generic-entities", entity.id)
    assert resolved_rack_id == rack.id


async def test_generic_entity_owns_an_interface_like_a_hardcoded_device(session):
    entity_type = await _make_entity_type(
        session, slug="monitor", capabilities=["network_ports"]
    )
    entity = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": entity_type.id, "attributes": {}},
    )
    iface = await crud.create_item(
        session,
        models.DeviceInterface,
        {
            "owner_device_type": "generic-entities",
            "owner_device_id": entity.id,
            "port_number": 1,
            "description": "mgmt",
        },
    )
    owner_type, owner_id = ports.interface_owner(iface)
    assert owner_type == "generic-entities"
    assert owner_id == entity.id


async def test_generic_entity_can_be_cabled_to_a_hardcoded_device(session):
    """Req 17.3 — a Cable end can reference a Generic_Entity exactly like it
    references a NetworkDevice; the auto-generated label falls back to
    "generic-entities#<id>" since a GenericEntity has none of the vf_*/
    simple_name attributes hardcoded device types use (same fallback
    naming._device_display_name already uses for any unresolvable slug)."""
    entity_type = await _make_entity_type(
        session, slug="sensor", capabilities=["cabling", "network_ports"]
    )
    entity = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": entity_type.id, "attributes": {}},
    )
    nd = await crud.create_item(session, models.NetworkDevice, {})
    nd_row = await session.get(models.NetworkDevice, nd.id)
    nd_row.vf_long_name = "SW1"
    await session.commit()

    cable = await crud.create_item(
        session,
        models.Cable,
        {
            "cable_type": "copper",
            "port_a_type": "generic-entities",
            "port_a_id": entity.id,
            "port_b_type": "network-devices",
            "port_b_id": nd.id,
            "label_a": "eth0",
            "label_b": "e0",
        },
    )
    assert cable.port_a_type == "generic-entities"
    assert cable.port_a_id == entity.id
    assert cable.label == f"generic-entities#{entity.id}-eth0→SW1-e0"


async def test_generic_entity_rack_placement_appears_in_candidate_ports(session):
    """Req 17.1/17.2 — a Generic_Entity's interface shows up as a cabling
    candidate for another device in the same rack, exactly like a hardcoded
    device's interface would (ports.candidate_ports, the function backing
    the Connect panel's destination list)."""
    entity_type = await _make_entity_type(
        session, slug="widget2", capabilities=["rack_placement", "network_ports", "cabling"]
    )
    rack = await crud.create_item(session, models.Rack, {"grid_coordinates": "AA02"})
    entity = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": entity_type.id, "attributes": {}},
    )
    await crud.update_item(
        session, models.GenericEntity, entity.id, {"rack_id": rack.id, "rack_unit": 5}
    )
    generic_iface = await crud.create_item(
        session,
        models.DeviceInterface,
        {"owner_device_type": "generic-entities", "owner_device_id": entity.id, "port_number": 1},
    )

    nd = await crud.create_item(session, models.NetworkDevice, {})
    await crud.update_item(session, models.NetworkDevice, nd.id, {"rack_id": rack.id, "rack_unit": 1})
    source_iface = await crud.create_item(
        session,
        models.DeviceInterface,
        {"network_device_id": nd.id, "port_number": 1},
    )

    result = await ports.candidate_ports(session, "network-devices", nd.id, "interface", source_iface.id)
    matches = [
        c
        for c in result["candidates"]
        if c["owner_type"] == "generic-entities" and c["port_id"] == generic_iface.id
    ]
    assert len(matches) == 1
    assert matches[0]["same_rack"] is True
