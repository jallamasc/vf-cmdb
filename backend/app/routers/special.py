"""Special endpoints: dashboard, IPAM, naming, changelog, Ansible, facts."""
from __future__ import annotations

import ipaddress
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import (
    abbrev,
    airports,
    crud,
    devices,
    models,
    naming,
    photos,
    ports,
    stencil_library,
    stencil_sources,
    stencils,
    themes,
)
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


async def _breakdown(session: AsyncSession, group_col) -> dict[str, int]:
    """Count rows grouped by a plain (non-FK) column, e.g. a zone string."""
    rows = (
        await session.execute(select(group_col, func.count()).group_by(group_col))
    ).all()
    return {(str(key) if key is not None else "(unset)"): int(count) for key, count in rows}


async def _breakdown_by_lookup(
    session: AsyncSession, group_col, lookup_model
) -> dict[str, int]:
    """Count rows grouped by a FK id column, keyed by the lookup's abbreviation.

    Two cheap queries (group-by-id, then one lookup fetch) instead of a join,
    so this stays simple and works with any ``LookupMixin`` table.
    """
    rows = (
        await session.execute(select(group_col, func.count()).group_by(group_col))
    ).all()
    ids = [key for key, _ in rows if key is not None]
    labels: dict[int, str] = {}
    if ids:
        lookup_rows = (
            await session.execute(select(lookup_model).where(lookup_model.id.in_(ids)))
        ).scalars().all()
        labels = {r.id: (r.full_name or r.abbreviation or str(r.id)) for r in lookup_rows}
    out: dict[str, int] = {}
    for key, count in rows:
        label = labels.get(key, "(unset)") if key is not None else "(unset)"
        out[label] = out.get(label, 0) + int(count)
    return out


async def _avg_subnet_utilization(session: AsyncSession) -> float:
    """Rough average IPv4 subnet utilisation across every subnet with a CIDR."""
    subnets = (
        await session.execute(
            select(models.SubnetIpv4).where(models.SubnetIpv4.network_cidr.isnot(None))
        )
    ).scalars().all()
    if not subnets:
        return 0.0
    used = await _used_ipv4(session)
    pct_values: list[float] = []
    for s in subnets:
        try:
            net = ipaddress.ip_network(str(s.network_cidr), strict=False)
        except ValueError:
            continue
        total = net.num_addresses - 2 if net.num_addresses > 2 else net.num_addresses
        if total <= 0:
            continue
        in_net = len([u for u in used if ipaddress.ip_address(u) in net])
        pct_values.append(in_net / total * 100)
    return round(sum(pct_values) / len(pct_values), 1) if pct_values else 0.0


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

    # Req 2.1: a small per-type breakdown so a Dashboard card is more than a
    # bare count. Kept intentionally cheap (a handful of grouped counts).
    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    changes_24h = await session.execute(
        select(func.count()).select_from(models.ChangeLog).where(
            models.ChangeLog.changed_at >= since_24h
        )
    )
    breakdowns: dict[str, dict[str, Any]] = {
        "network_devices": await _breakdown_by_lookup(
            session, models.NetworkDevice.device_type_id, models.NetworkDeviceType
        ),
        "physical_servers": await _breakdown_by_lookup(
            session, models.PhysicalServer.role_id, models.DeviceRole
        ),
        "vlans": await _breakdown(session, models.Vlan.zone),
        "subnets_ipv4": {
            "avg utilisation %": await _avg_subnet_utilization(session),
        },
        "sites": {
            "changes (24h)": int(changes_24h.scalar() or 0),
        },
    }
    return {"counts": counts, "recent_changes": recent_changes, "breakdowns": breakdowns}


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
    # Phase 4 Req 17: power devices get the same stencil treatment.
    "power-device-types": models.PowerDeviceType,
}

_SVG_HEADERS = {"Cache-Control": "public, max-age=86400"}


def _parse_owner_slug(model_slug: str) -> Optional[tuple[str, int]]:
    """Split ``{resource}-{id}`` into (resource, id) when resource is a known
    STENCIL_RESOURCES key. Returns None for a bare resource slug (no id) or an
    unrecognised resource."""
    for resource in STENCIL_RESOURCES:
        prefix = f"{resource}-"
        if model_slug.startswith(prefix):
            tail = model_slug[len(prefix):]
            if tail.isdigit():
                return resource, int(tail)
    return None


