"""Phase 4 Req 8: prune the Regions list to Colombia + well-known Americas

Data-only migration — no schema change. ``seed.py`` now only seeds Colombia's
six natural regions plus a small set of well-known Americas regions (Req
8.1). This migration removes any PRE-EXISTING region row outside that
approved list, but ONLY when no ``Site`` still references it (Req 8.2/8.3) —
a referenced row is left in place rather than risk breaking a site's FK.

Idempotent: re-running finds nothing left to delete once the approved set is
reached, matching the guarded style of 0005/0006.

Revision ID: 0007_region_cleanup
Revises: 0006_ports_and_stencils
Create Date: 2026-09-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0007_region_cleanup"
down_revision = "0006_ports_and_stencils"
branch_labels = None
depends_on = None

# Must exactly mirror the abbreviations in seed.py's Region list (Req 8.1).
APPROVED_ABBREVIATIONS = (
    "CO-CTR", "CO-CAR", "CO-PAC", "CO-AND", "CO-ORI", "CO-AMZ",
    "NAEAST", "NAWEST", "CAN", "MEX-CA", "CAR", "LATAM-S",
)


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("regions"):
        return
    bind = op.get_bind()
    placeholders = ", ".join(f"'{a}'" for a in APPROVED_ABBREVIATIONS)
    bind.execute(
        sa.text(
            f"""
            DELETE FROM regions r
             WHERE upper(coalesce(r.abbreviation, '')) NOT IN ({placeholders})
               AND NOT EXISTS (
                     SELECT 1 FROM sites s WHERE s.region_id = r.id
                   )
            """
        )
    )


def downgrade() -> None:
    # Data-only, one-directional cleanup — there is nothing to restore (the
    # removed rows' original values are not recoverable from the DB alone).
    pass
