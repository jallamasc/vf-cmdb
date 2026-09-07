"""Phase 5 Task 38: semaphore_host_id on generic_entities

Requirement 30.1/30.2 — the Lifecycle_Sync_Service upserts a Semaphore
Inventory for every ansible_managed Generic_Entity on create/update, and
removes it (without touching bw_secret_id/Bitwarden) on delete. Semaphore
owns the inventory content itself; this column is only vf-cmdb's reference
to which Inventory belongs to which record (design.md's Sub-phase F: "no
new vf-cmdb tables ... referenced from vf-cmdb only by IDs").

Idempotent / guarded, following the style of 0005-0023.

Revision ID: 0024_generic_entity_semaphore
Revises: 0023_generic_entity_cred
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0024_generic_entity_semaphore"
down_revision = "0023_generic_entity_cred"
branch_labels = None
depends_on = None

_TABLE = "generic_entities"
_COLUMN = "semaphore_host_id"


def _has_column() -> bool:
    return _COLUMN in {c["name"] for c in inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade() -> None:
    if not _has_column():
        op.add_column(_TABLE, sa.Column(_COLUMN, sa.String(length=64), nullable=True))


def downgrade() -> None:
    if _has_column():
        op.drop_column(_TABLE, _COLUMN)
