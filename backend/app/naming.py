"""Naming convention engine.

Auto-generates ``vf_long_name`` / ``vf_short_name`` / ``tia606b_name`` for
entities by resolving foreign-key abbreviations from the lookup tables.

The rules encode the Virtualfactor hierarchical convention:
    Organization > Cloud > Region > Campus > Building > Floor/Section >
    Rack > Unit > Device(type+brand+role+os+consecutive)
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Integer
from sqlalchemy.ext.asyncio import AsyncSession

from . import models


async def _abbr(session: AsyncSession, model, pk: Optional[int]) -> str:
    """Return the abbreviation for a lookup row, or '' when not found."""
    if pk is None:
        return ""
    obj = await session.get(model, pk)
    return (obj.abbreviation if obj and obj.abbreviation else "") or ""


async def site_long_name(session: AsyncSession, site: models.Site) -> str:
    parts = [
        await _abbr(session, models.Organization, site.organization_id),
        await _abbr(session, models.Cloud, site.cloud_id),
        await _abbr(session, models.Region, site.region_id),
        await _abbr(session, models.Campus, site.campus_id),
        await _abbr(session, models.Building, site.building_id),
        await _abbr(session, models.FloorSection, site.floor_section_id),
    ]
    return "".join(p for p in parts).upper()


async def generate_site(session: AsyncSession, site: models.Site) -> None:
    long_name = await site_long_name(session, site)
    site.vf_long_name = long_name
    # short name: organization + campus + building
    org = await _abbr(session, models.Organization, site.organization_id)
    campus = await _abbr(session, models.Campus, site.campus_id)
    site.vf_short_name = (org + campus).upper()
    site.tia606b_name = long_name


async def generate_rack(session: AsyncSession, rack: models.Rack) -> None:
    base = ""
    if rack.site_id:
        site = await session.get(models.Site, rack.site_id)
        if site and site.vf_long_name:
            base = site.vf_long_name
    rack.vf_long_name = f"{base}{rack.grid_coordinates or ''}".upper()


async def generate_physical_server(session: AsyncSession, s: models.PhysicalServer) -> None:
    dt = await _abbr(session, models.ComputeDeviceType, s.device_type_id)
    brand = await _abbr(session, models.Brand, s.brand_id)
    role = await _abbr(session, models.DeviceRole, s.role_id)
    os_fam = await _abbr(session, models.OsFamily, s.os_family_id)
    cons = s.consecutive if s.consecutive is not None else ""
    short = f"{dt}{brand}{role}{os_fam}{cons}".lower()
    s.vf_short_name = short
    base = ""
    if s.site_id:
        site = await session.get(models.Site, s.site_id)
        if site and site.vf_long_name:
            base = site.vf_long_name
    rack_part = ""
    if s.rack_id:
        rack = await session.get(models.Rack, s.rack_id)
        if rack and rack.grid_coordinates:
            rack_part = rack.grid_coordinates
    s.vf_long_name = f"{base}{rack_part}{short.upper()}"


async def generate_vm(session: AsyncSession, vm: models.VirtualMachine) -> None:
    os_fam = await _abbr(session, models.OsFamily, vm.os_family_id)
    role = await _abbr(session, models.DeviceRole, vm.role_id)
    cons = vm.consecutive if vm.consecutive is not None else ""
    vm.vf_short_name = f"vm{os_fam}{role}{cons}".lower()


async def generate_container(session: AsyncSession, c: models.ContainerApp) -> None:
    app = await _abbr(session, models.AppType, c.app_type_id)
    role = await _abbr(session, models.DeviceRole, c.role_id)
    cons = c.consecutive if c.consecutive is not None else ""
    ver = c.version or ""
    ctype = c.container_type or "cn"
    c.vf_short_name = f"{ctype}{app}{ver}{role}{cons}".lower()


async def generate_workstation(session: AsyncSession, w: models.Workstation) -> None:
    dt = await _abbr(session, models.ComputeDeviceType, w.device_type_id)
    brand = await _abbr(session, models.Brand, w.brand_id)
    role = await _abbr(session, models.DeviceRole, w.role_id)
    os_fam = await _abbr(session, models.OsFamily, w.os_family_id)
    cons = w.consecutive if w.consecutive is not None else ""
    short = f"{dt}{brand}{role}{os_fam}{cons}".lower()
    w.vf_short_name = short
    base = ""
    if w.site_id:
        site = await session.get(models.Site, w.site_id)
        if site and site.vf_long_name:
            base = site.vf_long_name
    w.vf_long_name = f"{base}{short.upper()}"


async def generate_network_device(session: AsyncSession, d: models.NetworkDevice) -> None:
    dt = await _abbr(session, models.NetworkDeviceType, d.device_type_id)
    sub = await _abbr(session, models.NetworkSubtype, d.subtype_id)
    brand = await _abbr(session, models.Brand, d.brand_id)
    cons = d.consecutive if d.consecutive is not None else ""
    friendly = f"{dt}{sub}{cons}".lower()
    d.vf_friendly_name = friendly
    base = ""
    if d.site_id:
        site = await session.get(models.Site, d.site_id)
        if site and site.vf_long_name:
            base = site.vf_long_name
    rack_part = ""
    if d.rack_id:
        rack = await session.get(models.Rack, d.rack_id)
        if rack and rack.grid_coordinates:
            rack_part = rack.grid_coordinates
    d.vf_long_name = f"{base}{rack_part}{dt}{sub}{brand}{cons}".upper()


# Dispatch table: model class -> generator coroutine
GENERATORS = {
    models.Site: generate_site,
    models.Rack: generate_rack,
    models.PhysicalServer: generate_physical_server,
    models.VirtualMachine: generate_vm,
    models.ContainerApp: generate_container,
    models.Workstation: generate_workstation,
    models.NetworkDevice: generate_network_device,
}


async def apply_naming(session: AsyncSession, obj) -> None:
    """Populate computed name fields for *obj* if a generator exists."""
    gen = GENERATORS.get(type(obj))
    if gen is not None:
        await gen(session, obj)


# ---------------------------------------------------------------------------
# UX-4: live name preview (nothing is persisted)
# ---------------------------------------------------------------------------
# Public entity_type values accepted by GET /naming/generate. Both the
# singular form and the API resource slug are allowed so callers can pass
# whatever they already have at hand.
PREVIEW_MODELS = {
    "site": models.Site,
    "sites": models.Site,
    "rack": models.Rack,
    "racks": models.Rack,
    "datacenter": models.Datacenter,
    "datacenters": models.Datacenter,
    "datacenter_floor": models.DatacenterFloor,
    "datacenter-floors": models.DatacenterFloor,
    "room": models.Room,
    "rooms": models.Room,
    "physical_server": models.PhysicalServer,
    "physical-servers": models.PhysicalServer,
    "virtual_machine": models.VirtualMachine,
    "virtual-machines": models.VirtualMachine,
    "container_app": models.ContainerApp,
    "containers-apps": models.ContainerApp,
    "workstation": models.Workstation,
    "workstations": models.Workstation,
    "network_device": models.NetworkDevice,
    "network-devices": models.NetworkDevice,
}

# Foreign keys that actually feed a generated name, per model. Used to report
# which pickers the user still has to fill in for a complete name.
_NAME_INPUTS: dict[type, list[str]] = {
    models.Site: [
        "organization_id",
        "cloud_id",
        "region_id",
        "campus_id",
        "building_id",
        "floor_section_id",
    ],
    models.Rack: ["site_id", "grid_coordinates"],
    models.PhysicalServer: [
        "site_id",
        "device_type_id",
        "brand_id",
        "role_id",
        "os_family_id",
    ],
    models.VirtualMachine: ["os_family_id", "role_id"],
    models.ContainerApp: ["app_type_id", "role_id"],
    models.Workstation: [
        "site_id",
        "device_type_id",
        "brand_id",
        "role_id",
        "os_family_id",
    ],
    models.NetworkDevice: ["site_id", "device_type_id", "subtype_id", "brand_id"],
}

# Hierarchy levels that have no generator: Datacenter / Floor / Room are not
# part of the Organization>Cloud>…>Rack naming chain, so we never invent a
# vf_* name for them — only the readable location path is previewed.
# Each entry lists the parent FKs to try, most specific first.
_PARENT_CHAIN: dict[type, list[tuple[str, type]]] = {
    models.Datacenter: [("site_id", models.Site)],
    models.DatacenterFloor: [("datacenter_id", models.Datacenter)],
    models.Room: [("datacenter_floor_id", models.DatacenterFloor)],
    models.Rack: [
        ("room_id", models.Room),
        ("datacenter_floor_id", models.DatacenterFloor),
        ("site_id", models.Site),
    ],
}


def _row_label(obj) -> str:
    """Best human label for any parent row (lookup, site, datacenter, …)."""
    if obj is None:
        return ""
    full = getattr(obj, "full_name", None)
    abbreviation = getattr(obj, "abbreviation", None)
    if full and abbreviation:
        return f"{full} ({abbreviation})"
    for attr in ("full_name", "name", "simple_name", "vf_long_name", "code", "abbreviation"):
        value = getattr(obj, attr, None)
        if value:
            return str(value)
    return f"#{getattr(obj, 'id', '?')}"


async def _parent_path(session: AsyncSession, model, values: dict) -> list[str]:
    """Walk the parent chain upwards and return readable labels, root first."""
    parts: list[str] = []
    current_model = model
    # First hop reads the submitted form values; later hops read the resolved
    # parent row so the whole chain is rebuilt from the database.
    read = lambda field: values.get(field)  # noqa: E731
    depth = 0
    while current_model in _PARENT_CHAIN and depth < 6:
        depth += 1
        parent = None
        for fk_field, parent_model in _PARENT_CHAIN[current_model]:
            pk = read(fk_field)
            if pk is None:
                continue
            candidate = await session.get(parent_model, pk)
            if candidate is not None:
                parent = candidate
                current_model = parent_model
                break
        if parent is None:
            break
        parts.insert(0, _row_label(parent))
        read = lambda field, _p=parent: getattr(_p, field, None)  # noqa: E731
    return parts


async def preview_names(
    session: AsyncSession, entity_type: str, values: dict
) -> dict:
    """Generate the names *entity_type* would get for the given FK values.

    A throw-away (never added to the session) model instance is fed to the very
    same generator the create/update path uses, so the preview cannot drift from
    what is actually stored. Returns ``vf_long_name`` / ``vf_short_name`` /
    ``tia606b_name`` (``None`` for levels that have no generator), the readable
    parent path and the list of inputs still missing.
    """
    model = PREVIEW_MODELS.get(entity_type.strip().lower())
    if model is None:
        raise KeyError(entity_type)

    # Query-string values arrive as strings: coerce them to the column type so
    # the generators see real integers for the foreign keys.
    clean: dict = {}
    for key, value in values.items():
        column = model.__table__.columns.get(key)
        if column is None or value is None or value == "":
            continue
        if isinstance(column.type, Integer) and isinstance(value, str):
            text = value.strip()
            if not text.lstrip("-").isdigit():
                continue
            value = int(text)
        clean[key] = value

    obj = model(**clean)
    generator = GENERATORS.get(model)
    if generator is not None:
        await generator(session, obj)

    inputs = _NAME_INPUTS.get(model, [])
    missing = [f for f in inputs if clean.get(f) in (None, "")]

    path_parts = await _parent_path(session, model, clean)
    # Own label comes from what the user typed, never from the generated name
    # (which is reported separately) — otherwise the path repeats it.
    own_label = clean.get("name") or clean.get("simple_name") or clean.get("code")
    if own_label:
        path_parts = path_parts + [str(own_label)]

    return {
        "entity_type": entity_type,
        "resource": model.__tablename__,
        "vf_long_name": getattr(obj, "vf_long_name", None) or None,
        "vf_short_name": getattr(obj, "vf_short_name", None) or None,
        "tia606b_name": getattr(obj, "tia606b_name", None) or None,
        "vf_friendly_name": getattr(obj, "vf_friendly_name", None) or None,
        "path": " › ".join(p for p in path_parts if p),
        "missing": missing,
        "complete": generator is not None and not missing,
        "generated": generator is not None,
    }
