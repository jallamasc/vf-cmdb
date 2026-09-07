"""Phase 6 Task 2: rename notes to description on every registry table

Requirement 2.1 — every Lookup_Mixin_Table (organizations, clouds, regions,
campuses, buildings, floor_sections, compute/network/storage/power device
types, network_subtypes, network_id_types, os_families, os_versions,
app_types, cluster_types, device_roles, brands), plus site_addresses,
field_type_defs, and entity_type_defs (also registry-like admin data,
included for the same terminology-consistency reason even though
requirements.md scoped the literal wording to Lookup_Mixin/SiteAddress/
FieldTypeDef) now call this column "description" instead of "notes".

Deliberately NOT touching every OTHER model's own, unrelated `notes` column
(PhysicalServer, NetworkDevice, Cable, PatchPanel, etc.) — those already
carry a SEPARATE `description` field alongside their own `notes` (two
distinct fields with different meaning; confirmed by reading models.py
before writing this migration), so renaming would collide/lose data.

Idempotent / guarded, following the style of 0005-0024.

Revision ID: 0025_notes_to_description
Revises: 0024_generic_entity_semaphore
Create Date: 2026-09-07
"""
from alembic import op
from sqlalchemy import inspect

revision = "0025_notes_to_description"
down_revision = "0024_generic_entity_semaphore"
branch_labels = None
depends_on = None

_TABLES = [
    "organizations",
    "clouds",
    "regions",
    "campuses",
    "buildings",
    "floor_sections",
    "compute_device_types",
    "brands",
    "device_roles",
    "network_device_types",
    "network_subtypes",
    "os_families",
    "os_versions",
    "app_types",
    "cluster_types",
    "storage_device_types",
    "power_device_types",
    "network_id_types",
    "site_addresses",
    "field_type_defs",
    "entity_type_defs",
]


def _columns(table: str) -> set[str]:
    return {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table in _TABLES:
        cols = _columns(table)
        if "notes" in cols and "description" not in cols:
            op.alter_column(table, "notes", new_column_name="description")


def downgrade() -> None:
    for table in _TABLES:
        cols = _columns(table)
        if "description" in cols and "notes" not in cols:
            op.alter_column(table, "description", new_column_name="notes")
