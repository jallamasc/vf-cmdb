"""Phase 5 Task 26: blueprint_url on Floor + Room

Requirement 21.3 — Floor and Room records support an uploaded blueprint
image. Reuses backend/app/photos.py's storage/validation (generalized this
task to accept a base_dir) via new POST/GET /blueprints/... routes in
routers/special.py — no new storage module needed.

Idempotent / guarded, following the style of 0005-0018.

Revision ID: 0019_room_blueprints
Revises: 0018_field_visibility_overrides
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0019_room_blueprints"
down_revision = "0018_field_visibility_overrides"
branch_labels = None
depends_on = None

_TABLES = ["datacenter_floors", "rooms"]


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table in _TABLES:
        if not _has_column(table, "blueprint_url"):
            op.add_column(table, sa.Column("blueprint_url", sa.String(500), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        if _has_column(table, "blueprint_url"):
            op.drop_column(table, "blueprint_url")
