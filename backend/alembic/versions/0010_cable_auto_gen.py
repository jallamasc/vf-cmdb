"""Phase 4 Req 20: Cable.auto_generated flag

Additive column supporting the Cable_Sync_Service: marks a Cable row as
having been created/maintained automatically from a DeviceInterface's
connected-* fields, so the sync hook can tell its own rows apart from
manually-created cables and never touch the latter.

Guarded/idempotent, following the style of 0007-0009.

Revision ID: 0010_cable_auto_gen
Revises: 0009_anchors_power
Create Date: 2026-09-05

NOTE: kept short (<=32 chars) — Alembic's default ``alembic_version.version_num``
column is VARCHAR(32); a longer revision id fails the final UPDATE and, because
DDL is transactional, silently rolls back every change this migration made.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0010_cable_auto_gen"
down_revision = "0009_anchors_power"
branch_labels = None
depends_on = None


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def upgrade() -> None:
    if _has_table("cables") and not _has_column("cables", "auto_generated"):
        op.add_column(
            "cables",
            sa.Column(
                "auto_generated", sa.Boolean(), nullable=False,
                server_default=sa.text("false"),
            ),
        )


def downgrade() -> None:
    if _has_table("cables") and _has_column("cables", "auto_generated"):
        op.drop_column("cables", "auto_generated")
