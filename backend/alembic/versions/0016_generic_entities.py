"""Phase 5 Task 18: generic_entities table

The actual record store for admin-defined Entity_Type_Defs. `attributes` is
a JSONB object keyed by each EntityFieldDef's `key`, GIN-indexed for
efficient containment queries. `rack_id`/`rack_unit`, `photo_url`,
`stencil_url`/`stencil_url_back` back the rack_placement/photo/
stencil_diagram capabilities via the same relational shape the hardcoded
device types already use.

Idempotent / guarded, following the style of 0005-0015.

Revision ID: 0016_generic_entities
Revises: 0015_entity_field_defs
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "0016_generic_entities"
down_revision = "0015_entity_field_defs"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("generic_entities"):
        op.create_table(
            "generic_entities",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column(
                "entity_type_id",
                sa.Integer,
                sa.ForeignKey("entity_type_defs.id"),
                nullable=False,
            ),
            sa.Column(
                "attributes", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")
            ),
            sa.Column("rack_id", sa.Integer, sa.ForeignKey("racks.id"), nullable=True),
            sa.Column("rack_unit", sa.Integer, nullable=True),
            sa.Column("photo_url", sa.String(500), nullable=True),
            sa.Column("stencil_url", sa.String(500), nullable=True),
            sa.Column("stencil_url_back", sa.String(500), nullable=True),
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
        )
        op.create_index(
            "ix_generic_entities_attributes_gin",
            "generic_entities",
            ["attributes"],
            postgresql_using="gin",
        )


def downgrade() -> None:
    if _has_table("generic_entities"):
        op.drop_table("generic_entities")
