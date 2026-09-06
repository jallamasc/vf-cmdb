"""Phase 5 Task 14: field_type_defs table + seed of 6 builtin storage kinds

The first table of the generic entity framework (Sub-phase C). Field types
are named (e.g. "Text", "MAC Address") but each resolves to one of a fixed
set of storage kinds (text/number/boolean/date/reference/file) so the
generic form/grid layer can render/validate any field type without new code
per type. The 6 builtin rows (one per storage kind, builtin=True) are seeded
here so `entity_field_defs` always has something to reference even before an
administrator defines any named type of their own.

Idempotent / guarded, following the style of 0005-0012.

Revision ID: 0013_field_type_defs
Revises: 0012_device_type_icons
Create Date: 2026-09-06
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0013_field_type_defs"
down_revision = "0012_device_type_icons"
branch_labels = None
depends_on = None

_BUILTIN_ROWS = [
    ("text", "Text", "text"),
    ("number", "Number", "number"),
    ("boolean", "Boolean", "boolean"),
    ("date", "Date", "date"),
    ("reference", "Reference", "reference"),
    ("file", "File", "file"),
]


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("field_type_defs"):
        op.create_table(
            "field_type_defs",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("slug", sa.String(60), nullable=False),
            sa.Column("label", sa.String(120), nullable=False),
            sa.Column(
                "storage_kind",
                sa.Enum(
                    "text", "number", "boolean", "date", "reference", "file",
                    name="field_type_def_storage_kind",
                    native_enum=False,
                    create_constraint=True,
                    length=20,
                ),
                nullable=False,
            ),
            sa.Column(
                "builtin", sa.Boolean, nullable=False, server_default=sa.false()
            ),
            sa.Column("notes", sa.Text, nullable=True),
            # `Base` (database.py) declares these on every model.
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.UniqueConstraint("slug", name="uq_field_type_defs_slug"),
        )

    conn = op.get_bind()
    existing = {
        row[0]
        for row in conn.execute(sa.text("SELECT slug FROM field_type_defs")).fetchall()
    }
    for slug, label, storage_kind in _BUILTIN_ROWS:
        if slug in existing:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO field_type_defs (slug, label, storage_kind, builtin) "
                "VALUES (:slug, :label, :storage_kind, TRUE)"
            ),
            {"slug": slug, "label": label, "storage_kind": storage_kind},
        )


def downgrade() -> None:
    if _has_table("field_type_defs"):
        op.drop_table("field_type_defs")
