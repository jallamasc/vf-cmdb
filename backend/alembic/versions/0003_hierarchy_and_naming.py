"""physical hierarchy + naming-convention enhancements

Adds the Site > Datacenter > Floor > Room > Rack physical hierarchy plus the
supporting naming-convention features:

* new tables: ``datacenters``, ``datacenter_floors``, ``rooms``,
  ``rack_types`` and the global ``abbreviation_registry``;
* ``case_enforcement`` + ``trim_mode`` columns on every naming lookup table;
* domain-name charset CHECK constraints on all abbreviation/code columns;
* ``name_prefix`` + ``sequence_number`` columns on the five device tables;
* new hierarchy links + ``code`` on ``racks``.

NOTE: revision 0001 builds the schema with ``Base.metadata.create_all`` which
always reflects the *current* models. On a brand-new database every object
below therefore already exists by the time this migration runs, so each step
is guarded with an existence check (mirroring revision 0002). This keeps the
migration safe on both fresh and previously-seeded databases.

Revision ID: 0003_hierarchy_and_naming
Revises: 0002_site_addresses
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0003_hierarchy_and_naming"
down_revision = "0002_site_addresses"
branch_labels = None
depends_on = None

# Domain-name charset regex (only [A-Za-z0-9-], no leading/trailing/consecutive
# hyphen). Kept in sync with app.models.DOMAIN_NAME_REGEX.
DOMAIN_NAME_REGEX = r"^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$"

CASE_VALUES = ("uppercase", "lowercase", "mixed")
TRIM_VALUES = (
    "manual", "first_1", "first_2", "first_3", "first_4", "acronym", "consonants",
)

# All naming-convention lookup tables that gain case_enforcement + trim_mode.
LOOKUP_TABLES = [
    "organizations", "clouds", "regions", "campuses", "buildings",
    "floor_sections", "compute_device_types", "brands", "device_roles",
    "network_device_types", "network_subtypes", "os_families", "os_versions",
    "app_types", "cluster_types", "storage_device_types", "network_id_types",
]

# Device tables that gain name_prefix + sequence_number.
DEVICE_TABLES = [
    "network_devices", "physical_servers", "virtual_machines",
    "containers_apps", "workstations",
]


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def _has_fk(table: str, name: str) -> bool:
    return name in {fk["name"] for fk in _inspector().get_foreign_keys(table)}


def _has_check(table: str, name: str) -> bool:
    return name in {
        c["name"] for c in _inspector().get_check_constraints(table)
    }


def _has_index(table: str, name: str) -> bool:
    return name in {i["name"] for i in _inspector().get_indexes(table)}


def _in_list_sql(column: str, values) -> str:
    joined = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({joined})"


def _charset_sql(column: str) -> str:
    return f"{column} IS NULL OR {column} ~ '{DOMAIN_NAME_REGEX}'"


def _add_charset_check(table: str, column: str) -> None:
    name = f"ck_{table}_{column}_charset"
    if not _has_check(table, name):
        op.create_check_constraint(name, table, _charset_sql(column))


def upgrade() -> None:
    # 1. Naming enhancements on lookup tables --------------------------------
    for table in LOOKUP_TABLES:
        if not _has_column(table, "case_enforcement"):
            op.add_column(
                table,
                sa.Column(
                    "case_enforcement", sa.String(length=20),
                    nullable=False, server_default="mixed",
                ),
            )
        if not _has_column(table, "trim_mode"):
            op.add_column(
                table,
                sa.Column(
                    "trim_mode", sa.String(length=20),
                    nullable=False, server_default="manual",
                ),
            )
        ce_check = f"ck_{table}_case_enforcement"
        if not _has_check(table, ce_check):
            op.create_check_constraint(
                ce_check, table, _in_list_sql("case_enforcement", CASE_VALUES)
            )
        tm_check = f"ck_{table}_trim_mode"
        if not _has_check(table, tm_check):
            op.create_check_constraint(
                tm_check, table, _in_list_sql("trim_mode", TRIM_VALUES)
            )
        _add_charset_check(table, "abbreviation")

    # 2. New hierarchy tables ------------------------------------------------
    if not _has_table("datacenters"):
        op.create_table(
            "datacenters",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("code", sa.String(length=16), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=True),
            sa.Column(
                "case_enforcement", sa.String(length=20),
                nullable=False, server_default="mixed",
            ),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.CheckConstraint(_charset_sql("code"), name="ck_datacenters_code_charset"),
            sa.CheckConstraint(
                _in_list_sql("case_enforcement", CASE_VALUES),
                name="ck_datacenters_case_enforcement",
            ),
        )

    if not _has_table("datacenter_floors"):
        op.create_table(
            "datacenter_floors",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("code", sa.String(length=16), nullable=True),
            sa.Column("floor_number", sa.Integer(), nullable=True),
            sa.Column(
                "datacenter_id", sa.Integer(),
                sa.ForeignKey("datacenters.id"), nullable=True,
            ),
            sa.Column(
                "case_enforcement", sa.String(length=20),
                nullable=False, server_default="mixed",
            ),
            sa.Column("description", sa.Text(), nullable=True),
            sa.CheckConstraint(
                _charset_sql("code"), name="ck_datacenter_floors_code_charset"
            ),
            sa.CheckConstraint(
                _in_list_sql("case_enforcement", CASE_VALUES),
                name="ck_datacenter_floors_case_enforcement",
            ),
        )

    if not _has_table("rooms"):
        op.create_table(
            "rooms",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("code", sa.String(length=16), nullable=True),
            sa.Column(
                "datacenter_floor_id", sa.Integer(),
                sa.ForeignKey("datacenter_floors.id"), nullable=True,
            ),
            sa.Column(
                "case_enforcement", sa.String(length=20),
                nullable=False, server_default="mixed",
            ),
            sa.Column("description", sa.Text(), nullable=True),
            sa.CheckConstraint(_charset_sql("code"), name="ck_rooms_code_charset"),
            sa.CheckConstraint(
                _in_list_sql("case_enforcement", CASE_VALUES),
                name="ck_rooms_case_enforcement",
            ),
        )

    if not _has_table("rack_types"):
        op.create_table(
            "rack_types",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column("code", sa.String(length=16), nullable=True),
            sa.Column("total_units", sa.Integer(), nullable=True, server_default="42"),
            sa.Column(
                "case_enforcement", sa.String(length=20),
                nullable=False, server_default="mixed",
            ),
            sa.Column("description", sa.Text(), nullable=True),
            sa.CheckConstraint(_charset_sql("code"), name="ck_rack_types_code_charset"),
            sa.CheckConstraint(
                _in_list_sql("case_enforcement", CASE_VALUES),
                name="ck_rack_types_case_enforcement",
            ),
        )

    # 3. Hierarchy links + code on racks -------------------------------------
    if not _has_column("racks", "datacenter_floor_id"):
        op.add_column(
            "racks",
            sa.Column("datacenter_floor_id", sa.Integer(), nullable=True),
        )
    if not _has_column("racks", "room_id"):
        op.add_column("racks", sa.Column("room_id", sa.Integer(), nullable=True))
    if not _has_column("racks", "rack_type_id"):
        op.add_column("racks", sa.Column("rack_type_id", sa.Integer(), nullable=True))
    if not _has_column("racks", "code"):
        op.add_column("racks", sa.Column("code", sa.String(length=16), nullable=True))
    if not _has_fk("racks", "fk_racks_datacenter_floor_id"):
        op.create_foreign_key(
            "fk_racks_datacenter_floor_id", "racks", "datacenter_floors",
            ["datacenter_floor_id"], ["id"],
        )
    if not _has_fk("racks", "fk_racks_room_id"):
        op.create_foreign_key(
            "fk_racks_room_id", "racks", "rooms", ["room_id"], ["id"],
        )
    if not _has_fk("racks", "fk_racks_rack_type_id"):
        op.create_foreign_key(
            "fk_racks_rack_type_id", "racks", "rack_types",
            ["rack_type_id"], ["id"],
        )
    _add_charset_check("racks", "code")

    # 4. Device naming prefix + sequence number ------------------------------
    for table in DEVICE_TABLES:
        if not _has_column(table, "name_prefix"):
            op.add_column(
                table, sa.Column("name_prefix", sa.String(length=40), nullable=True)
            )
        if not _has_column(table, "sequence_number"):
            op.add_column(
                table, sa.Column("sequence_number", sa.Integer(), nullable=True)
            )

    # 5. Global abbreviation registry ----------------------------------------
    if not _has_table("abbreviation_registry"):
        op.create_table(
            "abbreviation_registry",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("abbreviation", sa.String(length=40), nullable=False),
            sa.Column("entity_type", sa.String(length=60), nullable=False),
            sa.Column("entity_id", sa.Integer(), nullable=False),
            sa.Column(
                "field_name", sa.String(length=40),
                nullable=False, server_default="abbreviation",
            ),
            sa.CheckConstraint(
                _charset_sql("abbreviation"), name="ck_abbreviation_registry_charset"
            ),
        )
    if not _has_index("abbreviation_registry", "uq_abbreviation_registry_lower"):
        op.create_index(
            "uq_abbreviation_registry_lower",
            "abbreviation_registry",
            [sa.text("lower(abbreviation)")],
            unique=True,
        )


def downgrade() -> None:
    if _has_index("abbreviation_registry", "uq_abbreviation_registry_lower"):
        op.drop_index("uq_abbreviation_registry_lower", table_name="abbreviation_registry")
    if _has_table("abbreviation_registry"):
        op.drop_table("abbreviation_registry")

    for table in DEVICE_TABLES:
        if _has_column(table, "sequence_number"):
            op.drop_column(table, "sequence_number")
        if _has_column(table, "name_prefix"):
            op.drop_column(table, "name_prefix")

    for name in (
        "fk_racks_rack_type_id", "fk_racks_room_id", "fk_racks_datacenter_floor_id",
    ):
        if _has_fk("racks", name):
            op.drop_constraint(name, "racks", type_="foreignkey")
    if _has_check("racks", "ck_racks_code_charset"):
        op.drop_constraint("ck_racks_code_charset", "racks", type_="check")
    for col in ("code", "rack_type_id", "room_id", "datacenter_floor_id"):
        if _has_column("racks", col):
            op.drop_column("racks", col)

    for table in ("rack_types", "rooms", "datacenter_floors", "datacenters"):
        if _has_table(table):
            op.drop_table(table)

    for table in LOOKUP_TABLES:
        for suffix in ("abbreviation_charset", "trim_mode", "case_enforcement"):
            name = f"ck_{table}_{suffix}"
            if _has_check(table, name):
                op.drop_constraint(name, table, type_="check")
        if _has_column(table, "trim_mode"):
            op.drop_column(table, "trim_mode")
        if _has_column(table, "case_enforcement"):
            op.drop_column(table, "case_enforcement")
