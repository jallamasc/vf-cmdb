"""FEAT-6 (6C): port ownership + physical-location resolution for cabling.

The Connect panel (and the back-face renderer) need to answer, for any port:
  * who OWNS it (which device), and
  * where that device physically lives (rack, then datacenter/site),
so it can offer only connectable destination ports.

Neither lookup is a plain FK in the schema, so both rules are defined here once
and reused. See design.md "Physical-location resolution".
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import models
from .registry import ENTITY_REGISTRY

# Device classes that can be mounted in a rack and can own ports for cabling.
# Maps the kebab-case slug (as stored on owner_device_type / port_*_type) to the
# ORM model. PowerOutlet is handled separately (it is a port, not a device).
RACKABLE_SLUGS = {
    "network-devices": models.NetworkDevice,
    "physical-servers": models.PhysicalServer,
    "workstations": models.Workstation,
}


def _slug_for_model(model) -> Optional[str]:
    for slug, m in ENTITY_REGISTRY.items():
        if m is model:
            return slug
    return None


def _alias_set(slug: str) -> list[str]:
    """Every spelling a free-text ``*_type`` discriminator might hold for a slug.

    Mirrors devices.polymorphic_aliases so a value written as ``physical-servers``
    or ``physical_servers`` both match. Lower-cased comparison at the call site.
    """
    model = RACKABLE_SLUGS.get(slug) or ENTITY_REGISTRY.get(slug)
    aliases = {slug, slug.replace("-", "_")}
    if model is not None:
        table = model.__tablename__
        singular = table[:-1] if table.endswith("s") else table
        aliases |= {
            table,
            model.__name__.lower(),
            singular,
            singular.replace("_", "-"),
        }
    return sorted(a for a in aliases if a)


# ---------------------------------------------------------------------------
# Resolution rule A: which rack is a device in?
# ---------------------------------------------------------------------------
async def device_rack_id(
    session: AsyncSession, device_type: str, device_id: int
) -> Optional[int]:
    """Rack a device is mounted in, or None.

    1. Direct ``rack_id`` column on the device model, when set.
    2. Otherwise via a rack_units row whose (device_table, device_id)
       discriminator matches (device_table is matched loosely, like the other
       polymorphic columns).
    """
    model = RACKABLE_SLUGS.get(device_type) or ENTITY_REGISTRY.get(device_type)
    if model is not None:
        obj = await session.get(model, device_id)
        if obj is not None:
            direct = getattr(obj, "rack_id", None)
            if direct:
                return int(direct)
    # Fall back to a rack_units placement.
    aliases = _alias_set(device_type)
    ru = models.RackUnit
    stmt = select(ru.rack_id).where(
        ru.device_id == device_id,
        or_(*[func.lower(ru.device_table) == a.lower() for a in aliases]),
    ).limit(1)
    rack_id = (await session.execute(stmt)).scalars().first()
    return int(rack_id) if rack_id else None


# ---------------------------------------------------------------------------
# Resolution rule B: which datacenter (and site) is a rack in?
# ---------------------------------------------------------------------------
async def rack_scope(
    session: AsyncSession, rack_id: int
) -> dict[str, Optional[int]]:
    """Return {'rack_id', 'datacenter_id', 'site_id'} for a rack.

    datacenter_id resolves via datacenter_floor_id -> datacenter, else
    room_id -> floor -> datacenter. site_id is the rack's own site_id.
    """
    rack = await session.get(models.Rack, rack_id)
    if rack is None:
        return {"rack_id": rack_id, "datacenter_id": None, "site_id": None}
    datacenter_id: Optional[int] = None
    floor_id = rack.datacenter_floor_id
    if floor_id is None and rack.room_id:
        room = await session.get(models.Room, rack.room_id)
        if room is not None:
            floor_id = room.datacenter_floor_id
    if floor_id is not None:
        floor = await session.get(models.DatacenterFloor, floor_id)
        if floor is not None:
            datacenter_id = floor.datacenter_id
    return {
        "rack_id": rack_id,
        "datacenter_id": datacenter_id,
        "site_id": rack.site_id,
    }


# ---------------------------------------------------------------------------
# Port ownership resolution (interface owner rule)
# ---------------------------------------------------------------------------
def interface_owner(iface: models.DeviceInterface) -> tuple[Optional[str], Optional[int]]:
    """(owner_type, owner_id) for a DeviceInterface.

    The polymorphic (owner_device_type, owner_device_id) pair wins when set;
    otherwise fall back to the legacy network_device_id (network-devices).
    """
    if iface.owner_device_type and iface.owner_device_id:
        return iface.owner_device_type, iface.owner_device_id
    if iface.network_device_id:
        return "network-devices", iface.network_device_id
    return None, None


# ---------------------------------------------------------------------------
# Candidate collection
# ---------------------------------------------------------------------------
async def _device_name(session: AsyncSession, slug: str, dev_id: int) -> str:
    model = RACKABLE_SLUGS.get(slug) or ENTITY_REGISTRY.get(slug)
    if model is None:
        return f"{slug}#{dev_id}"
    obj = await session.get(model, dev_id)
    if obj is None:
        return f"{slug}#{dev_id}"
    for attr in ("vf_long_name", "vf_short_name", "vf_friendly_name", "simple_name", "name", "code"):
        v = getattr(obj, attr, None)
        if v:
            return str(v)
    return f"{slug}#{dev_id}"


def _interface_port_type(iface: models.DeviceInterface) -> str:
    """copper vs fiber from the interface speed/media (best-effort)."""
    speed = (iface.speed or "").lower()
    if any(tag in speed for tag in ("sfp", "fiber", "fibre", "lc", "sr", "lr", "optical")):
        return "fiber"
    return "copper"


async def candidate_ports(
    session: AsyncSession,
    source_type: str,
    source_id: int,
    source_port_kind: str,
    source_port_id: int,
) -> dict[str, Any]:
    """Connectable destination ports for a source port.

    Scope: same rack, else (fallback) same datacenter, else same site, else same
    rack only. Excludes the source port. Raises LookupError when the source
    cannot be located to any rack.
    """
    src_rack = await device_rack_id(session, source_type, source_id)
    if src_rack is None:
        raise LookupError("source device is not mounted in any rack")
    scope = await rack_scope(session, src_rack)

    # Determine which racks are in scope.
    rack_ids: set[int] = {src_rack}
    scope_kind = "rack"
    if scope["datacenter_id"] is not None:
        rack_ids = await _racks_in_datacenter(session, scope["datacenter_id"])
        scope_kind = "datacenter"
    elif scope["site_id"] is not None:
        rack_ids = await _racks_in_site(session, scope["site_id"])
        scope_kind = "site"
    rack_ids.add(src_rack)

    candidates: list[dict[str, Any]] = []

    # 1. DeviceInterfaces owned by devices resolving into an in-scope rack.
    ifaces = (await session.execute(select(models.DeviceInterface))).scalars().all()
    for iface in ifaces:
        owner_type, owner_id = interface_owner(iface)
        if not owner_type or not owner_id:
            continue
        if source_port_kind == "interface" and iface.id == source_port_id:
            continue
        rid = await device_rack_id(session, owner_type, owner_id)
        if rid is None or rid not in rack_ids:
            continue
        candidates.append(
            {
                "port_kind": "interface",
                "port_id": iface.id,
                "owner_type": owner_type,
                "owner_id": owner_id,
                "owner_name": await _device_name(session, owner_type, owner_id),
                "label": iface.description or (f"port {iface.port_number}" if iface.port_number else f"if#{iface.id}"),
                "port_type": _interface_port_type(iface),
                "rack_id": rid,
                "same_rack": rid == src_rack,
            }
        )

    # 2. PowerOutlets (power ports) with a rack_id in scope.
    outlets = (
        await session.execute(
            select(models.PowerOutlet).where(models.PowerOutlet.rack_id.isnot(None))
        )
    ).scalars().all()
    for outlet in outlets:
        if source_port_kind == "outlet" and outlet.id == source_port_id:
            continue
        if outlet.rack_id not in rack_ids:
            continue
        owner_name = ""
        if outlet.power_device_id:
            pd = await session.get(models.PowerDevice, outlet.power_device_id)
            if pd is not None:
                owner_name = pd.vf_long_name or f"power-devices#{pd.id}"
        candidates.append(
            {
                "port_kind": "outlet",
                "port_id": outlet.id,
                "owner_type": "power-devices",
                "owner_id": outlet.power_device_id,
                "owner_name": owner_name or "power outlet",
                "label": outlet.label or (f"outlet {outlet.port_number}" if outlet.port_number else f"po#{outlet.id}"),
                "port_type": "power",
                "rack_id": outlet.rack_id,
                "same_rack": outlet.rack_id == src_rack,
            }
        )

    # 3. PatchPanelPorts. Unlike interfaces/outlets, PatchPanelPort has no
    # rack_id of its own and no polymorphic owner columns — it always belongs
    # to exactly one PatchPanel via the plain patch_panel_id FK, and THAT
    # panel carries the rack_id, so resolution goes patch_panel_id ->
    # PatchPanel.rack_id (parallel to how a PowerOutlet's own rack_id already
    # resolves today). The owner reported on a candidate/cable end is the
    # PANEL, not the individual port (same as PowerDevice/PowerOutlet above),
    # so label disambiguation on the Cable end is what identifies the
    # specific port. PatchPanelPort also has no media-type column (no
    # copper/fiber distinction in the schema), so port_type is hardcoded to
    # "copper" here — the same simplification the PowerOutlet loop makes by
    # hardcoding "power".
    panels_by_id = {
        p.id: p for p in (await session.execute(select(models.PatchPanel))).scalars().all()
    }
    pports = (await session.execute(select(models.PatchPanelPort))).scalars().all()
    for pport in pports:
        if source_port_kind == "patch_panel_port" and pport.id == source_port_id:
            continue
        panel = panels_by_id.get(pport.patch_panel_id)
        if panel is None or panel.rack_id is None or panel.rack_id not in rack_ids:
            continue
        candidates.append(
            {
                "port_kind": "patch_panel_port",
                "port_id": pport.id,
                "owner_type": "patch-panels",
                "owner_id": panel.id,
                "owner_name": panel.panel_id_label or f"patch-panels#{panel.id}",
                "label": pport.label or f"port {pport.port_number}",
                "port_type": "copper",
                "rack_id": panel.rack_id,
                "same_rack": panel.rack_id == src_rack,
            }
        )

    # Same-rack candidates first, then the rest.
    candidates.sort(key=lambda c: (not c["same_rack"], c["owner_name"], c["label"]))
    return {
        "source": {
            "device_type": source_type,
            "device_id": source_id,
            "port_kind": source_port_kind,
            "port_id": source_port_id,
            "rack_id": src_rack,
            "datacenter_id": scope["datacenter_id"],
            "site_id": scope["site_id"],
        },
        "scope": scope_kind,
        "candidates": candidates,
    }


async def _racks_in_datacenter(session: AsyncSession, datacenter_id: int) -> set[int]:
    """All rack ids whose datacenter resolves to datacenter_id (via floor or room)."""
    # floors in this datacenter
    floor_ids = set(
        (
            await session.execute(
                select(models.DatacenterFloor.id).where(
                    models.DatacenterFloor.datacenter_id == datacenter_id
                )
            )
        ).scalars().all()
    )
    if not floor_ids:
        return set()
    # rooms on those floors
    room_ids = set(
        (
            await session.execute(
                select(models.Room.id).where(
                    models.Room.datacenter_floor_id.in_(floor_ids)
                )
            )
        ).scalars().all()
    )
    stmt = select(models.Rack.id).where(
        or_(
            models.Rack.datacenter_floor_id.in_(floor_ids),
            models.Rack.room_id.in_(room_ids) if room_ids else models.Rack.id.is_(None),
        )
    )
    return set((await session.execute(stmt)).scalars().all())


async def _racks_in_site(session: AsyncSession, site_id: int) -> set[int]:
    stmt = select(models.Rack.id).where(models.Rack.site_id == site_id)
    return set((await session.execute(stmt)).scalars().all())
