"""Phase 6 Task 26: per-record stencil override on every hardcoded device/
entity instance table

Requirement 10.1 — an optional stencil override (front + back), distinct
from every device-TYPE lookup's own stencil_url (compute/network/storage/
power_device_types), added to every hardcoded device/entity table that can
be stored in the CMDB: network_devices, physical_servers, virtual_machines,
containers_apps, workstations, power_devices, patch_panels, racks.

Idempotent / guarded, following the style of 0005-0028.

Revision ID: 0029_universal_stencil_override
Revises: 0028_region_geo
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0029_universal_stencil_override"
down_revision = "0028_region_geo"
branch_labels = None
depends_on = None

_TABLES = [
    "network_devices",
    "physical_servers",
    "virtual_machines",
    "containers_apps",
    "workstations",
    "power_devices",
    "patch_panels",
    "racks",
]


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table in _TABLES:
        if not _has_column(table, "stencil_url"):
            op.add_column(table, sa.Column("stencil_url", sa.String(500), nullable=True))
        if not _has_column(table, "stencil_url_back"):
            op.add_column(table, sa.Column("stencil_url_back", sa.String(500), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        if _has_column(table, "stencil_url_back"):
            op.drop_column(table, "stencil_url_back")
        if _has_column(table, "stencil_url"):
            op.drop_column(table, "stencil_url")
