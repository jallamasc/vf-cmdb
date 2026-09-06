"""Phase 5 Task 16: entity_type_defs table + capability model

An administrator-defined kind of managed asset. `capabilities` is a JSONB
array of strings drawn from the fixed, code-known CAPABILITY_VALUES set
(rack_placement/power_ports/network_ports/ip_assignment/ansible_managed/
cabling/photo/stencil_diagram/blueprint) - validated at the application
layer (backend/app/crud.py's _validate_entity_type_def), not a DB CHECK.

Idempotent / guarded, following the style of 0005-0013.

Revision ID: 0014_entity_type_defs
Revises: 0013_field_type_defs
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "0014_entity_type_defs"
down_revision = "0013_field_type_defs"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("entity_type_defs"):
        op.create_table(
            "entity_type_defs",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("slug", sa.String(60), nullable=False),
            sa.Column("label", sa.String(120), nullable=False),
            sa.Column("icon", sa.String(60), nullable=True),
            sa.Column(
                "capabilities", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")
            ),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.UniqueConstraint("slug", name="uq_entity_type_defs_slug"),
        )


def downgrade() -> None:
    if _has_table("entity_type_defs"):
        op.drop_table("entity_type_defs")
