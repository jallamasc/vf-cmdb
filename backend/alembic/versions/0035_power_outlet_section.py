"""Post-Phase-6 QA (round 4): power_outlets.section_id (TIA Section ref)

Requested: "Treat wall section as section, according to TIA and use the
TIA indications to form this name." `PowerOutlet.wall_section` was a
disconnected free-text string ("Wall - East Corner") with zero relation to
the real `Section` hierarchy level, which already has a TIA-606-derived
`code` (naming.generate_section's sequential "S{n}" per room). This adds
a real FK so a wall-mounted outlet references an actual Section instead
of a hand-typed label. `wall_section` itself is left in place (not
dropped) for backward compatibility with any existing free-text data.

Idempotent / guarded, following the style of 0005-0034.

Revision ID: 0035_power_outlet_section
Revises: 0034_building_structured_code
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0035_power_outlet_section"
down_revision = "0034_building_structured_code"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_column("power_outlets", "section_id"):
        op.add_column(
            "power_outlets",
            sa.Column("section_id", sa.Integer(), sa.ForeignKey("sections.id"), nullable=True),
        )


def downgrade() -> None:
    if _has_column("power_outlets", "section_id"):
        op.drop_column("power_outlets", "section_id")
