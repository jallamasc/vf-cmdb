"""Phase 4 Req 10: themed simple name for network devices

Adds ``theme_name`` / ``theme_category`` to ``network_devices``, mirroring the
FEAT-3 columns already on ``sites``, ``datacenter_floors`` and ``rooms``. The
themed name (picked from the new ``networking`` catalogue in ``themes.py``)
is written into the existing ``alternative_name`` column, which the frontend
now labels "Simple Name" — no rename of that column, so no existing reference
to ``alternative_name`` breaks.

Idempotent / guarded, following the style of 0005/0006/0007.

Revision ID: 0008_network_device_theme
Revises: 0007_region_cleanup
Create Date: 2026-09-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0008_network_device_theme"
down_revision = "0007_region_cleanup"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_table("network_devices"):
        return
    if not _has_column("network_devices", "theme_name"):
        op.add_column(
            "network_devices", sa.Column("theme_name", sa.String(120), nullable=True)
        )
    if not _has_column("network_devices", "theme_category"):
        op.add_column(
            "network_devices", sa.Column("theme_category", sa.String(40), nullable=True)
        )


def downgrade() -> None:
    if not _has_table("network_devices"):
        return
    for column in ("theme_category", "theme_name"):
        if _has_column("network_devices", column):
            op.drop_column("network_devices", column)
