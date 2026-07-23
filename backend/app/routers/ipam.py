"""Site-scoped IPAM endpoints: VLAN/subnet listing, reserved-IP pools, and
gap-aware, anchor-based host + reservation allocation.

All routes live under ``/ipam`` and take precedence over the generic
``/{resource}`` CRUD catch-all (this router is included before ``generic``).
The generic router still serves plain CRUD for ``vlans`` / ``subnets-ipv4`` /
``subnets-ipv6`` / ``subnet-role-assignments``; the endpoints here add the
IPAM-specific behaviour (site filtering, reservation maths, utilisation).
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import crud, ipam, models
from ..database import get_session

router = APIRouter(tags=["ipam"], prefix="/ipam")

# Safety cap when enumerating a subnet's usable host addresses. Prevents an
# accidental /64 IPv6 (or very large IPv4 supernet) from exhausting memory. When
# a subnet exceeds this, the caller must supply range_from/range_to bounds.
_MAX_ENUM_HOSTS = 1 << 16  # 65,536


# ---------------------------------------------------------------------------
# Family + subnet resolution helpers
# ---------------------------------------------------------------------------
def _validate_family(family: str) -> str:
    if family not in ("ipv4", "ipv6"):
        raise HTTPException(status_code=422, detail="family must be 'ipv4' or 'ipv6'")
    return family


def _subnet_model(family: str):
    return models.SubnetIpv4 if family == "ipv4" else models.SubnetIpv6


async def _get_subnet(session: AsyncSession, subnet_id: int, family: str):
    subnet = await session.get(_subnet_model(family), subnet_id)
    if subnet is None or not subnet.network_cidr:
        raise HTTPException(
            status_code=404, detail="Subnet not found or has no CIDR"
        )
    return subnet


def _network_of(subnet):
    try:
        return ipam.parse_network(str(subnet.network_cidr))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subnet CIDR")


def _hosts_for(subnet, net) -> list:
    """Resolve the usable host list for *subnet*, honouring range bounds + cap.

    Guards against enumerating an enormous space: the *effective* usable window
    (after applying range_from/range_to) must not exceed ``_MAX_ENUM_HOSTS``.
    This matters for IPv6, where even a bounded seed range can span 2**64
    addresses.
    """
    range_from = ipam.parse_address(getattr(subnet, "range_from", None))
    range_to = ipam.parse_address(getattr(subnet, "range_to", None))

    # First / last usable host of the network (network + broadcast excluded).
    if net.num_addresses > 2:
        first_usable = net.network_address + 1
        last_usable = net.broadcast_address - 1
    else:  # /31, /32 (and IPv6 /127, /128) — all addresses usable
        first_usable = net.network_address
        last_usable = net.broadcast_address

    lo = range_from if range_from is not None and range_from > first_usable else first_usable
    hi = range_to if range_to is not None and range_to < last_usable else last_usable

    span = int(hi) - int(lo) + 1 if hi >= lo else 0
    if span > _MAX_ENUM_HOSTS:
        raise HTTPException(
            status_code=422,
            detail=(
                "The usable host window is too large to enumerate "
                f"({span} addresses); tighten range_from/range_to to at most "
                f"{_MAX_ENUM_HOSTS} addresses."
            ),
        )
    return ipam.host_list(net, range_from, range_to)


# ---------------------------------------------------------------------------
# Address-set collectors (DB-backed)
# ---------------------------------------------------------------------------
_ACTIVE_V4_SOURCES = [
    (models.IpAssignment, "ipv4_address"),
    (models.NetworkDevice, "management_ipv4"),
    (models.PhysicalServer, "management_ipv4"),
    (models.PhysicalServer, "ilo_ipmi_ipv4"),
    (models.VirtualMachine, "management_ipv4"),
    (models.ContainerApp, "ipv4_address"),
    (models.Workstation, "management_ipv4"),
]

_ACTIVE_V6_SOURCES = [
    (models.IpAssignment, "ipv6_address"),
    (models.NetworkDevice, "management_ipv6"),
    (models.PhysicalServer, "management_ipv6"),
    (models.VirtualMachine, "management_ipv6"),
    (models.ContainerApp, "ipv6_address"),
]


async def _active_used(session: AsyncSession, family: str) -> set[str]:
    """Addresses occupied by **active host assignments** (not reservations)."""
    sources = _ACTIVE_V4_SOURCES if family == "ipv4" else _ACTIVE_V6_SOURCES
    used: set[str] = set()
    for model, field in sources:
        col = getattr(model, field)
        result = await session.execute(select(col).where(col.isnot(None)))
        for value in result.scalars().all():
            if value:
                used.add(str(value).split("/")[0])
    return used


async def _reservation_rows(
    session: AsyncSession, subnet, family: str
) -> list[models.SubnetRoleAssignment]:
    """All reserved role-assignments belonging to *subnet*."""
    ra = models.SubnetRoleAssignment
    fk = ra.subnet_ipv4_id if family == "ipv4" else ra.subnet_ipv6_id
    result = await session.execute(
        select(ra).where(fk == subnet.id).order_by(ra.slot_number, ra.id)
    )
    return list(result.scalars().all())


def _reservation_addr(row: models.SubnetRoleAssignment, family: str) -> Optional[str]:
    value = row.ipv4_address if family == "ipv4" else row.ipv6_address
    return str(value).split("/")[0] if value else None


# ---------------------------------------------------------------------------
# Site-scoped listings
# ---------------------------------------------------------------------------
@router.get("/vlans")
async def list_vlans(
    site_id: Optional[int] = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """List VLANs, optionally filtered to a single site (IPAM is site-scoped)."""
    stmt = select(models.Vlan).order_by(models.Vlan.vlan_id)
    if site_id is not None:
        stmt = stmt.where(models.Vlan.site_id == site_id)
    result = await session.execute(stmt)
    return [crud.to_dict(v) for v in result.scalars().all()]


@router.get("/subnets")
async def list_subnets(
    site_id: Optional[int] = Query(None),
    family: str = Query("ipv4"),
    vlan_id: Optional[int] = Query(None),
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    """List subnets for a family, optionally filtered by site and/or VLAN."""
    _validate_family(family)
    model = _subnet_model(family)
    stmt = select(model).order_by(model.id)
    if site_id is not None:
        stmt = stmt.where(model.site_id == site_id)
    if vlan_id is not None:
        stmt = stmt.where(model.vlan_id == vlan_id)
    result = await session.execute(stmt)
    return [crud.to_dict(s) for s in result.scalars().all()]


# ---------------------------------------------------------------------------
# Next available host IP (gap-aware; excludes active assignments + reservations)
# ---------------------------------------------------------------------------
@router.get("/subnets/{subnet_id}/next-ip")
async def next_ip(
    subnet_id: int,
    family: str = Query("ipv4"),
    anchor: str = Query(
        ipam.ANCHOR_FROM_START,
        description="Host allocation direction: from_start (default) or from_end.",
    ),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Suggest the next free host address.

    Excludes both active host assignments **and** the segment's reserved-IP pool
    (explicit role reservations plus the anchor-computed reserved band). Walk is
    gap-aware, so freed holes are reused before advancing the frontier.
    """
    _validate_family(family)
    if anchor not in ipam.VALID_ANCHORS:
        raise HTTPException(status_code=422, detail="anchor must be from_start/from_end")
    subnet = await _get_subnet(session, subnet_id, family)
    net = _network_of(subnet)
    hosts = _hosts_for(subnet, net)

    active = await _active_used(session, family)
    rows = await _reservation_rows(session, subnet, family)
    explicit = {a for a in (_reservation_addr(r, family) for r in rows) if a}
    pool = ipam.compute_reserved_pool(
        hosts,
        int(subnet.reserved_count or 0),
        subnet.reservation_anchor or ipam.ANCHOR_FROM_END,
        explicit,
        active,
    )
    reserved = {str(h) for h in pool["reserved"]}
    occupied = active | reserved

    result = ipam.allocate(hosts, occupied, anchor)
    if result["recommended"] is None:
        raise HTTPException(status_code=409, detail="No free IP available in subnet")

    in_net_used = sum(1 for u in active if _in_net(u, net))
    return {
        "subnet_id": subnet_id,
        "family": family,
        "network": str(net),
        "anchor": anchor,
        "next_ip": str(result["recommended"]),
        "next_gap": str(result["next_gap"]) if result["next_gap"] else None,
        "next_sequential": (
            str(result["next_sequential"]) if result["next_sequential"] else None
        ),
        "gaps": [str(g) for g in result["gaps"]],
        "reserved_count_effective": len(reserved),
        "used_count": in_net_used,
        "free_count": result["free_count"],
    }