async def _stencil_url_for_slug(
    session: AsyncSession, model_slug: str, face: str = "front"
) -> Optional[str]:
    """The configured stencil URL for a device-type identified by slug.

    ``model_slug`` is ``{resource}-{id}`` naming a specific device-type row.
    ``face`` selects ``stencil_url`` (front) or ``stencil_url_back`` (back).
    Returns None when no URL is configured or the row is not found.
    """
    parsed = _parse_owner_slug(model_slug)
    if parsed is None:
        return None
    resource, row_id = parsed
    model = STENCIL_RESOURCES[resource]
    row = await session.get(model, row_id)
    if row is None:
        return None
    attr = "stencil_url_back" if face == "back" else "stencil_url"
    return getattr(row, attr, None)


@router.get("/stencils/{model_slug}")
async def get_stencil(
    model_slug: str,
    face: str = Query("front", pattern="^(front|back)$"),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Serve a device model's stencil SVG, cache-first.

    1. If the SVG is already cached on disk, serve it (no network — air-gap safe).
    2. Else, if the device-type row has a stencil URL for this face and Visio
       Café is reachable, download it, cache it and serve it.
    3. Else return 404.

    Phase 4 Req 14: ``face`` selects the front (default) or back stencil —
    these are cached and served as two independent SVGs per device model.
    """
    try:
        slug = stencils.validate_slug(model_slug)
    except stencils.InvalidSlug as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if stencils.is_cached(slug, face):
        data = stencils.cache_path(slug, face).read_bytes()
        return Response(content=data, media_type="image/svg+xml", headers=_SVG_HEADERS)

    url = await _stencil_url_for_slug(session, slug, face)
    if url:
        path = stencils.download_and_cache(slug, url, face)
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
    face: str = Query("front", pattern="^(front|back)$"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upload an SVG stencil for a model, overwriting any cached copy.

    Works fully offline: the uploaded SVG is stored in the cache and served by
    the GET endpoint without ever contacting Visio Café. ``face`` selects
    which of the two independent slots (front/back, Req 14) is written.
    """
    try:
        slug = stencils.validate_slug(model_slug)
    except stencils.InvalidSlug as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    data = await file.read()
    try:
        stencils.store_bytes(slug, data, file.content_type, face)
    except stencils.InvalidStencil as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "model_slug": slug,
        "face": face,
        "stored": True,
        "bytes": len(data),
        "path": f"{settings.api_prefix}/stencils/{slug}?face={face}",
    }


@router.get("/stencils/{model_slug}/anchors")
async def list_stencil_anchors(
    model_slug: str,
    face: Optional[str] = Query(None, pattern="^(front|back)$"),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """Phase 4 Req 19.3/19.4 — anchors mapped for a stencil owner.

    ``model_slug`` is ``{resource}-{id}`` (the same slug the stencil cache
    uses). Writes (create/delete) go through the generic ``stencil-anchors``
    CRUD resource — this endpoint is a read-only convenience for filtering by
    owner (+ optionally by face), which the generic list endpoint cannot do.
    """
    parsed = _parse_owner_slug(model_slug)
    if parsed is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"'{model_slug}' is not a recognised '{{resource}}-{{id}}' stencil "
                f"owner. Known resources: {', '.join(sorted(STENCIL_RESOURCES))}."
            ),
        )
    resource, owner_id = parsed
    stmt = select(models.StencilAnchor).where(
        models.StencilAnchor.owner_resource == resource,
        models.StencilAnchor.owner_id == owner_id,
    )
    if face:
        stmt = stmt.where(models.StencilAnchor.face == face)
    rows = (await session.execute(stmt.order_by(models.StencilAnchor.id))).scalars().all()
    return [crud.to_dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Phase 5 Task 22/23 — per-record photo upload (Requirements 18.1, 19.1)
# ---------------------------------------------------------------------------
_PHOTO_MEDIA_TYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}
_PHOTO_HEADERS = {"Cache-Control": "public, max-age=86400"}


def _photo_model(resource: str):
    """Resolve `resource` to an ORM model that has a `photo_url` column, or
    raise 404/400. Resource-agnostic (ENTITY_REGISTRY-driven) so this same
    function serves generic-entities today and every hardcoded device table
    Task 23 adds `photo_url` to, with no changes here."""
    model = ENTITY_REGISTRY.get(resource)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Unknown resource '{resource}'.")
    if not hasattr(model, "photo_url"):
        raise HTTPException(
            status_code=400, detail=f"'{resource}' records do not support a photo."
        )
    return model


