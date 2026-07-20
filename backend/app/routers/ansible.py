"""Ansible dynamic inventory endpoint (DB -> Ansible JSON)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models
from ..database import get_session

router = APIRouter(tags=["ansible"])


async def _lookup_map(session: AsyncSession, model) -> dict[int, str]:
    result = await session.execute(select(model))
    return {r.id: (r.abbreviation or "").lower() for r in result.scalars().all()}


def _ip(value) -> str | None:
    if not value:
        return None
    return str(value).split("/")[0]


def _add(groups: dict, name: str, host: str) -> None:
    groups.setdefault(name, {"hosts": []})
    if host not in groups[name]["hosts"]:
        groups[name]["hosts"].append(host)


@router.get("/ansible/inventory")
async def ansible_inventory(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    roles = await _lookup_map(session, models.DeviceRole)
    os_fams = await _lookup_map(session, models.OsFamily)
    ndtypes = await _lookup_map(session, models.NetworkDeviceType)

    sites_res = await session.execute(select(models.Site))
    sites = {s.id: (s.vf_short_name or s.simple_name or f"site{s.id}") for s in sites_res.scalars().all()}

    groups: dict[str, Any] = {}
    meta_hostvars: dict[str, Any] = {}

    # Physical servers
    res = await session.execute(select(models.PhysicalServer))
    for s in res.scalars().all():
        host = s.vf_short_name or s.alternative_name or f"ps{s.id}"
        ip = _ip(s.management_ipv4)
        hv = {
            "ansible_host": ip,
            "cmdb_type": "physical_server",
            "site": sites.get(s.site_id),
            "rack_unit": s.rack_unit,
            "role": roles.get(s.role_id),
            "os_family": os_fams.get(s.os_family_id),
            "ilo_ipmi_ipv4": _ip(s.ilo_ipmi_ipv4),
            "management_fqdn": s.management_fqdn,
            "vf_long_name": s.vf_long_name,
        }
        meta_hostvars[host] = {k: v for k, v in hv.items() if v is not None}
        _add(groups, "physical_servers", host)
        if roles.get(s.role_id):
            _add(groups, f"role_{roles[s.role_id]}", host)
        if os_fams.get(s.os_family_id):
            _add(groups, f"os_{os_fams[s.os_family_id]}", host)
        if sites.get(s.site_id):
            _add(groups, f"site_{sites[s.site_id]}".lower(), host)

    # Virtual machines
    res = await session.execute(select(models.VirtualMachine))
    for v in res.scalars().all():
        host = v.vf_short_name or v.friendly_name or f"vm{v.id}"
        hv = {
            "ansible_host": _ip(v.management_ipv4),
            "cmdb_type": "virtual_machine",
            "site": sites.get(v.site_id),
            "role": roles.get(v.role_id),
            "os_family": os_fams.get(v.os_family_id),
            "management_fqdn": v.management_fqdn,
        }
        meta_hostvars[host] = {k: v2 for k, v2 in hv.items() if v2 is not None}
        _add(groups, "virtual_machines", host)
        if roles.get(v.role_id):
            _add(groups, f"role_{roles[v.role_id]}", host)
        if os_fams.get(v.os_family_id):
            _add(groups, f"os_{os_fams[v.os_family_id]}", host)

    # Network devices
    res = await session.execute(select(models.NetworkDevice))
    for d in res.scalars().all():
        host = d.vf_friendly_name or d.alternative_name or f"nd{d.id}"
        hv = {
            "ansible_host": _ip(d.management_ipv4),
            "cmdb_type": "network_device",
            "site": sites.get(d.site_id),
            "device_type": ndtypes.get(d.device_type_id),
            "model": d.model,
            "management_fqdn": d.management_fqdn,
            "vf_long_name": d.vf_long_name,
        }
        meta_hostvars[host] = {k: v for k, v in hv.items() if v is not None}
        _add(groups, "network_devices", host)
        if ndtypes.get(d.device_type_id):
            _add(groups, f"type_{ndtypes[d.device_type_id]}", host)

    # Containers / apps
    res = await session.execute(select(models.ContainerApp))
    for c in res.scalars().all():
        host = c.vf_short_name or c.friendly_name or f"cn{c.id}"
        hv = {
            "ansible_host": _ip(c.ipv4_address),
            "cmdb_type": "container_app",
            "site": sites.get(c.site_id),
            "role": roles.get(c.role_id),
        }
        meta_hostvars[host] = {k: v for k, v in hv.items() if v is not None}
        _add(groups, "containers", host)

    # Assemble final inventory
    inventory: dict[str, Any] = {"_meta": {"hostvars": meta_hostvars}}
    all_hosts = sorted(meta_hostvars.keys())
    inventory["all"] = {"children": sorted(groups.keys())}
    for name, data in groups.items():
        inventory[name] = data
    return inventory
