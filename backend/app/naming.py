"""Naming convention engine.

Auto-generates ``vf_long_name`` / ``vf_short_name`` / ``tia606b_name`` for
entities by resolving foreign-key abbreviations from the lookup tables.

The rules encode the Virtualfactor hierarchical convention:
    Organization > Cloud > Region > Campus > Building > Floor/Section >
    Rack > Unit > Device(type+brand+role+os+consecutive)
"""
from __future__ import annotations

from typing import Optional

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
