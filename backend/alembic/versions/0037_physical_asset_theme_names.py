"""Round 6 QA: theme_name/theme_category on the remaining physical assets

Requested: "Check that every field in reference sections and sites &
physical sections has a fantastic name with a totally enabled dropdown
to select fantastic names just like other places where those can be
selected. For example, in Physical Servers I can't select a name, just
manually write it."

Site, Datacenter, DatacenterFloor, Room, Section and NetworkDevice already
carry `theme_name`/`theme_category` (a fantastic name picked from the
built-in themed catalogues, see `app/themes.py` +
`ThemeNamePicker.tsx`). Every OTHER physical/compute asset either had no
nickname field at all (PatchPanel, PowerDevice, PowerOutlet) or only a
plain free-text field doing double duty as a stand-in "Fantastic Name"
with no catalogue/dropdown behind it (Rack.simple_name, PhysicalServer/
Workstation.alternative_name, VirtualMachine/ContainerApp.friendly_name).

This adds the same `theme_name`/`theme_category` pair (String(120) /
String(40), both nullable, exactly the shape used everywhere else) to:
racks, patch_panels, power_devices, power_outlets, physical_servers,
virtual_machines, containers_apps, workstations.

`Cable` is deliberately NOT included — its `label` is fully computed from
the two connected devices' own (already-themed) display names, so it has
no free-text nickname slot of its own to begin with; it isn't a
standalone physical asset with its own identity the way the others are.

Idempotent / guarded, following the style of 0005-0036.

Revision ID: 0037_physical_asset_theme_names
Revises: 0036_site_theme_legacy_repair
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0037_physical_asset_theme_names"
down_revision = "0036_site_theme_legacy_repair"
branch_labels = None
depends_on = None

TABLES = [
    "racks",
    "patch_panels",
    "power_devices",
    "power_outlets",
    "physical_servers",
    "virtual_machines",
    "containers_apps",
    "workstations",
]


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table in TABLES:
        if not _has_column(table, "theme_name"):
            op.add_column(table, sa.Column("theme_name", sa.String(length=120), nullable=True))
        if not _has_column(table, "theme_category"):
            op.add_column(table, sa.Column("theme_category", sa.String(length=40), nullable=True))


def downgrade() -> None:
    for table in reversed(TABLES):
        if _has_column(table, "theme_category"):
            op.drop_column(table, "theme_category")
        if _has_column(table, "theme_name"):
            op.drop_column(table, "theme_name")
