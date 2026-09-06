"""Phase 5 Task 17: entity_field_defs table

A custom field on an Entity_Type_Def. Its `field_type_id` FK names which
Field_Type_Def (and therefore storage kind) backs the field's values inside
a Generic_Entity's `attributes` JSONB (Task 18). `sort_order` drives display
order in the generic dynamic form/grid (Task 20).

Idempotent / guarded, following the style of 0005-0014.

Revision ID: 0015_entity_field_defs
Revises: 0014_entity_type_defs
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0015_entity_field_defs"
down_revision = "0014_entity_type_defs"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("entity_field_defs"):
        op.create_table(
            "entity_field_defs",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column(
                "entity_type_id",
                sa.Integer,
                sa.ForeignKey("entity_type_defs.id"),
                nullable=False,
            ),
            sa.Column("key", sa.String(60), nullable=False),
            sa.Column("label", sa.String(120), nullable=False),
            sa.Column(
                "field_type_id",
                sa.Integer,
                sa.ForeignKey("field_type_defs.id"),
                nullable=False,
            ),
            sa.Column(
                "required", sa.Boolean, nullable=False, server_default=sa.false()
            ),
            sa.Column(
                "sort_order", sa.Integer, nullable=False, server_default="0"
            ),
            sa.Column("reference_target_type", sa.String(60), nullable=True),
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
            sa.UniqueConstraint(
                "entity_type_id", "key", name="uq_entity_field_defs_entity_type_key"
            ),
        )


def downgrade() -> None:
    if _has_table("entity_field_defs"):
        op.drop_table("entity_field_defs")
