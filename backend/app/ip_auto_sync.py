"""Phase 6 Task 39 — IP_Auto_Sync (Requirement 14).

Keeps a hardcoded device's own IP-bearing column(s) in sync with a matching
polymorphic IpAssignment row: set/changed -> create-or-update it, cleared ->
remove it. Built as its own module (called from crud.py's create_item/
update_item/delete_item) rather than a private crud.py helper like
``_autoreserve_gateway``/``_sync_cable_for_interface`` — the task explicitly
asks for "a `lifecycle_sync.py`-style hook", and like Lifecycle_Sync_Service
this is a genuinely separate concern (keeping IP Assignments in sync with a
device record, not validating/computing something about the device record
itself).

Requirement 14.2 — applies to every IP-bearing field on every hardcoded
device model. Each model gets one IpAssignment "role" per distinct IP
interface it exposes: most have exactly one ("management"); PhysicalServer
has two, since it separately carries an iLO/IPMI address. A role whose
model column(s) don't include an IPv6 counterpart (e.g. PhysicalServer's
iLO/IPMI, Workstation's management) simply never gets one written.

Every row this module creates has ``auto_generated=True`` (mirrors
``Cable.auto_generated``'s exact rationale — see the IpAssignment docstring
in models.py): only a row with that flag set is ever looked up, updated, or
deleted here, so a manually-created IpAssignment row that happens to share
the same (assigned_to_type, assigned_to_id, interface_name) is never
silently touched.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import models

# model -> [(interface_name, ipv4_field_or_None, ipv6_field_or_None), ...].
# The FIRST role listed for a model is its primary one (IpAssignment.is_primary).
_IP_ROLES: dict[type, list[tuple[str, Optional[str], Optional[str]]]] = {
    models.NetworkDevice: [("management", "management_ipv4", "management_ipv6")],
    models.PhysicalServer: [
        ("management", "management_ipv4", "management_ipv6"),
        ("ilo_ipmi", "ilo_ipmi_ipv4", None),
    ],
    models.VirtualMachine: [("management", "management_ipv4", "management_ipv6")],
    models.ContainerApp: [("app", "ipv4_address", "ipv6_address")],
    models.Workstation: [("management", "management_ipv4", None)],
}

# model -> the ENTITY_REGISTRY kebab-case slug, written as assigned_to_type
# (matches devices.py's related_ip_assignments write convention).
_SLUGS: dict[type, str] = {
    models.NetworkDevice: "network-devices",
    models.PhysicalServer: "physical-servers",
    models.VirtualMachine: "virtual-machines",
    models.ContainerApp: "containers-apps",
    models.Workstation: "workstations",
}


def _to_str(value: Any) -> Optional[str]:
    return None if value is None else str(value)


async def _log(session: AsyncSession, record_id: int, field: str, old: Any, new: Any) -> None:
    session.add(
        models.ChangeLog(
            table_name="ip_assignments",
            record_id=record_id,
            field_name=field,
            old_value=_to_str(old),
            new_value=_to_str(new),
            change_source="auto_sync",
        )
    )


async def _find_assignment(
    session: AsyncSession, slug: str, device_id: int, interface_name: str
) -> Optional["models.IpAssignment"]:
    result = await session.execute(
        select(models.IpAssignment).where(
            models.IpAssignment.auto_generated.is_(True),
            models.IpAssignment.assigned_to_type == slug,
            models.IpAssignment.assigned_to_id == device_id,
            models.IpAssignment.interface_name == interface_name,
        )
    )
    return result.scalars().first()


async def sync_ip_assignments(session: AsyncSession, obj) -> None:
    """Requirement 14.1 — call after a create/update of a hardcoded device
    row whose IP-bearing field(s) may have changed. Idempotent: re-running
    against unchanged fields is a no-op. Does nothing for any other model."""
    roles = _IP_ROLES.get(type(obj))
    if not roles:
        return
    slug = _SLUGS[type(obj)]
    for interface_name, ipv4_field, ipv6_field in roles:
        ipv4 = getattr(obj, ipv4_field) if ipv4_field else None
        ipv6 = getattr(obj, ipv6_field) if ipv6_field else None
        existing = await _find_assignment(session, slug, obj.id, interface_name)
        if ipv4 is None and ipv6 is None:
            # Requirement 14.1 — a cleared IP-bearing field removes the
            # matching row, but only the one we created for it.
            if existing is not None:
                await _log(session, existing.id, "__deleted__", "exists", None)
                await session.delete(existing)
            continue
        if existing is None:
            row = models.IpAssignment(
                assigned_to_type=slug,
                assigned_to_id=obj.id,
                interface_name=interface_name,
                ipv4_address=ipv4,
                ipv6_address=ipv6,
                is_primary=(interface_name == roles[0][0]),
                status="active",
                auto_generated=True,
            )
            session.add(row)
            await session.flush()  # obtain PK for the changelog rows below
            for field, value in (("ipv4_address", ipv4), ("ipv6_address", ipv6)):
                if value is not None:
                    await _log(session, row.id, field, None, value)
        else:
            for field, new_value in (("ipv4_address", ipv4), ("ipv6_address", ipv6)):
                old_value = getattr(existing, field)
                if _to_str(old_value) != _to_str(new_value):
                    await _log(session, existing.id, field, old_value, new_value)
                    setattr(existing, field, new_value)


async def remove_ip_assignments(session: AsyncSession, obj) -> None:
    """Requirement 14.1 (delete case) — call BEFORE deleting a hardcoded
    device row, removing every auto-generated IpAssignment row this module
    created for it. Mirrors ``lifecycle_sync.remove_semaphore_inventory``'s
    placement (needs the row's own id while the device still exists)."""
    roles = _IP_ROLES.get(type(obj))
    if not roles:
        return
    slug = _SLUGS[type(obj)]
    for interface_name, _ipv4_field, _ipv6_field in roles:
        existing = await _find_assignment(session, slug, obj.id, interface_name)
        if existing is not None:
            await _log(session, existing.id, "__deleted__", "exists", None)
            await session.delete(existing)
