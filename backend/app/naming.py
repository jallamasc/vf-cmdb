"""Naming convention engine.

Auto-generates ``vf_long_name`` / ``vf_short_name`` / ``tia606b_name`` for
entities by resolving foreign-key abbreviations from the lookup tables.

The rules encode the Virtualfactor hierarchical convention:
    Organization > Cloud > Region > Campus > Building > Floor/Section >
    Rack > Unit > Device(type+brand+role+os+consecutive)
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import models

# FEAT-1: a short name made of only two 2-letter abbreviations ("VF") carries
# no context. Keep padding it with the next hierarchy levels until it reaches
# this many characters, so operators can recognise the site at a glance.
SHORT_NAME_MIN_LENGTH = 4
SHORT_NAME_MAX_LENGTH = 12


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


async def site_short_name(session: AsyncSession, site: models.Site) -> str:
    """Recognisable short name for a site.

    Starts from organization + campus (``VFHM`` for Virtualfactor / Home) and,
    when that is too terse to be meaningful — e.g. a site with no campus would
    collapse to just ``VF`` — keeps appending the next most identifying levels
    (region, cloud, building, floor/section) until ``SHORT_NAME_MIN_LENGTH`` is
    reached. Sites that already produce a long-enough code are left untouched,
    so existing values never churn.
    """
    short = (
        await _abbr(session, models.Organization, site.organization_id)
        + await _abbr(session, models.Campus, site.campus_id)
    )
    fallbacks = (
        (models.Region, site.region_id),
        (models.Cloud, site.cloud_id),
        (models.Building, site.building_id),
        (models.FloorSection, site.floor_section_id),
    )
    for model, pk in fallbacks:
        if len(short) >= SHORT_NAME_MIN_LENGTH:
            break
        short += await _abbr(session, model, pk)
    return short[:SHORT_NAME_MAX_LENGTH].upper()


async def auto_site_code(
    session: AsyncSession,
    organization_id: Optional[int],
    campus_id: Optional[int],
    region_id: Optional[int],
    exclude_site_id: Optional[int] = None,
) -> str:
    """FEAT-1: derive the automatic site code, e.g. ``vfhmcc1``.

    Composition is ``organization + campus + region + sequence``, lowercased.
    The sequence is the lowest positive integer not already taken by another
    site sharing the same prefix, so codes stay stable and gaps get reused
    instead of drifting upwards. Returns ``""`` when no component resolves
    (nothing meaningful can be derived yet).
    """
    prefix = (
        await _abbr(session, models.Organization, organization_id)
        + await _abbr(session, models.Campus, campus_id)
        + await _abbr(session, models.Region, region_id)
    ).lower()
    if not prefix:
        return ""

    rows = (
        await session.execute(
            select(models.Site.id, models.Site.simple_name).where(
                models.Site.simple_name.ilike(f"{prefix}%")
            )
        )
    ).all()
    taken: set[int] = set()
    for site_id, simple_name in rows:
        if exclude_site_id is not None and site_id == exclude_site_id:
            continue
        suffix = (simple_name or "")[len(prefix):]
        if suffix.isdigit():
            taken.add(int(suffix))

    sequence = 1
    while sequence in taken:
        sequence += 1
    return f"{prefix}{sequence}"


async def generate_site(session: AsyncSession, site: models.Site) -> None:
    # Phase 5 Task 28 (Req 23.2) — `naming_mode` gates ONLY these three
    # fields. `site_code_type` below is a separate, older, orthogonal mode
    # axis for `simple_name` alone (FEAT-1) and is never touched by this.
    if _is_auto(site):
        long_name = await site_long_name(session, site)
        site.vf_long_name = long_name
        site.vf_short_name = await site_short_name(session, site)
        site.tia606b_name = long_name

    # FEAT-1: simple_name is tri-mode. Only "auto" and "theme" are engine
    # driven; "custom" keeps whatever the user typed, untouched.
    code_type = (getattr(site, "site_code_type", None) or "auto").strip().lower()
    if code_type == "auto":
        code = await auto_site_code(
            session,
            site.organization_id,
            site.campus_id,
            site.region_id,
            exclude_site_id=getattr(site, "id", None),
        )
        if code:
            site.simple_name = code
    elif code_type == "theme":
        theme_name = (getattr(site, "theme_name", None) or "").strip()
        if theme_name:
            site.simple_name = theme_name


async def generate_datacenter(session: AsyncSession, dc: models.Datacenter) -> None:
    """FEAT-5: datacenter long name = parent site + IATA city code + dc code.

    Using the IATA code of the nearest major airport as the city component is
    the industry-standard convention (``…BOG…``) and keeps the identifier both
    short and globally unambiguous.
    """
    # Phase 5 Task 28 (Req 23.2) — `naming_mode` gates this record's only
    # computed field, `vf_long_name`.
    if not _is_auto(dc):
        return
    base = ""
    if dc.site_id:
        site = await session.get(models.Site, dc.site_id)
        if site and site.vf_long_name:
            base = site.vf_long_name
    iata = (getattr(dc, "iata_code", None) or "").strip()
    code = (dc.code or "").strip()
    dc.vf_long_name = f"{base}{iata}{code}".upper() or None


async def generate_rack(session: AsyncSession, rack: models.Rack) -> None:
    # Phase 5 Task 28 (Req 23.2) — `naming_mode` gates this record's only
    # computed field, `vf_long_name`.
    if not _is_auto(rack):
        return
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


async def generate_patch_panel(session: AsyncSession, panel: models.PatchPanel) -> None:
    """Phase 5 Task 3: patch panel identifier, mirroring ``generate_rack``'s
    site/coordinates composition — previously ``panel_id_label`` had no
    generator at all, so it was permanently blank for anyone relying on it as
    a computed field.

    Composition: parent rack's ``vf_long_name`` + ``PP`` + a per-rack sequence
    number (``rack_unit`` when the panel is already mounted, otherwise the
    next free sequence among that rack's other patch panels, so multiple
    unplaced panels still get distinct identifiers).

    Phase 5 Task 28 (Req 23.2) — `naming_mode` gates this record's only
    computed field, `panel_id_label`.
    """
    if not _is_auto(panel):
        return
    base = ""
    if panel.rack_id:
        rack = await session.get(models.Rack, panel.rack_id)
        if rack and rack.vf_long_name:
            base = rack.vf_long_name
    seq = panel.rack_unit
    if seq is None:
        conditions = [models.PatchPanel.id != (panel.id or -1)]
        if panel.rack_id is not None:
            conditions.append(models.PatchPanel.rack_id == panel.rack_id)
        existing = (
            await session.execute(
                select(func.count(models.PatchPanel.id)).where(*conditions)
            )
        ).scalar_one()
        seq = existing + 1
    panel.panel_id_label = f"{base}PP{seq}".upper()


async def generate_power_device(session: AsyncSession, dev: models.PowerDevice) -> None:
    """Phase 5 Task 3: power device identifier, mirroring
    ``generate_network_device``'s site/rack composition — previously
    ``vf_long_name`` had no generator at all, yet was rendered read-only (as
    every other computed name column is), so it could never be populated by
    anyone.

    Composition: parent site's ``vf_long_name`` + parent rack's grid
    coordinates (when racked) + the device type (``ups``/``pdu``) + a
    sequence number (``device_number`` when set, otherwise the next free
    sequence scoped to the same rack, or the same site when unracked).

    Phase 5 Task 28 (Req 23.2) — `naming_mode` gates this record's only
    computed field, `vf_long_name`.
    """
    if not _is_auto(dev):
        return
    base = ""
    if dev.site_id:
        site = await session.get(models.Site, dev.site_id)
        if site and site.vf_long_name:
            base = site.vf_long_name
    rack_part = ""
    if dev.rack_id:
        rack = await session.get(models.Rack, dev.rack_id)
        if rack and rack.grid_coordinates:
            rack_part = rack.grid_coordinates
    kind = (dev.device_type or "pdu").upper()
    seq = dev.device_number
    if seq is None:
        conditions = [models.PowerDevice.id != (dev.id or -1)]
        if dev.rack_id is not None:
            conditions.append(models.PowerDevice.rack_id == dev.rack_id)
        elif dev.site_id is not None:
            conditions.append(models.PowerDevice.site_id == dev.site_id)
        existing = (
            await session.execute(
                select(func.count(models.PowerDevice.id)).where(*conditions)
            )
        ).scalar_one()
        seq = existing + 1
    dev.vf_long_name = f"{base}{rack_part}{kind}{seq}".upper()


async def _device_display_name(
    session: AsyncSession, device_type: Optional[str], device_id: Optional[int]
) -> str:
    """Best display name for a polymorphic (type, id) device reference.

    FEAT-6 (6C): ``device_type`` is the kebab-case ENTITY_REGISTRY slug stored on
    a cable end (``port_a_type`` / ``port_b_type``); ``device_id`` its PK. The
    slug is mapped to its ORM model via the registry and the most identifying
    name field is returned. Falls back to ``"{slug}#{id}"`` when the row cannot
    be resolved, and ``""`` when the reference is empty.
    """
    if not device_type or device_id is None:
        return ""
    # Imported lazily to avoid a circular import (registry imports models).
    from .registry import ENTITY_REGISTRY

    model = ENTITY_REGISTRY.get(device_type)
    if model is None:
        return f"{device_type}#{device_id}"
    obj = await session.get(model, device_id)
    if obj is None:
        return f"{device_type}#{device_id}"
    for attr in (
        "vf_long_name",
        "vf_short_name",
        "vf_friendly_name",
        "simple_name",
        "name",
        "full_name",
        "code",
    ):
        value = getattr(obj, attr, None)
        if value:
            return str(value)
    return f"{device_type}#{device_id}"


async def generate_cable(session: AsyncSession, cable: models.Cable) -> None:
    """FEAT-6 (6C): auto-generate the physical-labeling Cable_Label.

    Format: ``{from_device_name}-{from_port}->{to_device_name}-{to_port}`` using
    the '->' arrow. ``label_a`` / ``label_b`` carry the per-end port labels; the
    device names are resolved from the polymorphic ``port_a`` / ``port_b``
    references. Empty ends collapse gracefully so a half-connected cable still
    gets a sensible label. Regenerated on every create/update via apply_naming.
    """
    from_name = await _device_display_name(session, cable.port_a_type, cable.port_a_id)
    to_name = await _device_display_name(session, cable.port_b_type, cable.port_b_id)
    from_port = (cable.label_a or "").strip()
    to_port = (cable.label_b or "").strip()
    left = "-".join(p for p in (from_name, from_port) if p)
    right = "-".join(p for p in (to_name, to_port) if p)
    label = "→".join(p for p in (left, right) if p)
    cable.label = (label or None)


# Dispatch table: model class -> generator coroutine
GENERATORS = {
    models.Site: generate_site,
    models.Datacenter: generate_datacenter,
    models.Rack: generate_rack,
    models.PhysicalServer: generate_physical_server,
    models.VirtualMachine: generate_vm,
    models.ContainerApp: generate_container,
    models.Workstation: generate_workstation,
    models.NetworkDevice: generate_network_device,
    models.Cable: generate_cable,
    models.PatchPanel: generate_patch_panel,
    models.PowerDevice: generate_power_device,
}


def _is_auto(obj) -> bool:
    """Phase 5 Task 28 (Req 23.1/23.2/23.3) — True unless *obj*'s
    `naming_mode` is explicitly "manual". Models with no `naming_mode`
    column (`getattr` falls back to None) are always auto, which preserves
    every pre-Task-28 generator's unconditional behavior unchanged."""
    return (getattr(obj, "naming_mode", None) or "auto") != "manual"


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
    # FEAT-5: the datacenter name is the parent site plus the IATA city code.
    models.Datacenter: ["site_id", "iata_code"],
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

# Readable location path. Floor / Room have no generator (they are not part of
# the Organization>Cloud>…>Rack naming chain) so only their path is previewed;
# Datacenter does have one since FEAT-5 but still needs its parent path.
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
        # FEAT-1: for sites in "auto"/"theme" mode the generator fills this in,
        # so the form can show the code that will actually be stored.
        "simple_name": getattr(obj, "simple_name", None) or None,
        "vf_long_name": getattr(obj, "vf_long_name", None) or None,
        "vf_short_name": getattr(obj, "vf_short_name", None) or None,
        "tia606b_name": getattr(obj, "tia606b_name", None) or None,
        "vf_friendly_name": getattr(obj, "vf_friendly_name", None) or None,
        "path": " › ".join(p for p in path_parts if p),
        "missing": missing,
        "complete": generator is not None and not missing,
        "generated": generator is not None,
    }
