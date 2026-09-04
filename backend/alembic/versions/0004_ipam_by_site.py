"""IPAM by site + configurable reservation pools

Turns IPAM into a site-scoped system with manageable reserved-IP pools:

* ``vlans.site_id`` becomes NOT NULL (every VLAN belongs to a site); a composite
  ``UNIQUE (site_id, vlan_id)`` is added for query ergonomics while the existing
  GLOBAL unique on ``vlan_id`` is KEPT (VLAN IDs remain unique across all sites
  per user decision Q1).
* ``subnets_ipv4`` / ``subnets_ipv6`` gain ``site_id``, ``reserved_count`` and
  ``reservation_anchor`` (``from_end`` default | ``from_start``).
* ``subnet_role_assignments`` gains ``label`` + ``is_locked`` so reservations can
  carry a free-text label and be protected from deletion (e.g. the gateway).
* Backfill: ``subnets_ipv4/6.site_id`` derived from the parent VLAN's site.

As with 0002/0003, revision 0001 builds the schema via ``create_all`` reflecting
the current models, so on a fresh DB these objects may already exist. Every step
is therefore guarded with an existence check to stay idempotent on both fresh and
previously-migrated databases.

Revision ID: 0004_ipam_by_site
Revises: 0003_hierarchy_and_naming
Create Date: 2026-09-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0004_ipam_by_site"
down_revision = "0003_hierarchy_and_naming"
branch_labels = None
depends_on = None

ANCHOR_VALUES = ("from_end", "from_start")


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def _has_fk(table: str, name: str) -> bool:
    return name in {fk["name"] for fk in _inspector().get_foreign_keys(table)}


def _has_check(table: str, name: str) -> bool:
    return name in {c["name"] for c in _inspector().get_check_constraints(table)}


def _has_index(table: str, name: str) -> bool:
    return name in {i["name"] for i in _inspector().get_indexes(table)}


def _has_unique(table: str, name: str) -> bool:
    return name in {
        uc["name"] for uc in _inspector().get_unique_constraints(table)
    }


def _col_nullable(table: str, column: str) -> bool:
    for c in _inspector().get_columns(table):
        if c["name"] == column:
            return bool(c.get("nullable", True))
    return True


def _anchor_check_sql(column: str = "reservation_anchor") -> str:
    joined = ", ".join(f"'{v}'" for v in ANCHOR_VALUES)
    return f"{column} IN ({joined})"


def _add_subnet_columns(table: str) -> None:
    """Add site_id + reserved_count + reservation_anchor to a subnet table."""
    if not _has_column(table, "site_id"):
        op.add_column(
            table,
            sa.Column("site_id", sa.Integer(), nullable=True),
        )
        fk_name = f"fk_{table}_site_id"
        if not _has_fk(table, fk_name):
            op.create_foreign_key(fk_name, table, "sites", ["site_id"], ["id"])
    if not _has_column(table, "reserved_count"):
        op.add_column(
            table,
            sa.Column(
                "reserved_count", sa.Integer(),
                nullable=False, server_default="0",
            ),
        )
    if not _has_column(table, "reservation_anchor"):
        op.add_column(
            table,
            sa.Column(
                "reservation_anchor", sa.String(length=10),
                nullable=False, server_default="from_end",
            ),
        )
    anchor_check = f"ck_{table}_reservation_anchor"
    if not _has_check(table, anchor_check):
        op.create_check_constraint(anchor_check, table, _anchor_check_sql())


def upgrade() -> None:
    # 1. VLANs: site scoping ------------------------------------------------
    # Backfill any NULL site_id BEFORE enforcing NOT NULL. Prefer site #1
    # (the "Home" site) if present, otherwise the lowest site id.
    if _has_table("vlans") and _has_column("vlans", "site_id"):
        bind = op.get_bind()
        default_site = bind.execute(
            sa.text("SELECT id FROM sites ORDER BY id LIMIT 1")
        ).scalar()
        if default_site is not None:
            bind.execute(
                sa.text(
                    "UPDATE vlans SET site_id = :sid WHERE site_id IS NULL"
                ),
                {"sid": default_site},
            )
            # Only enforce NOT NULL once no NULLs remain.
            remaining = bind.execute(
                sa.text("SELECT COUNT(*) FROM vlans WHERE site_id IS NULL")
            ).scalar()
            if remaining == 0 and _col_nullable("vlans", "site_id"):
                op.alter_column(
                    "vlans", "site_id",
                    existing_type=sa.Integer(), nullable=False,
                )
        # Composite UNIQUE(site_id, vlan_id) for query ergonomics. The GLOBAL
        # unique on vlan_id is intentionally preserved (created in 0001).
        if not _has_unique("vlans", "uq_vlan_site_vlanid"):
            op.create_unique_constraint(
                "uq_vlan_site_vlanid", "vlans", ["site_id", "vlan_id"]
            )

    # 2. Subnet reservation columns ----------------------------------------
    if _has_table("subnets_ipv4"):
        _add_subnet_columns("subnets_ipv4")
    if _has_table("subnets_ipv6"):
        _add_subnet_columns("subnets_ipv6")

    # 3. subnet_role_assignments: reservation metadata ---------------------
    if _has_table("subnet_role_assignments"):
        if not _has_column("subnet_role_assignments", "label"):
            op.add_column(
                "subnet_role_assignments",
                sa.Column("label", sa.String(length=80), nullable=True),
            )
        if not _has_column("subnet_role_assignments", "is_locked"):
            op.add_column(
                "subnet_role_assignments",
                sa.Column(
                    "is_locked", sa.Boolean(),
                    nullable=False, server_default=sa.text("false"),
                ),
            )

    # 4. Backfill subnet.site_id from the parent VLAN's site ---------------
    bind = op.get_bind()
    if _has_table("subnets_ipv4") and _has_column("subnets_ipv4", "site_id"):
        bind.execute(
            sa.text(
                "UPDATE subnets_ipv4 s SET site_id = v.site_id "
                "FROM vlans v WHERE s.vlan_id = v.id AND s.site_id IS NULL"
            )
        )
    if _has_table("subnets_ipv6") and _has_column("subnets_ipv6", "site_id"):
        bind.execute(
            sa.text(
                "UPDATE subnets_ipv6 s SET site_id = v.site_id "
                "FROM vlans v WHERE s.vlan_id = v.id AND s.site_id IS NULL"
            )
        )


def downgrade() -> None:
    # subnet_role_assignments
    if _has_table("subnet_role_assignments"):
        if _has_column("subnet_role_assignments", "is_locked"):
            op.drop_column("subnet_role_assignments", "is_locked")
        if _has_column("subnet_role_assignments", "label"):
            op.drop_column("subnet_role_assignments", "label")

    for table in ("subnets_ipv6", "subnets_ipv4"):
        if not _has_table(table):
            continue
        anchor_check = f"ck_{table}_reservation_anchor"
        if _has_check(table, anchor_check):
            op.drop_constraint(anchor_check, table, type_="check")
        if _has_column(table, "reservation_anchor"):
            op.drop_column(table, "reservation_anchor")
        if _has_column(table, "reserved_count"):
            op.drop_column(table, "reserved_count")
        fk_name = f"fk_{table}_site_id"
        if _has_fk(table, fk_name):
            op.drop_constraint(fk_name, table, type_="foreignkey")
        if _has_column(table, "site_id"):
            op.drop_column(table, "site_id")

    if _has_table("vlans"):
        if _has_unique("vlans", "uq_vlan_site_vlanid"):
            op.drop_constraint("uq_vlan_site_vlanid", "vlans", type_="unique")
        if not _col_nullable("vlans", "site_id"):
            op.alter_column(
                "vlans", "site_id",
                existing_type=sa.Integer(), nullable=True,
            )
