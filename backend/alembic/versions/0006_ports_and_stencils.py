"""FEAT-6: rack back + cabling — stencils, polymorphic ports, cable label

Three additive schema changes supporting FEAT-6 (rack back-of-rack view +
port-to-port cabling):

6B — ``stencil_url`` (String(500), nullable) on ``network_device_types``,
``compute_device_types`` and ``storage_device_types``. A NULL/empty value means
"no stencil, draw a rectangle".

6C — polymorphic port ownership on ``device_interfaces``: ``network_device_id``
is relaxed to nullable and a ``owner_device_type`` / ``owner_device_id`` pair is
added so any device class (servers, storage, …) can own a data port. Existing
rows are backfilled so they keep network-device ownership and behaviour is
unchanged.

6C — ``cables.label`` (String(200), nullable): the single auto-generated
Cable_Label. The existing a/b column shape is preserved (no rename).

As with 0002–0005, revision 0001 builds the schema via ``create_all`` from the
current models, so on a fresh DB these objects may already exist. Every step is
guarded with an existence check to stay idempotent on both fresh and
previously-migrated databases.

Revision ID: 0006_ports_and_stencils
Revises: 0005_site_redesign
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0006_ports_and_stencils"
down_revision = "0005_site_redesign"
branch_labels = None
depends_on = None

# 6B — device-type tables that receive the stencil_url column.
STENCIL_TABLES = (
    "network_device_types",
    "compute_device_types",
    "storage_device_types",
)


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def _col_nullable(table: str, column: str) -> bool:
    for c in _inspector().get_columns(table):
        if c["name"] == column:
            return bool(c.get("nullable", True))
    return True


def upgrade() -> None:
    bind = op.get_bind()

    # -----------------------------------------------------------------
    # 6B: stencil_url on the three device-type lookup tables
    # -----------------------------------------------------------------
    for table in STENCIL_TABLES:
        if _has_table(table) and not _has_column(table, "stencil_url"):
            op.add_column(
                table, sa.Column("stencil_url", sa.String(500), nullable=True)
            )

    # -----------------------------------------------------------------
    # 6C: single auto-generated cable label (additive; a/b shape kept)
    # -----------------------------------------------------------------
    if _has_table("cables") and not _has_column("cables", "label"):
        op.add_column("cables", sa.Column("label", sa.String(200), nullable=True))

    # -----------------------------------------------------------------
    # 6C: polymorphic port ownership on device_interfaces
    # -----------------------------------------------------------------
    if _has_table("device_interfaces"):
        if not _has_column("device_interfaces", "owner_device_type"):
            op.add_column(
                "device_interfaces",
                sa.Column("owner_device_type", sa.String(40), nullable=True),
            )
        if not _has_column("device_interfaces", "owner_device_id"):
            op.add_column(
                "device_interfaces",
                sa.Column("owner_device_id", sa.Integer(), nullable=True),
            )
        # Relax the legacy NOT NULL so non-network devices can own ports.
        if not _col_nullable("device_interfaces", "network_device_id"):
            op.alter_column(
                "device_interfaces", "network_device_id", nullable=True
            )
        # Backfill: every existing port keeps network-device ownership so no
        # behaviour changes. owner_device_type uses the kebab-case ENTITY_REGISTRY
        # slug ("network-devices") that the polymorphic helpers already match on.
        bind.execute(
            sa.text(
                """
                UPDATE device_interfaces
                   SET owner_device_type = 'network-devices',
                       owner_device_id   = network_device_id
                 WHERE network_device_id IS NOT NULL
                   AND owner_device_id IS NULL
                """
            )
        )


def downgrade() -> None:
    # 6C: drop the polymorphic-owner columns. Restore network_device_id to
    # NOT NULL only if no NULLs exist (otherwise leave nullable to avoid data
    # loss on rows owned by non-network devices).
    if _has_table("device_interfaces"):
        for column in ("owner_device_id", "owner_device_type"):
            if _has_column("device_interfaces", column):
                op.drop_column("device_interfaces", column)
        if _col_nullable("device_interfaces", "network_device_id"):
            null_count = (
                op.get_bind()
                .execute(
                    sa.text(
                        "SELECT count(*) FROM device_interfaces "
                        "WHERE network_device_id IS NULL"
                    )
                )
                .scalar()
            )
            if not null_count:
                op.alter_column(
                    "device_interfaces", "network_device_id", nullable=False
                )

    # 6C: drop the cable label.
    if _has_table("cables") and _has_column("cables", "label"):
        op.drop_column("cables", "label")

    # 6B: drop stencil_url.
    for table in STENCIL_TABLES:
        if _has_table(table) and _has_column(table, "stencil_url"):
            op.drop_column(table, "stencil_url")
