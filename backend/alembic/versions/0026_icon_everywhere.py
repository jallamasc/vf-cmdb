"""Phase 6 Task 9: icon column on every remaining registry table

Requirement 4.1 — every registry gets an `icon` column (Lucide icon name,
same shape as the 4 device-type lookups already have from Phase 5 Task 9).
Also extends to `rack_types` and `field_type_defs` (both admin-managed
registries surfaced in Reference Data, same rationale as Task 2's
notes->description scope extension to `entity_type_defs` — which already
has its own `icon` column from Phase 5 Task 16, so it's excluded here).

Idempotent / guarded, following the style of 0005-0025.

Revision ID: 0026_icon_everywhere
Revises: 0025_notes_to_description
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0026_icon_everywhere"
down_revision = "0025_notes_to_description"
branch_labels = None
depends_on = None

_TABLES = [
    "organizations",
    "clouds",
    "regions",
    "campuses",
    "buildings",
    "floor_sections",
    "brands",
    "device_roles",
    "network_subtypes",
    "os_families",
    "os_versions",
    "app_types",
    "cluster_types",
    "network_id_types",
    "rack_types",
    "field_type_defs",
]


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table in _TABLES:
        if not _has_column(table, "icon"):
            op.add_column(table, sa.Column("icon", sa.String(length=60), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        if _has_column(table, "icon"):
            op.drop_column(table, "icon")
