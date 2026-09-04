"""FEAT-7 — device detail dashboard: type resolution and related-record lookups.

The dashboard at ``/devices/:type/:id`` needs three things the generic CRUD
router cannot give it:

1. one record with every field (``GET /api/v1/{resource}/{id}`` already does
   this — see :mod:`app.routers.generic`);
2. the *related* records for that one device, filtered server-side;
3. a description of which tabs actually apply to the device type, so the UI
   never shows a tab that can only ever be empty.

Everything here is read-only. Writes keep going through the generic CRUD
endpoints so audit logging and naming stay in one place.
"""
from __future__ import annotations

from typing import Any, Iterable, Optional

from sqlalchemy import false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import crud, models

# ---------------------------------------------------------------------------
# Device type resolution
# ---------------------------------------------------------------------------
# The frontend route uses the table-ish form (``physical_servers``) while the
# REST API uses kebab-case slugs (``physical-servers``). Both are accepted here
# so a URL a user copied out of either place resolves; the kebab-case slug is
# never changed (MEMORY_BANK rule 5) and is echoed back as ``resource``.


class DeviceType:
    """One dashboard-capable device type and the relations it exposes."""

    def __init__(
        self,
        key: str,
        slug: str,
        model: type,
        label: str,
        *,
        name_fields: list[str],
        relations: list[str],
    ) -> None:
        self.key = key  # canonical, underscored: "physical_servers"
        self.slug = slug  # REST resource slug: "physical-servers"
        self.model = model
        self.label = label
        self.name_fields = name_fields
        self.relations = relations

    @property
    def table(self) -> str:
        return self.model.__tablename__


DEVICE_TYPES: dict[str, DeviceType] = {
    dt.key: dt
    for dt in [
        DeviceType(
            "physical_servers",
            "physical-servers",
            models.PhysicalServer,
            "Physical Server",
            name_fields=["vf_long_name", "vf_short_name", "alternative_name"],
            # A server has no ports of its own in the schema; the interfaces
            # tab shows the switch ports it is patched into.
            relations=[
                "interfaces",
                "ip-assignments",
                "virtual-machines",
                "containers-apps",
                "cables",
                "changelog",
            ],
        ),
        DeviceType(
            "virtual_machines",
            "virtual-machines",
            models.VirtualMachine,
            "Virtual Machine",
            name_fields=["vf_short_name", "friendly_name"],
            relations=["interfaces", "ip-assignments", "containers-apps", "changelog"],
        ),
        DeviceType(
            "workstations",
            "workstations",
            models.Workstation,
            "Workstation",
            name_fields=["vf_long_name", "vf_short_name", "alternative_name"],
            relations=["interfaces", "ip-assignments", "cables", "changelog"],
        ),
        DeviceType(
            "network_devices",
            "network-devices",
            models.NetworkDevice,
            "Network Device",
            name_fields=["vf_long_name", "vf_friendly_name", "alternative_name"],
            relations=["interfaces", "ip-assignments", "cables", "changelog"],
        ),
    ]
}

# Accept the kebab-case slug as an alias for the underscored key.
_ALIASES: dict[str, str] = {}
for _dt in DEVICE_TYPES.values():
    _ALIASES[_dt.key] = _dt.key
    _ALIASES[_dt.slug] = _dt.key
    _ALIASES[_dt.model.__name__.lower()] = _dt.key


def resolve(device_type: str) -> Optional[DeviceType]:
    """Return the :class:`DeviceType` for any accepted spelling, else None."""
    key = _ALIASES.get((device_type or "").strip().lower())
    return DEVICE_TYPES.get(key) if key else None


def known_device_types() -> list[str]:
    return sorted(DEVICE_TYPES)


def polymorphic_aliases(dt: DeviceType) -> list[str]:
    """Every spelling a polymorphic ``*_type`` column might hold for ``dt``.

    ``ip_assignments.assigned_to_type``, ``cables.port_a_type`` and
    ``device_interfaces.connected_device_type`` are free-text discriminators
    with no constraint, so rather than guess a single convention we match any
    of the forms the codebase uses elsewhere (table name, REST slug, model
    name, singular). Comparison is done lower-cased.
    """
    model_name = dt.model.__name__
    singular = dt.table[:-1] if dt.table.endswith("s") else dt.table
    return sorted(
        {
            dt.key,
            dt.slug,
            dt.table,
            model_name.lower(),
            singular,
            singular.replace("_", "-"),
        }
    )


