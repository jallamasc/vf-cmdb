"""Post-Phase-6 QA (round 4): structured Building_type/number columns

Requested: "how did the app deduce that 'Main Building 1' equals to M1
abbreviation... do not guess." Building's abbreviation used to be
mechanically derived from its free-text `full_name` (consonant-stripping,
same as every other plain lookup) — meaningless for a building code, which
actually follows a real Type+Number convention (seed.py's own two seeded
rows: "Main Building 1"->"M1", "Secondary Building 1"->"S1"). This adds
two explicit, structured columns so the abbreviation can be COMPOSED from
them deterministically (crud.py's `_auto_abbreviate`) instead of guessed
from a name.

Idempotent / guarded, following the style of 0005-0033.

Revision ID: 0034_building_structured_code
Revises: 0033_datacenter_theme_name
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0034_building_structured_code"
down_revision = "0033_datacenter_theme_name"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_column("buildings", "building_type"):
        op.add_column("buildings", sa.Column("building_type", sa.String(length=40), nullable=True))
    if not _has_column("buildings", "number"):
        op.add_column("buildings", sa.Column("number", sa.Integer(), nullable=True))


def downgrade() -> None:
    if _has_column("buildings", "number"):
        op.drop_column("buildings", "number")
    if _has_column("buildings", "building_type"):
        op.drop_column("buildings", "building_type")
