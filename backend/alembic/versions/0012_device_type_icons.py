"""Phase 5 Task 9: icon metadata on the 4 device-type lookup tables

Adds ``icon`` (a lucide-react icon name, free text) to
``compute_device_types``, ``network_device_types``, ``storage_device_types``
and ``power_device_types``, mirroring the existing ``stencil_url`` /
``stencil_url_back`` columns those four tables already carry. Used by the
device grids to render a per-row icon instead of plain text.

Idempotent / guarded, following the style of 0005-0011.

Revision ID: 0012_device_type_icons
Revises: 0011_device_facts
Create Date: 2026-09-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0012_device_type_icons"
down_revision = "0011_device_facts"
branch_labels = None
depends_on = None

_TABLES = (
    "compute_device_types",
    "network_device_types",
    "storage_device_types",
    "power_device_types",
)


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table in _TABLES:
        if not _has_table(table):
            continue
        if not _has_column(table, "icon"):
            op.add_column(table, sa.Column("icon", sa.String(60), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        if _has_table(table) and _has_column(table, "icon"):
            op.drop_column(table, "icon")