# ---------------------------------------------------------------------------
# Relation metadata (what each tab is, so the UI can label it honestly)
# ---------------------------------------------------------------------------
RELATION_RESOURCES: dict[str, str] = {
    "interfaces": "device-interfaces",
    "ip-assignments": "ip-assignments",
    "virtual-machines": "virtual-machines",
    "containers-apps": "containers-apps",
    "cables": "cables",
    "changelog": "changelog",
}


async def _rows(session: AsyncSession, stmt) -> list[dict[str, Any]]:
    result = await session.execute(stmt)
    return [crud.to_dict(o) for o in result.scalars().all()]


def _type_matches(column, values: Iterable[str]):
    """``column`` equals any of ``values``, case-insensitively.

    Used for the free-text discriminator columns (``assigned_to_type``,
    ``port_a_type``, ``connected_device_type``): the schema puts no constraint
    on them, so a row written as ``physical-servers`` and one written as
    ``physical_servers`` both have to be found.
    """
    lowered = [v.lower() for v in values if v]
    if not lowered:
        return false()
    return or_(false(), *[func.lower(column) == v for v in lowered])


# ---------------------------------------------------------------------------
# Related-record queries
# ---------------------------------------------------------------------------
async def related_interfaces(
    session: AsyncSession, dt: DeviceType, device_id: int
) -> dict[str, Any]:
    """Ports for a device.

    ``device_interfaces.network_device_id`` is NOT NULL and points at
    ``network_devices``, so only a network device *owns* interfaces. For every
    other device type the meaningful relation is the reverse one: the switch
    ports that name this device in ``connected_device_type/_id``.
    """
    model = models.DeviceInterface
    if dt.key == "network_devices":
        stmt = (
            select(model)
            .where(model.network_device_id == device_id)
            .order_by(model.port_number.asc().nulls_last(), model.id.asc())
        )
        return {
            "rows": await _rows(session, stmt),
            "owned": True,
            "fk_field": "network_device_id",
            "note": "Ports belonging to this device.",
        }

    aliases = polymorphic_aliases(dt)
    stmt = (
        select(model)
        .where(
            model.connected_device_id == device_id,
            _type_matches(model.connected_device_type, aliases),
        )
        .order_by(model.network_device_id.asc(), model.port_number.asc().nulls_last())
    )
    return {
        "rows": await _rows(session, stmt),
        "owned": False,
        "fk_field": None,
        "note": (
            "Switch ports this device is patched into. Interfaces are stored "
            "against the network device that owns the port, so they are "
            "read-only here — edit them on the owning device or on Port "
            "Configuration."
        ),
    }


async def related_ip_assignments(
    session: AsyncSession, dt: DeviceType, device_id: int
) -> dict[str, Any]:
    model = models.IpAssignment
    aliases = polymorphic_aliases(dt)
    stmt = (
        select(model)
        .where(
            model.assigned_to_id == device_id,
            _type_matches(model.assigned_to_type, aliases),
        )
        .order_by(model.is_primary.desc(), model.id.asc())
    )
    return {
        "rows": await _rows(session, stmt),
        "owned": True,
        "fk_field": "assigned_to_id",
        "assigned_to_type": dt.slug,
        "note": (
            "IP bindings whose “assigned to” points at this device. New rows "
            f"are created with assigned_to_type = “{dt.slug}”."
        ),
    }


async def related_virtual_machines(
    session: AsyncSession, dt: DeviceType, device_id: int
) -> dict[str, Any]:
    model = models.VirtualMachine
    stmt = (
        select(model)
        .where(model.host_server_id == device_id)
        .order_by(model.id.asc())
    )
    return {
        "rows": await _rows(session, stmt),
        "owned": True,
        "fk_field": "host_server_id",
        "note": "Guest VMs whose host server is this machine.",
    }