def _in_net(addr: str, net) -> bool:
    try:
        return ipam.parse_address(addr) in net
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Utilisation (reserved-aware)
# ---------------------------------------------------------------------------
@router.get("/subnets/{subnet_id}/utilization")
async def subnet_utilization(
    subnet_id: int,
    family: str = Query("ipv4"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Utilisation for a segment, accounting for reserved pools separately."""
    _validate_family(family)
    subnet = await _get_subnet(session, subnet_id, family)
    net = _network_of(subnet)
    hosts = _hosts_for(subnet, net)
    total = len(hosts)

    active = await _active_used(session, family)
    used_in_net = [u for u in active if _in_net(u, net)]

    rows = await _reservation_rows(session, subnet, family)
    explicit = {a for a in (_reservation_addr(r, family) for r in rows) if a}
    pool = ipam.compute_reserved_pool(
        hosts,
        int(subnet.reserved_count or 0),
        subnet.reservation_anchor or ipam.ANCHOR_FROM_END,
        explicit,
        active,
    )
    reserved = {str(h) for h in pool["reserved"]}
    # A reserved address that is also actively used is counted as used, not twice.
    reserved_only = reserved - set(used_in_net)

    used = len(used_in_net)
    reserved_n = len(reserved_only)
    available = max(0, total - used - reserved_n)
    consumed = used + reserved_n
    return {
        "subnet_id": subnet_id,
        "family": family,
        "network": str(net),
        "total_usable": total,
        "used": used,
        "reserved": reserved_n,
        "available": available,
        "utilization_pct": round(consumed / total * 100, 1) if total else 0,
        "used_pct": round(used / total * 100, 1) if total else 0,
        "reserved_pct": round(reserved_n / total * 100, 1) if total else 0,
    }


# ---------------------------------------------------------------------------
# Reserved-IP pool: listing + next reserved slot
# ---------------------------------------------------------------------------
@router.get("/subnets/{subnet_id}/reservations")
async def list_reservations(
    subnet_id: int,
    family: str = Query("ipv4"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """List current reservations plus the computed reserved pool + next slot."""
    _validate_family(family)
    subnet = await _get_subnet(session, subnet_id, family)
    net = _network_of(subnet)
    hosts = _hosts_for(subnet, net)

    active = await _active_used(session, family)
    rows = await _reservation_rows(session, subnet, family)
    explicit = {a for a in (_reservation_addr(r, family) for r in rows) if a}

    pool = ipam.compute_reserved_pool(
        hosts,
        int(subnet.reserved_count or 0),
        subnet.reservation_anchor or ipam.ANCHOR_FROM_END,
        explicit,
        active,
    )
    nxt = ipam.next_reserved_ip(
        hosts, subnet.reservation_anchor or ipam.ANCHOR_FROM_END, explicit, active
    )
    return {
        "subnet_id": subnet_id,
        "family": family,
        "network": str(net),
        "reserved_count": int(subnet.reserved_count or 0),
        "reservation_anchor": subnet.reservation_anchor or ipam.ANCHOR_FROM_END,
        "reservations": [crud.to_dict(r) for r in rows],
        "reserved_pool": [str(h) for h in pool["reserved"]],
        "auto_reserved": [str(h) for h in pool["auto"]],
        "next_reserved": (
            str(nxt["recommended"]) if nxt["recommended"] else None
        ),
        "next_reserved_gap": str(nxt["next_gap"]) if nxt["next_gap"] else None,
    }


@router.get("/subnets/{subnet_id}/next-reserved")
async def next_reserved(
    subnet_id: int,
    family: str = Query("ipv4"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Compute the next reservation IP per the segment anchor, gap-aware."""
    _validate_family(family)
    subnet = await _get_subnet(session, subnet_id, family)
    net = _network_of(subnet)
    hosts = _hosts_for(subnet, net)
    anchor = subnet.reservation_anchor or ipam.ANCHOR_FROM_END

    active = await _active_used(session, family)
    rows = await _reservation_rows(session, subnet, family)
    explicit = {a for a in (_reservation_addr(r, family) for r in rows) if a}

    result = ipam.next_reserved_ip(hosts, anchor, explicit, active)
    if result["recommended"] is None:
        raise HTTPException(
            status_code=409, detail="No free address available for reservation"
        )
    gap_labels = ", ".join(str(g) for g in result["gaps"])
    if result["gaps"]:
        message = (
            f"Gap(s) available: {gap_labels} -- reuse a gap, or take next "
            f"{result['next_sequential']}?"
        )
    else:
        message = f"No gaps. Next reserved address is {result['recommended']}."
    return {
        "subnet_id": subnet_id,
        "family": family,
        "network": str(net),
        "anchor": anchor,
        "next_reserved": str(result["recommended"]),
        "next_gap": str(result["next_gap"]) if result["next_gap"] else None,
        "next_sequential": (
            str(result["next_sequential"]) if result["next_sequential"] else None
        ),
        "gaps": [str(g) for g in result["gaps"]],
        "message": message,
    }


# ---------------------------------------------------------------------------
# Reserved-IP pool: create / delete
# ---------------------------------------------------------------------------
def _assert_in_range(addr_str: str, subnet, net, hosts) -> None:
    """Validate a reserved address falls inside the subnet's usable range."""
    try:
        addr = ipam.parse_address(addr_str)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid IP address '{addr_str}'")
    if addr is None:
        raise HTTPException(status_code=422, detail="A valid IP address is required")
    if addr not in net:
        raise HTTPException(
            status_code=422,
            detail=f"{addr} is not within subnet {net}",
        )
    host_set = {str(h) for h in hosts}
    if str(addr) not in host_set:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{addr} is outside the usable host range "
                "(network/broadcast or beyond range_from/range_to)"
            ),
        )


