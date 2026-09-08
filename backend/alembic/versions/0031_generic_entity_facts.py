"""Phase 6 Task 38: Ansible-depth facts columns on generic_entities

Requirement 13.4 — Gather_Facts_Sync ingests real Ansible facts into
ansible_managed Generic_Entity records, independent of the Icecat/Brave
hardware-spec path (Task 33-37, which targets the *type* registries, not
individual records). Mirrors the exact shape PhysicalServer/VirtualMachine/
NetworkDevice/Workstation/ContainerApp have carried since Phase 4 Task 21
(`ansible_facts` JSONB blob + 3 promoted typed columns + a sync timestamp).
All nullable — a Generic_Entity might not carry the ansible_managed
Capability at all, and even one that does may not have reported facts yet.

Idempotent / guarded, following the style of 0005-0030.

Revision ID: 0031_generic_entity_facts
Revises: 0030_hardware_spec_fields
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import inspect

revision = "0031_generic_entity_facts"
down_revision = "0030_hardware_spec_fields"
branch_labels = None
depends_on = None

_COLUMNS: list[tuple[str, sa.types.TypeEngine]] = [
    ("ansible_facts", JSONB()),
    ("cpu_cores", sa.Integer()),
    ("memory_mb", sa.Integer()),
    ("os_distribution", sa.String(80)),
    ("last_fact_sync_at", sa.DateTime(timezone=True)),
]


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for name, sa_type in _COLUMNS:
        if not _has_column("generic_entities", name):
            op.add_column("generic_entities", sa.Column(name, sa_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        if _has_column("generic_entities", name):
            op.drop_column("generic_entities", name)