@router.get("/photos/{slug}")
async def get_photo(slug: str) -> Response:
    """Serve a previously uploaded photo. 404 when none has been uploaded."""
    try:
        clean_slug = photos.validate_slug(slug)
    except photos.InvalidSlug as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    path = photos.existing_path(clean_slug)
    if path is None:
        raise HTTPException(status_code=404, detail="No photo uploaded for this record.")
    media_type = _PHOTO_MEDIA_TYPES.get(path.suffix.lstrip("."), "application/octet-stream")
    return Response(content=path.read_bytes(), media_type=media_type, headers=_PHOTO_HEADERS)


@router.post("/photos/{resource}/{item_id}")
async def upload_photo(
    resource: str,
    item_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upload a photo for one record and set its `photo_url` to the URL that
    serves it back. Unlike a stencil (cached separately from the DB column),
    the photo_url column IS the pointer to the uploaded file."""
    model = _photo_model(resource)
    row = await session.get(model, item_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"'{resource}' #{item_id} not found.")

    slug = f"{resource}-{item_id}"
    data = await file.read()
    try:
        photos.store_bytes(slug, data, file.content_type)
    except photos.InvalidPhoto as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    photo_url = f"{settings.api_prefix}/photos/{slug}"
    row.photo_url = photo_url
    await session.commit()
    return {"resource": resource, "id": item_id, "photo_url": photo_url}


# ---------------------------------------------------------------------------
# Phase 5 Task 26/27 — per-record blueprint upload (Requirements 21.3, 22.3)
#
# Mirrors the photo routes exactly (same photos.py storage/validation
# helpers, generalized in Task 26 to accept a `base_dir`), but checks
# `blueprint_url` instead of `photo_url` and stores under a separate
# directory (photos.BLUEPRINT_DIR) — floor plans are a distinct asset class
# from a device photo, not a variant of it.
# ---------------------------------------------------------------------------
def _blueprint_model(resource: str):
    model = ENTITY_REGISTRY.get(resource)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Unknown resource '{resource}'.")
    if not hasattr(model, "blueprint_url"):
        raise HTTPException(
            status_code=400, detail=f"'{resource}' records do not support a blueprint."
        )
    return model


@router.get("/blueprints/{slug}")
async def get_blueprint(slug: str) -> Response:
    """Serve a previously uploaded blueprint. 404 when none has been uploaded."""
    try:
        clean_slug = photos.validate_slug(slug)
    except photos.InvalidSlug as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    path = photos.existing_path(clean_slug, base_dir=photos.BLUEPRINT_DIR)
    if path is None:
        raise HTTPException(status_code=404, detail="No blueprint uploaded for this record.")
    media_type = _PHOTO_MEDIA_TYPES.get(path.suffix.lstrip("."), "application/octet-stream")
    return Response(content=path.read_bytes(), media_type=media_type, headers=_PHOTO_HEADERS)


@router.post("/blueprints/{resource}/{item_id}")
async def upload_blueprint(
    resource: str,
    item_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Upload a blueprint for one record and set its `blueprint_url` to the
    URL that serves it back."""
    model = _blueprint_model(resource)
    row = await session.get(model, item_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"'{resource}' #{item_id} not found.")

    slug = f"{resource}-{item_id}"
    data = await file.read()
    try:
        photos.store_bytes(slug, data, file.content_type, base_dir=photos.BLUEPRINT_DIR)
    except photos.InvalidPhoto as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    blueprint_url = f"{settings.api_prefix}/blueprints/{slug}"
    row.blueprint_url = blueprint_url
    await session.commit()
    return {"resource": resource, "id": item_id, "blueprint_url": blueprint_url}


# ---------------------------------------------------------------------------
# Phase 4 Sub-phase E — Stencil Library Import (Requirement 22)
# ---------------------------------------------------------------------------
_STENCIL_FETCH_TIMEOUT = 30.0


@router.get("/stencil-library/categories")
async def stencil_library_categories(
    source: str = Query(..., pattern="^(github|visiocafe)$"),
) -> list[dict[str, str]]:
    """Requirement 22.1 — categories available from a stencil source."""
    try:
        return stencil_sources.list_categories(source)
    except stencil_sources.UnknownSource as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except stencil_sources.SourceUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/stencil-library/categories/{category}/files")
async def stencil_library_files(
    category: str,
    source: str = Query(..., pattern="^(github|visiocafe)$"),
) -> list[dict[str, Any]]:
    """Requirement 22.2 — .vss/.vssx files available in a category."""
    try:
        files = stencil_sources.list_files(source, category)
    except stencil_sources.UnknownSource as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except stencil_sources.UnknownCategory as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except stencil_sources.SourceUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return [{"name": f.name, "size": f.size} for f in files]


@router.post("/stencil-library/fetch")
async def stencil_library_fetch(
    source: str = Body(..., embed=True),
    category: str = Body(..., embed=True),
    file: str = Body(..., embed=True),
) -> dict[str, Any]:
    """Requirement 22.3/22.5 — fetch a chosen stencil file, convert every
    shape master it contains into a standalone SVG, and return a preview
    (thumbnail URL + title) for each. Nothing here touches the permanent
    per-device-type stencil cache (Task 14) — a failed fetch/convert leaves
    no trace there; the administrator applies exactly one preview afterward
    through the EXISTING upload endpoint (POST /stencils/{model_slug}).
    """
    try:
        entry = stencil_sources.resolve_file(source, category, file)
    except (stencil_sources.UnknownSource, stencil_sources.UnknownCategory, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except stencil_sources.SourceUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    download_dir = Path(tempfile.mkdtemp(prefix="stencil_fetch_"))
    shapes: list[Any] = []
    try:
        try:
            resp = httpx.get(entry.download_url, timeout=_STENCIL_FETCH_TIMEOUT, follow_redirects=True)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502, detail=f"Could not download '{entry.name}': {exc}"
            )
        raw_path = download_dir / Path(entry.name).name
        raw_path.write_bytes(resp.content)

        try:
            shapes = stencil_library.convert_stencil(raw_path)
        except stencil_library.ConversionUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc))
        except stencil_library.ConversionFailed as exc:
            raise HTTPException(status_code=422, detail=str(exc))

        token = stencil_library.new_preview_token()
        saved = stencil_library.save_previews(token, shapes)
    finally:
        shutil.rmtree(download_dir, ignore_errors=True)
        if shapes:
            shutil.rmtree(shapes[0].svg_path.parent, ignore_errors=True)

    return {
        "token": token,
        "source": source,
        "category": category,
        "file": entry.name,
        "shapes": [
            {
                "title": s["title"],
                "preview_url": f"{settings.api_prefix}/stencil-library/previews/{token}/{s['filename']}",
            }
            for s in saved
        ],
    }


