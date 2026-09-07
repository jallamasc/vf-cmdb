"""Phase 6 Task 13: naming_mode on datacenter_floors and sections

Requirement 6.1/6.2/6.3 — Floor auto-generates a sequential `F{n}` code
scoped to its parent Datacenter, Section auto-generates a sequential `S{n}`
code scoped to its parent Room; both gated by a new `naming_mode` column,
same column/CHECK-constraint shape as sites/datacenters/racks/patch_panels/
power_devices (Phase 5 Task 28, migration 0021) — that migration's own
docstring explicitly deferred datacenter_floors/rooms/sections since none
of them had a generator yet ("the column would be inert there"). Rooms
still has no generator (no plain manual NOT NULL name field distinct from
its naming-engine output, and no requirement asked for one), so it's still
excluded here — only Floor and Section per Requirement 6.

Idempotent / guarded, following the style of 0005-0026 (incl. 0021's own
`_has_check` pattern for the CHECK constraint).

Revision ID: 0027_floor_section_naming
Revises: 0026_icon_everywhere
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0027_floor_section_naming"
down_revision = "0026_icon_everywhere"
branch_labels = None
depends_on = None

_TABLES = ["datacenter_floors", "sections"]


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
