"""Phase 5 Task 34: admin_username/bw_secret_id on generic_entities

Requirement 28 — a Generic_Entity whose Entity_Type_Def carries the
ansible_managed Capability gets a default admin credential auto-provisioned
on creation (crud._provision_credential): a password is generated and
stored via the Bitwarden Secrets_Client, and only the username plus the
Secrets_Client's own reference (bw_secret_id) are written here. The
plaintext password never touches this database.

Idempotent / guarded, following the style of 0005-0022.

Revision ID: 0023_generic_entity_cred
Revises: 0022_generic_entity_ips
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0023_generic_entity_cred"
down_revision = "0022_generic_entity_ips"
branch_labels = None
depends_on = None

_TABLE = "generic_entities"


def _has_column(column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(_TABLE)}


def upgrade() -> None:
    if not _has_column("admin_username"):
        op.add_column(_TABLE, sa.Column("admin_username", sa.String(length=100), nullable=True))
    if not _has_column("bw_secret_id"):
        op.add_column(_TABLE, sa.Column("bw_secret_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    if _has_column("bw_secret_id"):
        op.drop_column(_TABLE, "bw_secret_id")
    if _has_column("admin_username"):
        op.drop_column(_TABLE, "admin_username")