@router.get("/stencil-library/previews/{token}/{filename}")
async def stencil_library_preview(token: str, filename: str) -> Response:
    """Serves one converted shape preview, ahead of it being applied as a
    real stencil. Token+filename are validated against a strict charset plus
    a resolved-path containment check (stencil_library.preview_path) — no
    path-traversal is possible."""
    try:
        path = stencil_library.preview_path(token, filename)
    except stencil_library.InvalidPreviewRef as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Preview not found")
    return Response(content=path.read_bytes(), media_type="image/svg+xml", headers=_SVG_HEADERS)


# ---------------------------------------------------------------------------
# FEAT-6 (6C): connectable destination ports for a source port
# ---------------------------------------------------------------------------
@router.get("/ports/candidates")
async def port_candidates(
    source_type: str = Query(..., description="kebab-case device slug of the source port owner"),
    source_id: int = Query(...),
    source_port_kind: str = Query("interface", pattern="^(interface|outlet|patch_panel_port)$"),
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

# Phase 4 Req 21.2 — incoming keys that get their OWN typed column in
# addition to living in the ansible_facts JSONB blob, for fast/typed access
# without having to reach into JSON on every read.
PROMOTED_FACT_KEYS = {"cpu_cores", "memory_mb", "os_distribution"}


def build_facts_payload(existing_ansible_facts: Optional[dict], facts: dict[str, Any]) -> dict[str, Any]:
    """Requirement 21.1/21.2/21.3 — split an incoming facts payload into the
    update dict `ingest_facts` hands to `crud.update_item`.

    Requirement 21.1: EVERY incoming key is merged into the `ansible_facts`
    blob (a partial payload never erases facts a previous run already
    recorded — only the keys present in THIS payload are overwritten).
    Requirement 21.2: promoted keys (PROMOTED_FACT_KEYS) ALSO get written to
    their own dedicated column, IN ADDITION TO staying in the blob.
    Requirement 21.3: `last_fact_sync_at` is always stamped to the current
    time. Pure function, no DB access, so it's directly unit-testable
    without a session.
    """
    merged_blob = dict(existing_ansible_facts or {})
    merged_blob.update(facts)
    payload: dict[str, Any] = {k: v for k, v in facts.items() if k in PROMOTED_FACT_KEYS}
    payload["ansible_facts"] = merged_blob
    payload["last_fact_sync_at"] = datetime.now(timezone.utc)
    return payload


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
    existing = await session.get(model, device_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Device not found")
    payload = build_facts_payload(existing.ansible_facts, facts)
    obj = await crud.update_item(
        session, model, device_id, payload, source="ansible_callback"
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return crud.to_dict(obj)
