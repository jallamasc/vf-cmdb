"""Special endpoints: dashboard, IPAM, naming, changelog, Ansible, facts."""
from __future__ import annotations

import ipaddress
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import abbrev, airports, crud, devices, models, naming, ports, stencils, themes
from ..config import settings
from ..database import get_session
from ..registry import ENTITY_REGISTRY

# Device tables that carry a naming prefix + sequence number.
_SEQUENCE_MODELS = [
    models.NetworkDevice,
    models.PhysicalServer,
    models.VirtualMachine,
    models.ContainerApp,
    models.Workstation,
]

router = APIRouter(tags=["special"])


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
async def _count(session: AsyncSession, model) -> int:
    result = await session.execute(select(func.count()).select_from(model))
    return int(result.scalar() or 0)


@router.get("/dashboard/summary")
async def dashboard_summary(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    counts = {
        "sites": await _count(session, models.Site),
        "racks": await _count(session, models.Rack),
        "network_devices": await _count(session, models.NetworkDevice),
        "physical_servers": await _count(session, models.PhysicalServer),
        "virtual_machines": await _count(session, models.VirtualMachine),
        "containers_apps": await _count(session, models.ContainerApp),
        "workstations": await _count(session, models.Workstation),
        "vlans": await _count(session, models.Vlan),
        "subnets_ipv4": await _count(session, models.SubnetIpv4),
        "subnets_ipv6": await _count(session, models.SubnetIpv6),
        "ip_assignments": await _count(session, models.IpAssignment),
    }
    recent = await session.execute(
        select(models.ChangeLog).order_by(models.ChangeLog.changed_at.desc()).limit(15)
    )
    recent_changes = [crud.to_dict(c) for c in recent.scalars().all()]
    return {"counts": counts, "recent_changes": recent_changes}


# ---------------------------------------------------------------------------
# Changelog
# ---------------------------------------------------------------------------
@router.get("/changelog")
async def changelog(
    table_name: Optional[str] = None,
    record_id: Optional[int] = None,
    change_source: Optional[str] = None,
    limit: int = Query(500, le=5000),
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    stmt = select(models.ChangeLog).order_by(models.ChangeLog.changed_at.desc())
    if table_name:
        stmt = stmt.where(models.ChangeLog.table_name == table_name)
    if record_id is not None:
        stmt = stmt.where(models.ChangeLog.record_id == record_id)
    if change_source:
        stmt = stmt.where(models.ChangeLog.change_source == change_source)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return [crud.to_dict(c) for c in result.scalars().all()]


# ---------------------------------------------------------------------------
# IPAM: next available IP
# ---------------------------------------------------------------------------
async def _used_ipv4(session: AsyncSession) -> set[str]:
    used: set[str] = set()
    for model, field in [
        (models.IpAssignment, "ipv4_address"),
        (models.SubnetRoleAssignment, "ipv4_address"),
        (models.NetworkDevice, "management_ipv4"),
        (models.PhysicalServer, "management_ipv4"),
        (models.PhysicalServer, "ilo_ipmi_ipv4"),
        (models.VirtualMachine, "management_ipv4"),
        (models.ContainerApp, "ipv4_address"),
        (models.Workstation, "management_ipv4"),
    ]:
        col = getattr(model, field)
        result = await session.execute(select(col).where(col.isnot(None)))
        for value in result.scalars().all():
            if value:
                used.add(str(value).split("/")[0])
    return used


@router.get("/ipam/subnets/{subnet_id}/next-ip")
async def next_ip(
    subnet_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    subnet = await session.get(models.SubnetIpv4, subnet_id)
    if subnet is None or not subnet.network_cidr:
        raise HTTPException(status_code=404, detail="Subnet not found or has no CIDR")
    try:
        net = ipaddress.ip_network(str(subnet.network_cidr), strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subnet CIDR")

    used = await _used_ipv4(session)
    range_from = (
        ipaddress.ip_address(str(subnet.range_from).split("/")[0])
        if subnet.range_from
        else next(net.hosts(), None)
    )
    range_to = (
        ipaddress.ip_address(str(subnet.range_to).split("/")[0])
        if subnet.range_to
        else None
    )
    for host in net.hosts():
        if range_from and host < range_from:
            continue
        if range_to and host > range_to:
            break
        if str(host) not in used:
            return {
                "subnet_id": subnet_id,
                "network": str(net),
                "next_ip": str(host),
                "used_count": len(
                    [u for u in used if ipaddress.ip_address(u) in net]
                ),
            }
    raise HTTPException(status_code=409, detail="No free IP available in subnet")


@router.get("/ipam/subnets/{subnet_id}/utilization")
async def subnet_utilization(
    subnet_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    subnet = await session.get(models.SubnetIpv4, subnet_id)
    if subnet is None or not subnet.network_cidr:
        raise HTTPException(status_code=404, detail="Subnet not found")
    net = ipaddress.ip_network(str(subnet.network_cidr), strict=False)
    used = await _used_ipv4(session)
    in_net = [u for u in used if ipaddress.ip_address(u) in net]
    total = net.num_addresses - 2 if net.num_addresses > 2 else net.num_addresses
    # Reservations that fall inside this subnet (includes the locked gateway).
    res_rows = (
        await session.execute(
            select(models.SubnetRoleAssignment.ipv4_address).where(
                models.SubnetRoleAssignment.subnet_ipv4_id == subnet_id,
                models.SubnetRoleAssignment.ipv4_address.isnot(None),
            )
        )
    ).scalars().all()
    reserved_used = len(
        [r for r in res_rows if r and ipaddress.ip_address(str(r).split("/")[0]) in net]
    )
    return {
        "subnet_id": subnet_id,
        "network": str(net),
        "total_usable": total,
        "used": len(in_net),
        "reserved_count": int(subnet.reserved_count or 0),
        "reserved_used": reserved_used,
        "reservation_anchor": subnet.reservation_anchor or "from_end",
        "utilization_pct": round(len(in_net) / total * 100, 1) if total else 0,
    }


# ---------------------------------------------------------------------------
# IPAM: reservations (reserved pool management)
# ---------------------------------------------------------------------------
def _reservation_dict(r: models.SubnetRoleAssignment) -> dict[str, Any]:
    return {
        "id": r.id,
        "subnet_ipv4_id": r.subnet_ipv4_id,
        "subnet_ipv6_id": r.subnet_ipv6_id,
        "role": r.role,
        "label": r.label,
        "ipv4_address": str(r.ipv4_address) if r.ipv4_address else None,
        "ipv6_address": str(r.ipv6_address) if r.ipv6_address else None,
        "is_locked": bool(r.is_locked),
        "notes": r.notes,
    }


async def _resolve_subnet(session: AsyncSession, subnet_id: int, family: str):
    """Return (subnet, family) where family is 'ipv4' or 'ipv6'.

    IPv4 and IPv6 subnets live in separate tables with independent id spaces, so
    the caller disambiguates with ``family`` (defaults to ipv4).
    """
    if family == "ipv6":
        subnet = await session.get(models.SubnetIpv6, subnet_id)
        return subnet, "ipv6"
    subnet = await session.get(models.SubnetIpv4, subnet_id)
    return subnet, "ipv4"


@router.get("/ipam/subnets/{subnet_id}/reservations")
async def list_reservations(
    subnet_id: int,
    family: str = Query("ipv4", pattern="^(ipv4|ipv6)$"),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    subnet, fam = await _resolve_subnet(session, subnet_id, family)
    if subnet is None:
        raise HTTPException(status_code=404, detail="Subnet not found")
    id_col = (
        models.SubnetRoleAssignment.subnet_ipv4_id
        if fam == "ipv4"
        else models.SubnetRoleAssignment.subnet_ipv6_id
    )
    rows = (
        await session.execute(
            select(models.SubnetRoleAssignment)
            .where(id_col == subnet_id)
            .order_by(models.SubnetRoleAssignment.id)
        )
    ).scalars().all()
    return [_reservation_dict(r) for r in rows]


@router.post("/ipam/subnets/{subnet_id}/reservations")
async def create_reservation(
    subnet_id: int,
    payload: dict[str, Any],
    family: str = Query("ipv4", pattern="^(ipv4|ipv6)$"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    subnet, fam = await _resolve_subnet(session, subnet_id, family)
    if subnet is None:
        raise HTTPException(status_code=404, detail="Subnet not found")

    addr_key = "ipv4_address" if fam == "ipv4" else "ipv6_address"
    id_col = (
        models.SubnetRoleAssignment.subnet_ipv4_id
        if fam == "ipv4"
        else models.SubnetRoleAssignment.subnet_ipv6_id
    )
    raw_addr = payload.get(addr_key) or payload.get("address")
    if not raw_addr:
        raise HTTPException(status_code=422, detail=f"{addr_key} is required")
    addr = str(raw_addr).split("/")[0]

    # Validate the address is inside the subnet.
    if subnet.network_cidr:
        try:
            net = ipaddress.ip_network(str(subnet.network_cidr), strict=False)
            ip_obj = ipaddress.ip_address(addr)
            if ip_obj not in net:
                raise HTTPException(
                    status_code=422,
                    detail=f"{addr} is not inside subnet {net}",
                )
            if ip_obj == net.network_address or (
                net.num_addresses > 1 and ip_obj == net.broadcast_address
            ):
                raise HTTPException(
                    status_code=422,
                    detail=f"{addr} is the network/broadcast address",
                )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid CIDR/address")

    existing = (
        await session.execute(
            select(models.SubnetRoleAssignment).where(id_col == subnet_id)
        )
    ).scalars().all()

    # Duplicate check.
    for r in existing:
        cur = getattr(r, addr_key)
        if cur and str(cur).split("/")[0] == addr:
            raise HTTPException(
                status_code=409, detail=f"{addr} is already reserved"
            )

    # Ceiling: manual (non-locked) reservations may not exceed reserved_count.
    ceiling = int(subnet.reserved_count or 0)
    manual = [r for r in existing if not r.is_locked]
    if len(manual) >= ceiling:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Reservation ceiling reached ({ceiling}). Increase the "
                "segment's reserved_count to add more reservations."
            ),
        )

    reservation = models.SubnetRoleAssignment(
        role=payload.get("role") or "reserved",
        label=payload.get("label"),
        is_locked=bool(payload.get("is_locked", False)),
        notes=payload.get("notes"),
    )
    setattr(reservation, "subnet_ipv4_id" if fam == "ipv4" else "subnet_ipv6_id", subnet_id)
    setattr(reservation, addr_key, addr)
    session.add(reservation)
    await session.flush()
    await crud._log(
        session,
        "subnet_role_assignments",
        reservation.id,
        addr_key,
        None,
        addr,
        "web_ui",
    )
    await session.commit()
    await session.refresh(reservation)
    return _reservation_dict(reservation)


@router.delete("/ipam/subnets/{subnet_id}/reservations/{reservation_id}")
async def delete_reservation(
    subnet_id: int,
    reservation_id: int,
    family: str = Query("ipv4", pattern="^(ipv4|ipv6)$"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    reservation = await session.get(models.SubnetRoleAssignment, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if reservation.is_locked:
        raise HTTPException(
            status_code=409,
            detail="Locked reservations (e.g. the gateway) cannot be deleted.",
        )
    addr = reservation.ipv4_address or reservation.ipv6_address
    await crud._log(
        session,
        "subnet_role_assignments",
        reservation_id,
        "__deleted__",
        str(addr) if addr else None,
        None,
        "web_ui",
    )
    await session.delete(reservation)
    await session.commit()
    return {"deleted": True, "id": reservation_id}


@router.get("/ipam/subnets/{subnet_id}/next-reserved")
async def next_reserved_ip(
    subnet_id: int,
    family: str = Query("ipv4", pattern="^(ipv4|ipv6)$"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Return the next free reservation IP honouring the segment anchor.

    ``from_end`` (default): walk hosts from the top of the subnet downwards
    (e.g. /24 -> .254, .253, ...), skipping the broadcast address. ``from_start``:
    walk upwards from the first host. Skips the network/broadcast, the gateway,
    existing reservations and any already-assigned host addresses (gap-aware).
    """
    subnet, fam = await _resolve_subnet(session, subnet_id, family)
    if subnet is None or not subnet.network_cidr:
        raise HTTPException(status_code=404, detail="Subnet not found or has no CIDR")
    try:
        net = ipaddress.ip_network(str(subnet.network_cidr), strict=False)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subnet CIDR")

    if fam == "ipv4":
        used = await _used_ipv4(session)
    else:
        used = set()
        col = models.SubnetRoleAssignment.ipv6_address
        rows = (await session.execute(select(col).where(col.isnot(None)))).scalars().all()
        for v in rows:
            if v:
                used.add(str(v).split("/")[0])
        col2 = models.IpAssignment.ipv6_address
        rows2 = (await session.execute(select(col2).where(col2.isnot(None)))).scalars().all()
        for v in rows2:
            if v:
                used.add(str(v).split("/")[0])

    anchor = (subnet.reservation_anchor or "from_end").lower()
    hosts = list(net.hosts())
    if anchor == "from_end":
        hosts = list(reversed(hosts))
    for host in hosts:
        if str(host) not in used:
            return {
                "subnet_id": subnet_id,
                "family": fam,
                "network": str(net),
                "anchor": anchor,
                # `ip` is the documented key; `next_reserved_ip` retained for
                # backward compatibility with earlier callers.
                "ip": str(host),
                "next_reserved_ip": str(host),
            }
    raise HTTPException(status_code=409, detail="No free reservation IP available")


# ---------------------------------------------------------------------------
# Naming generator
# ---------------------------------------------------------------------------
@router.get("/naming/generate")
async def naming_generate(
    request: Request,
    entity_type: str = "",
    organization: str = "",
    cloud: str = "",
    region: str = "",
    campus: str = "",
    building: str = "",
    floor_section: str = "",
    rack: str = "",
    device_type: str = "",
    brand: str = "",
    role: str = "",
    os_family: str = "",
    consecutive: str = "",
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Generate the names an entity would get, without writing anything.

    Two modes:

    * **entity_type given** (UX-4) — every other query parameter is read as a
      model column (``site_id``, ``organization_id``, ``code``, …). The values
      are fed to the very same generator used on create/update, so the live
      preview shown in the UI cannot drift from what gets persisted. Levels
      outside the naming chain (floor / room) return ``null`` names plus the
      readable location ``path``.
    * **no entity_type** — the original abbreviation-joining behaviour, kept so
      existing callers keep working.
    """
    if entity_type:
        # Everything except entity_type is treated as a model column; empty
        # values are dropped so a half-filled form still previews what it can.
        values: dict[str, Any] = {
            key: raw
            for key, raw in request.query_params.items()
            if key != "entity_type" and raw != ""
        }
        try:
            return await naming.preview_names(session, entity_type, values)
        except KeyError:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown entity_type '{entity_type}'. Known values: "
                    + ", ".join(sorted(naming.PREVIEW_MODELS))
                ),
            )

    site_long = "".join(
        [organization, cloud, region, campus, building, floor_section]
    ).upper()
    short = "".join([device_type, brand, role, os_family, consecutive]).lower()
    vf_long = f"{site_long}{rack.upper()}{short.upper()}"
    return {
        "site_long_name": site_long,
        "vf_short_name": short,
        "vf_long_name": vf_long,
        "tia606b_name": vf_long,
    }


# ---------------------------------------------------------------------------
# FEAT-1: automatic site code
# ---------------------------------------------------------------------------
@router.get("/naming/site-code")
async def naming_site_code(
    org_id: Optional[int] = None,
    campus_id: Optional[int] = None,
    region_id: Optional[int] = None,
    site_id: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Derive the automatic ``simple_name`` for a site (e.g. ``vfhmcc1``).

    The code is ``organization + campus + region + sequence``. Pass ``site_id``
    when editing an existing site so its own code is not counted as taken.
    Nothing is written — this is a pure preview used by the tri-mode selector.
    """
    code = await naming.auto_site_code(
        session, org_id, campus_id, region_id, exclude_site_id=site_id
    )
    return {
        "org_id": org_id,
        "campus_id": campus_id,
        "region_id": region_id,
        "site_code": code,
        # Which pickers still have to be filled in for a full code.
        "missing": [
            field
            for field, value in (
                ("org_id", org_id),
                ("campus_id", campus_id),
                ("region_id", region_id),
            )
            if value is None
        ],
        "complete": bool(code) and None not in (org_id, campus_id, region_id),
    }


# ---------------------------------------------------------------------------
# FEAT-3: themed fun names
# ---------------------------------------------------------------------------
@router.get("/naming/theme-names")
async def naming_theme_names(
    category: str = "",
    q: str = "",
    limit: int = 200,
) -> dict[str, Any]:
    """Search the built-in themed name catalogues.

    ``category`` is one of ``star_wars``, ``greek_mythology``,
    ``mountain_peaks`` or ``space_missions`` (omit it to search all of them);
    ``q`` filters case/accent insensitively with prefix matches ranked first.
    """
    results = themes.search(category or None, q, limit)
    return {
        "category": category or None,
        "q": q,
        "categories": themes.categories(),
        "count": len(results),
        "names": results,
    }


# ---------------------------------------------------------------------------
# FEAT-5: airport (IATA) code lookup for datacenters
# ---------------------------------------------------------------------------
@router.get("/naming/airport-code")
async def naming_airport_code(
    city: str = "",
    limit: int = 25,
) -> dict[str, Any]:
    """Resolve a city to the IATA code of its main airport.

    Returns the best match plus ``alternatives`` (cities such as London or
    Tokyo have several airports) and ``matches`` for autocomplete lists. An
    empty ``city`` returns suggestions instead of an error so the field can
    show options before the user types.
    """
    resolved = airports.lookup_city(city) if city else {
        "city": city,
        "iata_code": None,
        "airport": None,
        "country": None,
        "alternatives": [],
    }
    return {
        "query": city,
        "city": resolved["city"],
        "iata_code": resolved["iata_code"],
        "airport": resolved["airport"],
        "country": resolved["country"],
        "alternatives": resolved["alternatives"],
        "matches": airports.search(city, limit),
    }


# ---------------------------------------------------------------------------
# Naming: abbreviation preview + global uniqueness check
# ---------------------------------------------------------------------------
@router.get("/naming/preview")
async def naming_preview(
    full_name: str = "",
    trim_mode: str = "manual",
    case_enforcement: str = "mixed",
) -> dict[str, str]:
    """Preview the abbreviation derived from a full name by trim mode + case."""
    return {
        "full_name": full_name,
        "trim_mode": trim_mode,
        "case_enforcement": case_enforcement,
        "abbreviation": abbrev.preview_abbreviation(
            full_name, trim_mode, case_enforcement
        ),
    }


@router.get("/naming/check-abbreviation")
async def naming_check_abbreviation(
    value: str,
    entity_type: str = "",
    entity_id: Optional[int] = None,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Return whether *value* is available across the global namespace."""
    owner = await abbrev.check_available(session, value, entity_type or None, entity_id)
    return {"value": value, "available": owner is None, "owner": owner}


# ---------------------------------------------------------------------------
# Naming: sequence-number gap detection
# ---------------------------------------------------------------------------
@router.get("/naming/gaps")
async def naming_gaps(
    prefix: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Report used sequence numbers, available gaps and the next value for a prefix.

    Sequence numbers are scoped per ``name_prefix`` across all device tables and
    are plain integers (no zero padding). A gap is any missing integer between 1
    and the current maximum used sequence number.
    """
    used: set[int] = set()
    for model in _SEQUENCE_MODELS:
        result = await session.execute(
            select(model.sequence_number).where(
                model.name_prefix == prefix,
                model.sequence_number.isnot(None),
            )
        )
        for value in result.scalars().all():
            if value is not None:
                used.add(int(value))

    used_sorted = sorted(used)
    highest = used_sorted[-1] if used_sorted else 0
    gaps = [n for n in range(1, highest) if n not in used]
    next_sequential = highest + 1
    next_value = gaps[0] if gaps else next_sequential

    # Human-readable prompt, e.g. "Gaps available: RTSL2, RTSL3 -- use next gap,
    # or continue with RTSL4?"
    if gaps:
        gap_labels = ", ".join(f"{prefix}{n}" for n in gaps)
        message = (
            f"Gaps available: {gap_labels} -- use next gap, "
            f"or continue with {prefix}{next_sequential}?"
        )
    else:
        message = f"No gaps. Next available is {prefix}{next_sequential}."

    return {
        "prefix": prefix,
        "used": used_sorted,
        "gaps": gaps,
        "next_gap": gaps[0] if gaps else None,
        "next_sequential": next_sequential,
        "recommended": next_value,
        "message": message,
    }


# ---------------------------------------------------------------------------
# FEAT-7: device detail dashboard
# ---------------------------------------------------------------------------
def _device_type_or_404(device_type: str) -> devices.DeviceType:
    dt = devices.resolve(device_type)
    if dt is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Unknown device type '{device_type}'. "
                f"Known values: {', '.join(devices.known_device_types())}"
            ),
        )
    return dt


@router.get("/devices/{device_type}/{device_id}")
async def device_detail(
    device_type: str,
    device_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """One device with every column, its location and the tabs that apply.

    The record itself is also reachable through the generic
    ``GET /api/v1/{resource}/{id}``; this endpoint adds the resolved parent
    chain and the relation list so the dashboard never renders a tab that
    cannot hold data for this device type.
    """
    dt = _device_type_or_404(device_type)
    obj = await crud.get_item(session, dt.model, device_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{dt.label} {device_id} not found")

    return {
        "device_type": dt.key,
        "resource": dt.slug,
        "table": dt.table,
        "label": dt.label,
        "id": device_id,
        "display_name": devices.device_display_name(dt, obj),
        "name_fields": dt.name_fields,
        "relations": dt.relations,
        "relation_resources": {
            rel: devices.RELATION_RESOURCES[rel] for rel in dt.relations
        },
        "context": await devices.device_context(session, dt, obj),
        "record": crud.to_dict(obj),
    }


@router.get("/devices/{device_type}/{device_id}/related/{relation}")
async def device_related(
    device_type: str,
    device_id: int,
    relation: str,
    limit: int = Query(500, le=5000),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Records related to one device, filtered server-side.

    ``relation`` is one of the values in the device's ``relations`` list.
    Rows come back in the same shape the generic list endpoint uses, so the
    frontend can hand them straight to the grid and keep writing through the
    normal CRUD routes (which is what keeps audit logging intact).
    """
    dt = _device_type_or_404(device_type)
    if relation not in dt.relations:
        raise HTTPException(
            status_code=404,
            detail=(
                f"'{relation}' is not a relation of {dt.label}. "
                f"Known values: {', '.join(dt.relations)}"
            ),
        )

    obj = await crud.get_item(session, dt.model, device_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{dt.label} {device_id} not found")

    loader = devices.RELATION_LOADERS[relation]
    payload = (
        await loader(session, dt, device_id, limit=limit)
        if relation == "changelog"
        else await loader(session, dt, device_id)
    )
    payload.update(
        {
            "device_type": dt.key,
            "device_id": device_id,
            "relation": relation,
            "resource": devices.RELATION_RESOURCES[relation],
            "count": len(payload["rows"]),
        }
    )
    return payload


# ---------------------------------------------------------------------------
# FEAT-6 (6B): Visio Café stencil service (cache-first + manual upload)
# ---------------------------------------------------------------------------
# Device-type resources that carry a stencil_url column. A model slug passed to
# the stencil endpoints is looked up here to find its configured download URL.
STENCIL_RESOURCES = {
    "network-device-types": models.NetworkDeviceType,
    "compute-device-types": models.ComputeDeviceType,
    "storage-device-types": models.StorageDeviceType,
}

_SVG_HEADERS = {"Cache-Control": "public, max-age=86400"}


async def _stencil_url_for_slug(session: AsyncSession, model_slug: str) -> Optional[str]:
    """The configured ``stencil_url`` for a device-type identified by slug.

    ``model_slug`` may be either a device-type resource slug (a key of
    STENCIL_RESOURCES) or ``{resource}-{id}`` naming a specific device-type row.
    Returns None when no URL is configured or the row is not found.
    """
    # Exact resource match with no id -> cannot resolve a specific row.
    for resource, model in STENCIL_RESOURCES.items():
        prefix = f"{resource}-"
        if model_slug.startswith(prefix):
            tail = model_slug[len(prefix):]
            if tail.isdigit():
                row = await session.get(model, int(tail))
                return getattr(row, "stencil_url", None) if row else None
    return None


@router.get("/stencils/{model_slug}")
async def get_stencil(
    model_slug: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Serve a device model's stencil SVG, cache-first.

    1. If the SVG is already cached on disk, serve it (no network — air-gap safe).
    2. Else, if the device-type row has a ``stencil_url`` and Visio Café is
       reachable, download it, cache it and serve it.
    3. Else return 404.
    """
    try:
        slug = stencils.validate_slug(model_slug)
    except stencils.InvalidSlug as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if stencils.is_cached(slug):
        data = stencils.cache_path(slug).read_bytes()
        return Response(content=data, media_type="image/svg+xml", headers=_SVG_HEADERS)

    url = await _stencil_url_for_slug(session, slug)
    if url:
        path = stencils.download_and_cache(slug, url)
        if path is not None:
            return Response(
                content=path.read_bytes(),
                media_type="image/svg+xml",
                headers=_SVG_HEADERS,
            )
    raise HTTPException(status_code=404, detail="No stencil available for this model")


@router.post("/stencils/{model_slug}")
async def upload_stencil(
    model_slug: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upload an SVG stencil for a model, overwriting any cached copy.

    Works fully offline: the uploaded SVG is stored in the cache and served by
    the GET endpoint without ever contacting Visio Café.
    """
    try:
        slug = stencils.validate_slug(model_slug)
    except stencils.InvalidSlug as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    data = await file.read()
    try:
        stencils.store_bytes(slug, data, file.content_type)
    except stencils.InvalidStencil as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "model_slug": slug,
        "stored": True,
        "bytes": len(data),
        "path": f"{settings.api_prefix}/stencils/{slug}",
    }


# ---------------------------------------------------------------------------
# FEAT-6 (6C): connectable destination ports for a source port
# ---------------------------------------------------------------------------
@router.get("/ports/candidates")
async def port_candidates(
    source_type: str = Query(..., description="kebab-case device slug of the source port owner"),
    source_id: int = Query(...),
    source_port_kind: str = Query("interface", pattern="^(interface|outlet)$"),
    source_port_id: int = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """List ports the source port may be cabled to.

    Scope is same rack, else same datacenter, else same site, else same rack
    only (fallback), so a legitimately-placed rack always yields candidates.
    Returns 404 only when the source device cannot be located to any rack.
    """
    try:
        return await ports.candidate_ports(
            session, source_type, source_id, source_port_kind, source_port_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# Facts ingestion (Ansible -> DB)
# ---------------------------------------------------------------------------
FACT_TABLES = {
    "physical-servers": models.PhysicalServer,
    "virtual-machines": models.VirtualMachine,
    "network-devices": models.NetworkDevice,
    "workstations": models.Workstation,
    "containers-apps": models.ContainerApp,
}


@router.post("/devices/{device_type}/{device_id}/facts")
async def ingest_facts(
    device_type: str,
    device_id: int,
    facts: dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    model = FACT_TABLES.get(device_type)
    if model is None:
        raise HTTPException(status_code=404, detail="Unknown device type")
    obj = await crud.update_item(
        session, model, device_id, facts, source="ansible_callback"
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return crud.to_dict(obj)
