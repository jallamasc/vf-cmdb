"""Post-Phase-6 QA (round 3): theme_name/theme_category on datacenters

Requested: "There is no short name for datacenter, floors. Everything
needs a fantastic name and a real coded name." Datacenter already has a
real coded name (`code`, hand-typed or trim-mode-derived via AbbrevField)
but had no "fantastic name" column at all — unlike DatacenterFloor/Room/
Section, which already carry `theme_name`/`theme_category` (added by an
earlier migration but never wired into the naming engine or UI until this
round). This migration only adds the two columns to `datacenters`,
mirroring the exact shape already used on `datacenter_floors`.

Idempotent / guarded, following the style of 0005-0032.

Revision ID: 0033_datacenter_theme_name
Revises: 0032_ip_assignment_flag
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0033_datacenter_theme_name"
down_revision = "0032_ip_assignment_flag"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_column("datacenters", "theme_name"):
        op.add_column("datacenters", sa.Column("theme_name", sa.String(length=120), nullable=True))
    if not _has_column("datacenters", "theme_category"):
        op.add_column("datacenters", sa.Column("theme_category", sa.String(length=40), nullable=True))


def downgrade() -> None:
    if _has_column("datacenters", "theme_category"):
        op.drop_column("datacenters", "theme_category")
    if _has_column("datacenters", "theme_name"):
        op.drop_column("datacenters", "theme_name")
