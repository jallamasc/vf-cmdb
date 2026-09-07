"""Phase 6 Task 17: latitude/longitude on regions

Requirement 7.1 — an optional real-world point per Region, so the map can
plot a marker instead of only highlighting a whole country.

Idempotent / guarded, following the style of 0005-0027.

Revision ID: 0028_region_geo
Revises: 0027_floor_section_naming
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0028_region_geo"
down_revision = "0027_floor_section_naming"
branch_labels = None
depends_on = None

_TABLE = "regions"


def _has_column(column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade() -> None:
    if not _has_column("latitude"):
        op.add_column(_TABLE, sa.Column("latitude", sa.Float(), nullable=True))
    if not _has_column("longitude"):
        op.add_column(_TABLE, sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    if _has_column("longitude"):
        op.drop_column(_TABLE, "longitude")
    if _has_column("latitude"):
        op.drop_column(_TABLE, "latitude")
