"""Phase 5 Task 23: photo_url on the hardcoded device types

Requirement 19.1 — PhysicalServer, NetworkDevice, Workstation, PowerDevice,
and PatchPanel records support an uploaded photo. Reuses the exact same
resource-agnostic upload/serve infrastructure Task 22 built for
generic-entities (backend/app/photos.py, POST/GET /photos/... in
routers/special.py) — no backend endpoint changes, only the column.

Idempotent / guarded, following the style of 0005-0016.

Revision ID: 0017_device_photos
Revises: 0016_generic_entities
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0017_device_photos"
down_revision = "0016_generic_entities"
branch_labels = None
depends_on = None

_TABLES = [
    "physical_servers",
    "network_devices",
    "workstations",
    "power_devices",
    "patch_panels",
]


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table in _TABLES:
        if not _has_column(table, "photo_url"):
            op.add_column(table, sa.Column("photo_url", sa.String(500), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        if _has_column(table, "photo_url"):
            op.drop_column(table, "photo_url")