async def related_containers_apps(
    session: AsyncSession, dt: DeviceType, device_id: int
) -> dict[str, Any]:
    model = models.ContainerApp
    if dt.key == "physical_servers":
        column, fk_field = model.host_server_id, "host_server_id"
        note = "Containers and apps running directly on this server."
    else:
        column, fk_field = model.host_vm_id, "host_vm_id"
        note = "Containers and apps running on this VM."
    stmt = select(model).where(column == device_id).order_by(model.id.asc())
    return {
        "rows": await _rows(session, stmt),
        "owned": True,
        "fk_field": fk_field,
        "note": note,
    }


async def related_cables(
    session: AsyncSession, dt: DeviceType, device_id: int
) -> dict[str, Any]:
    """Cables that terminate on this device at either the A or the B end."""
    model = models.Cable
    aliases = polymorphic_aliases(dt)
    stmt = (
        select(model)
        .where(
            or_(
                (model.port_a_id == device_id)
                & _type_matches(model.port_a_type, aliases),
                (model.port_b_id == device_id)
                & _type_matches(model.port_b_type, aliases),
            )
        )
        .order_by(model.id.asc())
    )
    return {
        "rows": await _rows(session, stmt),
        "owned": True,
        "fk_field": "port_a_id",
        "port_type": dt.slug,
        "note": (
            "Cables terminating on this device at either end. New rows are "
            f"created with the A end set to “{dt.slug}” on this device."
        ),
    }


async def related_changelog(
    session: AsyncSession, dt: DeviceType, device_id: int, limit: int = 200
) -> dict[str, Any]:
    model = models.ChangeLog
    stmt = (
        select(model)
        .where(model.table_name == dt.table, model.record_id == device_id)
        .order_by(model.changed_at.desc(), model.id.desc())
        .limit(limit)
    )
    return {
        "rows": await _rows(session, stmt),
        "owned": False,
        "fk_field": None,
        "note": f"Field-level history recorded for {dt.table}#{device_id}.",
    }


RELATION_LOADERS = {
    "interfaces": related_interfaces,
    "ip-assignments": related_ip_assignments,
    "virtual-machines": related_virtual_machines,
    "containers-apps": related_containers_apps,
    "cables": related_cables,
    "changelog": related_changelog,
}


# ---------------------------------------------------------------------------
# Context (where the device physically lives)
# ---------------------------------------------------------------------------
async def device_context(
    session: AsyncSession, dt: DeviceType, obj
) -> dict[str, Any]:
    """Resolve the human-readable location of a device for the header strip."""
    context: dict[str, Any] = {
        "site": None,
        "rack": None,
        "rack_unit": getattr(obj, "rack_unit", None),
        "room": None,
        "datacenter": None,
        "host_server": None,
        "position": None,
    }

    site_id = getattr(obj, "site_id", None)
    if site_id:
        site = await session.get(models.Site, site_id)
        if site is not None:
            context["site"] = site.simple_name or site.vf_long_name or f"site#{site.id}"

    rack_id = getattr(obj, "rack_id", None)
    if rack_id:
        rack = await session.get(models.Rack, rack_id)
        if rack is not None:
            context["rack"] = (
                rack.simple_name or rack.code or rack.vf_long_name or f"rack#{rack.id}"
            )
            if rack.room_id:
                room = await session.get(models.Room, rack.room_id)
                if room is not None:
                    context["room"] = room.name or room.code
            if rack.datacenter_floor_id:
                floor = await session.get(models.DatacenterFloor, rack.datacenter_floor_id)
                if floor is not None and floor.datacenter_id:
                    dc = await session.get(models.Datacenter, floor.datacenter_id)
                    if dc is not None:
                        context["datacenter"] = dc.name or dc.code

    host_id = getattr(obj, "host_server_id", None)
    if host_id:
        host = await session.get(models.PhysicalServer, host_id)
        if host is not None:
            context["host_server"] = host.vf_long_name or host.vf_short_name or f"server#{host.id}"

    bits = [b for b in (context["site"], context["datacenter"], context["room"]) if b]
    if context["rack"]:
        unit = context["rack_unit"]
        bits.append(f"rack {context['rack']}" + (f" · U{unit}" if unit else ""))
    context["position"] = " › ".join(bits)
    return context


def device_display_name(dt: DeviceType, obj) -> str:
    for field in dt.name_fields:
        value = getattr(obj, field, None)
        if value:
            return str(value)
    return f"{dt.label} #{obj.id}"
