"""Phase 4 Req 21: Ansible-depth device facts

Additive columns supporting the Facts_Store, on every fact-collectable
device type (physical_servers, virtual_machines, workstations,
network_devices, containers_apps):

- ``ansible_facts`` JSONB — catch-all for whatever a fact-gathering run
  reports, beyond the promoted columns below.
- ``cpu_cores`` INTEGER, ``memory_mb`` INTEGER, ``os_distribution`` VARCHAR(80)
  — common facts promoted to dedicated, typed columns for fast access.
- ``last_fact_sync_at`` TIMESTAMPTZ — when the most recent facts payload was
  ingested for this device.

Guarded/idempotent, following the style of 0007-0010.

Revision ID: 0011_device_facts
Revises: 0010_cable_auto_gen
Create Date: 2026-09-05

NOTE: kept short (<=32 chars) — Alembic's default ``alembic_version.version_num``
column is VARCHAR(32); a longer revision id fails the final UPDATE and, because
DDL is transactional, silently rolls back every change this migration made.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011_device_facts"
down_revision = "0010_cable_auto_gen"
branch_labels = None
depends_on = None

FACT_TABLES = (
    "physical_servers",
    "virtual_machines",
    "workstations",
    "network_devices",
    "containers_apps",
)


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def upgrade() -> None:
    for table in FACT_TABLES:
        if not _has_table(table):
            continue
        if not _has_column(table, "ansible_facts"):
            op.add_column(table, sa.Column("ansible_facts", JSONB(), nullable=True))
        if not _has_column(table, "cpu_cores"):
            op.add_column(table, sa.Column("cpu_cores", sa.Integer(), nullable=True))
        if not _has_column(table, "memory_mb"):
            op.add_column(table, sa.Column("memory_mb", sa.Integer(), nullable=True))
        if not _has_column(table, "os_distribution"):
            op.add_column(table, sa.Column("os_distribution", sa.String(80), nullable=True))
        if not _has_column(table, "last_fact_sync_at"):
            op.add_column(
                table,
                sa.Column("last_fact_sync_at", sa.DateTime(timezone=True), nullable=True),
            )


def downgrade() -> None:
    for table in FACT_TABLES:
        if not _has_table(table):
            continue
        for column in ("last_fact_sync_at", "os_distribution", "memory_mb", "cpu_cores", "ansible_facts"):
            if _has_column(table, column):
                op.drop_column(table, column)