@router.post("/subnets/{subnet_id}/reservations", status_code=201)
async def create_reservation(
    subnet_id: int,
    payload: dict[str, Any],
    family: str = Query("ipv4"),
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Reserve an IP for a role/label.

    The address may be supplied explicitly (``ipv4_address``/``ipv6_address``)
    or omitted to auto-allocate the next reserved slot per the segment anchor
    (gap-aware). The resolved address is validated to lie within the subnet's
    usable range and to not already be reserved or actively in use.
    """
    _validate_family(family)
    subnet = await _get_subnet(session, subnet_id, family)
    net = _network_of(subnet)
    hosts = _hosts_for(subnet, net)
    anchor = subnet.reservation_anchor or ipam.ANCHOR_FROM_END

    active = await _active_used(session, family)
    rows = await _reservation_rows(session, subnet, family)
    explicit = {a for a in (_reservation_addr(r, family) for r in rows) if a}

    addr_key = "ipv4_address" if family == "ipv4" else "ipv6_address"
    supplied = payload.get(addr_key)

    if supplied:
        addr_str = str(supplied).split("/")[0].strip()
        _assert_in_range(addr_str, subnet, net, hosts)
    else:
        nxt = ipam.next_reserved_ip(hosts, anchor, explicit, active)
        if nxt["recommended"] is None:
            raise HTTPException(
                status_code=409, detail="No free address available for reservation"
            )
        addr_str = str(nxt["recommended"])

    if addr_str in explicit:
        raise HTTPException(status_code=409, detail=f"{addr_str} is already reserved")
    if addr_str in active:
        raise HTTPException(
            status_code=409, detail=f"{addr_str} is already in active use"
        )

    role = payload.get("role")
    if not role:
        raise HTTPException(status_code=422, detail="role is required")

    body: dict[str, Any] = {
        "role": role,
        "label": payload.get("label"),
        "slot_number": payload.get("slot_number"),
        "is_locked": bool(payload.get("is_locked", False)),
        "notes": payload.get("notes"),
        "assigned_device_id": payload.get("assigned_device_id"),
        "assigned_device_table": payload.get("assigned_device_table"),
        addr_key: addr_str,
        ("subnet_ipv4_id" if family == "ipv4" else "subnet_ipv6_id"): subnet.id,
    }
    obj = await crud.create_item(session, models.SubnetRoleAssignment, body)
    return crud.to_dict(obj)


@router.delete("/subnets/{subnet_id}/reservations/{res_id}")
async def delete_reservation(
    subnet_id: int,
    res_id: int,
    family: str = Query("ipv4"),
    force: bool = Query(False, description="Delete even if the reservation is locked."),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Free a reservation (creates a reusable gap). Locked rows need ``force``."""
    _validate_family(family)
    row = await session.get(models.SubnetRoleAssignment, res_id)
    fk = row.subnet_ipv4_id if (row and family == "ipv4") else (
        row.subnet_ipv6_id if row else None
    )
    if row is None or fk != subnet_id:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if row.is_locked and not force:
        raise HTTPException(
            status_code=409,
            detail="Reservation is locked; pass force=true to delete it.",
        )
    await crud.delete_item(session, models.SubnetRoleAssignment, res_id)
    return Response(status_code=204)
