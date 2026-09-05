"""Phase 4 Req 14/17/19: stencil back faces, power device types, anchors

Three additive schema changes supporting the graphical connection-aware views:

- ``stencil_url_back`` on ``network_device_types``, ``compute_device_types``
  and ``storage_device_types`` (Req 14: a separate stencil for the back face).
- New ``power_device_types`` lookup table (mirrors the other three device-type
  lookups) + ``power_devices.device_type_id`` FK (Req 17: power devices can
  now carry a stencil).
- New ``stencil_anchors`` table (Req 19: precise port/U join points mapped
  onto a stencil, with a fallback to a computed layout when unmapped).

Guarded/idempotent, following the style of 0005-0008.

Revision ID: 0009_anchors_power
Revises: 0008_network_device_theme
Create Date: 2026-09-05

NOTE: kept short (<=32 chars) — Alembic's default ``alembic_version.version_num``
column is VARCHAR(32); a longer revision id fails the final UPDATE and, because
DDL is transactional, silently rolls back every change this migration made.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0009_anchors_power"
down_revision = "0008_network_device_theme"
branch_labels = None
depends_on = None

STENCIL_BACK_TABLES = (
    "network_device_types",
    "compute_device_types",
    "storage_device_types",
)

DOMAIN_NAME_REGEX = r"^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$"


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def upgrade() -> None:
    # -----------------------------------------------------------------
    # Req 14: back-face stencil on the existing 3 device-type lookups
    # -----------------------------------------------------------------
    for table in STENCIL_BACK_TABLES:
        if _has_table(table) and not _has_column(table, "stencil_url_back"):
            op.add_column(
                table, sa.Column("stencil_url_back", sa.String(500), nullable=True)
            )

    # -----------------------------------------------------------------
    # Req 17: power_device_types lookup + PowerDevice.device_type_id
    # -----------------------------------------------------------------
    if not _has_table("power_device_types"):
        op.create_table(
            "power_device_types",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("full_name", sa.String(120), nullable=False),
            sa.Column("abbreviation", sa.String(20), nullable=False),
            sa.Column("max_length", sa.Integer(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "case_enforcement", sa.String(9), nullable=False,
                server_default="mixed",
            ),
            sa.Column(
                "trim_mode", sa.String(11), nullable=False,
                server_default="manual",
            ),
            sa.Column("stencil_url", sa.String(500), nullable=True),
            sa.Column("stencil_url_back", sa.String(500), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(timezone=True),
                server_default=sa.func.now(), nullable=False,
            ),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True),
                server_default=sa.func.now(), nullable=False,
            ),
            sa.CheckConstraint(
                f"abbreviation ~ '{DOMAIN_NAME_REGEX}'",
                name="ck_power_device_types_abbreviation_charset",
            ),
        )
    if _has_table("power_devices") and not _has_column("power_devices", "device_type_id"):
        op.add_column(
            "power_devices",
            sa.Column("device_type_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "fk_power_devices_device_type_id",
            "power_devices", "power_device_types",
            ["device_type_id"], ["id"],
        )

    # -----------------------------------------------------------------
    # Req 19: stencil_anchors
    # -----------------------------------------------------------------
    if not _has_table("stencil_anchors"):
        op.create_table(
            "stencil_anchors",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_resource", sa.String(40), nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("face", sa.String(10), nullable=False, server_default="front"),
            sa.Column("port_key", sa.String(80), nullable=False),
            sa.Column("x", sa.Float(), nullable=False),
            sa.Column("y", sa.Float(), nullable=False),
            sa.Column("label", sa.String(120), nullable=True),
            sa.Column(
                "created_at", sa.DateTime(timezone=True),
                server_default=sa.func.now(), nullable=False,
            ),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True),
                server_default=sa.func.now(), nullable=False,
            ),
            sa.UniqueConstraint(
                "owner_resource", "owner_id", "face", "port_key",
                name="uq_stencil_anchor_owner_face_port",
            ),
        )


def downgrade() -> None:
    if _has_table("stencil_anchors"):
        op.drop_table("stencil_anchors")

    if _has_table("power_devices") and _has_column("power_devices", "device_type_id"):
        op.drop_constraint(
            "fk_power_devices_device_type_id", "power_devices", type_="foreignkey"
        )
        op.drop_column("power_devices", "device_type_id")

    if _has_table("power_device_types"):
        op.drop_table("power_device_types")

    for table in STENCIL_BACK_TABLES:
        if _has_table(table) and _has_column(table, "stencil_url_back"):
            op.drop_column(table, "stencil_url_back")
