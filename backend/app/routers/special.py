"""Special endpoints: dashboard, IPAM, naming, changelog, Ansible, facts."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import abbrev, crud, models
from ..database import get_session

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
# IPAM: next available IP, utilisation, and reserved-IP pools live in the
# dedicated, site-scoped ``routers/ipam.py`` module (Phase 2).
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Naming generator
# ---------------------------------------------------------------------------
@router.get("/naming/generate")
async def naming_generate(
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
) -> dict[str, str]:
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
