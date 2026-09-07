"""Phase 5 Task 38 — Lifecycle_Sync_Service (Requirement 30).

Keeps a Generic_Entity's Semaphore Inventory in sync with its own record:
created/updated on every create/update, removed on delete — gated on the
ansible_managed Capability, exactly like Task 34's credential hook.

Semaphore's own data model has no per-host resource (an Inventory is one
whole inventory *file*, e.g. an ansible ``[all]`` block), so "the
Automation_Client inventory host" this app upserts is realized as one
dedicated Semaphore Inventory per record, whose content is a single-host
static inventory referencing the record's management IP and its Bitwarden
Secrets_Client reference as an Ansible host variable (never the plaintext
credential itself — that stays in Bitwarden, fetched at run time by
whatever executes the playbook).
"""
from __future__ import annotations

from . import models, semaphore_client
from .config import settings


def _semaphore_project_id() -> int | None:
    return settings.semaphore_project_id or None


def _inventory_name(obj: "models.GenericEntity") -> str:
    return f"vf-cmdb generic-entities #{obj.id}"


def _inventory_content(obj: "models.GenericEntity", management_ip: str | None) -> str:
    """A single-host static Ansible inventory. Host vars reference the
    management IP and the Bitwarden secret id — never the secret's value."""
    host = management_ip or "unassigned"
    hostvars = [f"ansible_user={obj.admin_username}" if obj.admin_username else None]
    if obj.bw_secret_id:
        hostvars.append(f"vf_cmdb_bw_secret_id={obj.bw_secret_id}")
    line = " ".join([host, *[v for v in hostvars if v]])
    return f"[all]\n{line}\n"


async def sync_semaphore_inventory(session, obj) -> None:
    """Phase 5 Task 38 (Req 30.1) — upsert an ansible_managed
    Generic_Entity's Semaphore Inventory on create/update. Silently does
    nothing if Semaphore isn't configured, no target project is configured,
    or the type lacks the ansible_managed Capability — this app runs fine
    without any of that set up, automation sync simply doesn't happen yet.
    """
    if not isinstance(obj, models.GenericEntity):
        return
    entity_type = await session.get(models.EntityTypeDef, obj.entity_type_id)
    caps = (entity_type.capabilities if entity_type else None) or []
    if "ansible_managed" not in caps:
        return
    project_id = _semaphore_project_id()
    if project_id is None:
        return
    try:
        client = semaphore_client.get_semaphore_client()
    except semaphore_client.SemaphoreNotConfigured:
        return

    management_ip = None
    if obj.management_ip_id:
        ip_row = await session.get(models.IpAssignment, obj.management_ip_id)
        # INET columns come back as ipaddress.IPv4Address/IPv6Address
        # objects (psycopg2), not plain strings.
        raw_ip = ip_row.ipv4_address if ip_row else None
        management_ip = str(raw_ip) if raw_ip is not None else None

    name = _inventory_name(obj)
    content = _inventory_content(obj, management_ip)
    if obj.semaphore_host_id:
        await client.update_inventory(
            project_id, int(obj.semaphore_host_id), name=name, inventory=content, type="static"
        )
    else:
        created = await client.create_inventory(project_id, name, content, type="static")
        obj.semaphore_host_id = str(created["id"])


async def remove_semaphore_inventory(obj) -> None:
    """Phase 5 Task 38 (Req 30.2) — remove an ansible_managed
    Generic_Entity's Semaphore Inventory host entry on delete. Deliberately
    does NOT touch `bw_secret_id`/Bitwarden — a stored credential is only
    ever deleted by an explicit administrator action against Bitwarden
    itself (design.md Key Decision 4), never automatically as a side effect
    of deleting the CMDB record that referenced it (Req 27.2/30.2)."""
    if not isinstance(obj, models.GenericEntity) or not obj.semaphore_host_id:
        return
    project_id = _semaphore_project_id()
    if project_id is None:
        return
    try:
        client = semaphore_client.get_semaphore_client()
    except semaphore_client.SemaphoreNotConfigured:
        return
    await client.delete_inventory(project_id, int(obj.semaphore_host_id))
