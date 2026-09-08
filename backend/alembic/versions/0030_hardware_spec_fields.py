"""Phase 6 Task 33: category-appropriate Hardware_Spec fields on the 4
device-type registries

Requirement 13.1 — structured spec columns on ComputeDeviceType/
NetworkDeviceType/StorageDeviceType/PowerDeviceType, populated manually or
via the Icecat/Brave Search lookup flow (Tasks 34-37). All nullable.

Idempotent / guarded, following the style of 0005-0029.

Revision ID: 0030_hardware_spec_fields
Revises: 0029_universal_stencil_override
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0030_hardware_spec_fields"
down_revision = "0029_universal_stencil_override"
branch_labels = None
depends_on = None

# table -> [(column_name, sa_type), ...]
_SPEC_COLUMNS: dict[str, list[tuple[str, sa.types.TypeEngine]]] = {
    "compute_device_types": [
        ("rack_units", sa.Integer()),
        ("cpu_sockets", sa.Integer()),
        ("max_cpu_cores", sa.Integer()),
        ("max_memory_gb", sa.Integer()),
        ("drive_bays", sa.Integer()),
        ("max_power_watts", sa.Integer()),
    ],
    "network_device_types": [
        ("rack_units", sa.Integer()),
        ("port_count", sa.Integer()),
        ("port_speed_gbps", sa.Float()),
        ("poe_supported", sa.Boolean()),
        ("max_power_watts", sa.Integer()),
    ],
    "storage_device_types": [
        ("rack_units", sa.Integer()),
        ("capacity_tb", sa.Float()),
        ("drive_bays", sa.Integer()),
        ("interface_type", sa.String(40)),
        ("max_power_watts", sa.Integer()),
    ],
    "power_device_types": [
        ("rack_units", sa.Integer()),
        ("capacity_va", sa.Integer()),
        ("output_count", sa.Integer()),
        ("input_voltage", sa.String(20)),
    ],
}


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table, columns in _SPEC_COLUMNS.items():
        for name, sa_type in columns:
            if not _has_column(table, name):
                op.add_column(table, sa.Column(name, sa_type, nullable=True))


def downgrade() -> None:
    for table, columns in _SPEC_COLUMNS.items():
        for name, _ in reversed(columns):
            if _has_column(table, name):
                op.drop_column(table, name)
