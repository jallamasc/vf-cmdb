"""Phase 5 Task 32: ip_id/management_ip_id on generic_entities

Requirement 26 — a Generic_Entity whose Entity_Type_Def carries the
ip_assignment Capability must store a usage IP and a management IP
distinguishably. Both are FKs into the existing ip_assignments table (no
change to ip_assignments itself — it already supports being pointed at by
any assigned_to_type/assigned_to_id pair; these two new columns are a
second, direct linkage specific to Generic_Entity, enforced at the CRUD
layer in crud._validate_generic_entity_ip_assignment).

Idempotent / guarded, following the style of 0005-0021.

Revision ID: 0022_generic_entity_ips
Revises: 0021_naming_mode
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0022_generic_entity_ips"
down_revision = "0021_naming_mode"
branch_labels = None
depends_on = None

_TABLE = "generic_entities"
_COLUMNS = ["ip_id", "management_ip_id"]


def _has_column(column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(_TABLE)}


def _has_fk(name: str) -> bool:
    return name in {fk["name"] for fk in inspect(op.get_bind()).get_foreign_keys(_TABLE)}


def upgrade() -> None:
    for column in _COLUMNS:
        if not _has_column(column):
            op.add_column(_TABLE, sa.Column(column, sa.Integer(), nullable=True))
        fk_name = f"fk_{_TABLE}_{column}_ip_assignments"
        if not _has_fk(fk_name):
            op.create_foreign_key(
                fk_name, _TABLE, "ip_assignments", [column], ["id"]
            )


def downgrade() -> None:
    for column in _COLUMNS:
        fk_name = f"fk_{_TABLE}_{column}_ip_assignments"
        if _has_fk(fk_name):
            op.drop_constraint(fk_name, _TABLE, type_="foreignkey")
        if _has_column(column):
            op.drop_column(_TABLE, column)
