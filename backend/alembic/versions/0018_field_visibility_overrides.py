"""Phase 5 Task 24: field_visibility_overrides table

Administrator control over whether a named field/column appears on a named
hardcoded entity's grid, without a code change (Req 20.1/20.2). The absence
of a row for an (entity_slug, field_key) pair means "visible" (the field's
normal default state) — a row only needs to exist to deviate from that.

Idempotent / guarded, following the style of 0005-0017.

Revision ID: 0018_field_visibility_overrides
Revises: 0017_device_photos
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0018_field_visibility_overrides"
down_revision = "0017_device_photos"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("field_visibility_overrides"):
        op.create_table(
            "field_visibility_overrides",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("entity_slug", sa.String(60), nullable=False),
            sa.Column("field_key", sa.String(80), nullable=False),
            sa.Column(
                "visible", sa.Boolean, nullable=False, server_default=sa.false()
            ),
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
                "entity_slug", "field_key", name="uq_field_visibility_overrides_entity_field"
            ),
        )


def downgrade() -> None:
    if _has_table("field_visibility_overrides"):
        op.drop_table("field_visibility_overrides")
