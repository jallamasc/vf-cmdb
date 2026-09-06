"""Phase 5 Task 28: naming_mode on the 5 tables with a naming-engine generator

Requirement 23 — every naming-engine-computed field exposes a naming_mode
of auto/manual (default auto); while manual, naming.py's generator skips
that field on save. Scoped to sites/datacenters/racks/patch_panels/
power_devices — the only 5 tables whose naming.py generator currently sets
a field (datacenter_floors/rooms/sections have no generator at all, so the
column would be inert there; see naming.py's _is_auto()).

Idempotent / guarded, following the style of 0005-0020.

Revision ID: 0021_naming_mode
Revises: 0020_sections
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0021_naming_mode"
down_revision = "0020_sections"
branch_labels = None
depends_on = None

_TABLES = ["sites", "datacenters", "racks", "patch_panels", "power_devices"]


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def _has_check(table: str, name: str) -> bool:
    return name in {c["name"] for c in inspect(op.get_bind()).get_check_constraints(table)}


def upgrade() -> None:
    for table in _TABLES:
        if not _has_column(table, "naming_mode"):
            op.add_column(
                table,
                sa.Column(
                    "naming_mode", sa.String(length=10),
                    nullable=False, server_default="auto",
                ),
            )
        check_name = f"ck_{table}_naming_mode"
        if not _has_check(table, check_name):
            op.create_check_constraint(
                check_name, table, "naming_mode IN ('auto', 'manual')"
            )


def downgrade() -> None:
    for table in _TABLES:
        check_name = f"ck_{table}_naming_mode"
        if _has_check(table, check_name):
            op.drop_constraint(check_name, table, type_="check")
        if _has_column(table, "naming_mode"):
            op.drop_column(table, "naming_mode")
