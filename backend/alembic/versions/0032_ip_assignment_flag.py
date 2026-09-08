"""Phase 6 Task 39: auto_generated flag on ip_assignments

Requirement 14 — IP_Auto_Sync creates/updates/removes an IpAssignment row
to mirror a hardcoded device's own IP-bearing column(s). This flag mirrors
Cable.auto_generated's exact role: only a row this flag is set on is ever
auto-updated/auto-deleted by that sync, so a manually-created IpAssignment
row is never silently touched even if it happens to match the same
(assigned_to_type, assigned_to_id, interface_name) tuple.

Idempotent / guarded, following the style of 0005-0031.

Revision ID: 0032_ip_assignment_flag
Revises: 0031_generic_entity_facts
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0032_ip_assignment_flag"
down_revision = "0031_generic_entity_facts"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_column("ip_assignments", "auto_generated"):
        op.add_column(
            "ip_assignments",
            sa.Column(
                "auto_generated",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )


def downgrade() -> None:
    if _has_column("ip_assignments", "auto_generated"):
        op.drop_column("ip_assignments", "auto_generated")
