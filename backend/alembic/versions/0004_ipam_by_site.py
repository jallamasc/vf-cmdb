"""IPAM by site: site-scoped VLANs/segments + configurable reserved-IP pools

Phase 2 — Work Stream B. Makes IPAM site-scoped and adds a configurable
reserved-IP pool per network segment:

* ``vlans.site_id`` becomes **NOT NULL** (every VLAN belongs to a site) and a
  composite ``UNIQUE (site_id, vlan_id)`` is added. The pre-existing global
  ``unique`` on ``vlans.vlan_id`` is kept (option (a) in the prep doc), which
  literally prevents a VLAN number from being reused on any other site.
* ``subnets_ipv4`` / ``subnets_ipv6`` gain ``site_id`` (NOT NULL, FK to sites),
  a ``reserved_count`` (int, default 0) and a ``reservation_anchor``
  (``from_end`` default | ``from_start``, CHECK-constrained). ``site_id`` is
  backfilled from the parent VLAN's site.
* ``subnet_role_assignments`` (the reservation store) gains ``label`` (free
  text) and ``is_locked`` (protect from auto-realloc).

NOTE: revision 0001 builds the schema with ``Base.metadata.create_all`` which
always reflects the *current* models. On a brand-new database every object
below therefore already exists by the time this migration runs, so each step
is guarded with an existence check (mirroring revisions 0002 / 0003). This
keeps the migration safe on both fresh and previously-seeded databases.

Revision ID: 0004_ipam_by_site
Revises: 0003_hierarchy_and_naming
Create Date: 2026-07-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0004_ipam_by_site"
down_revision = "0003_hierarchy_and_naming"
branch_labels = None
depends_on = None

RESERVATION_ANCHOR_VALUES = ("from_end", "from_start")
SUBNET_TABLES = ("subnets_ipv4", "subnets_ipv6")


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def _col_nullable(table: str, column: str) -> bool:
    for c in _inspector().get_columns(table):
        if c["name"] == column:
            return bool(c["nullable"])
    return True


def _has_fk(table: str, name: str) -> bool:
    return name in {fk["name"] for fk in _inspector().get_foreign_keys(table)}


def _has_check(table: str, name: str) -> bool:
    return name in {c["name"] for c in _inspector().get_check_constraints(table)}


def _has_unique(table: str, name: str) -> bool:
    return name in {uc["name"] for uc in _inspector().get_unique_constraints(table)}


def _anchor_check_sql() -> str:
    joined = ", ".join(f"'{v}'" for v in RESERVATION_ANCHOR_VALUES)
    return f"reservation_anchor IN ({joined})"


def _fallback_site_id(bind) -> int | None:
    """Lowest site id, used to backfill orphaned VLANs/segments."""
    return bind.execute(sa.text("SELECT MIN(id) FROM sites")).scalar()


def upgrade() -> None:
    bind = op.get_bind()
    fallback_site = _fallback_site_id(bind)

    # 1. VLANs — site scoping ------------------------------------------------
    # Backfill any NULL site_id so the NOT NULL alter can succeed.
    if fallback_site is not None:
        bind.execute(
            sa.text(
                "UPDATE vlans SET site_id = :sid WHERE site_id IS NULL"
            ),
            {"sid": fallback_site},
        )
    # Only enforce NOT NULL if no orphan rows remain (safe on empty DBs too).
    if _col_nullable("vlans", "site_id"):
        remaining = bind.execute(
            sa.text("SELECT COUNT(*) FROM vlans WHERE site_id IS NULL")
        ).scalar()
        if not remaining:
            op.alter_column("vlans", "site_id", nullable=False)
    if not _has_unique("vlans", "uq_vlan_site_vlanid"):
        op.create_unique_constraint(
            "uq_vlan_site_vlanid", "vlans", ["site_id", "vlan_id"]
        )

    # 2. Subnets (IPv4 + IPv6) — site scoping + reserved pool ----------------
    for table in SUBNET_TABLES:
        # site_id column + FK
        if not _has_column(table, "site_id"):
            op.add_column(table, sa.Column("site_id", sa.Integer(), nullable=True))
        fk_name = f"fk_{table}_site_id"
        if not _has_fk(table, fk_name):
            op.create_foreign_key(
                fk_name, table, "sites", ["site_id"], ["id"]
            )
        # Backfill site_id from the parent VLAN's site, then fallback site.
        bind.execute(
            sa.text(
                f"UPDATE {table} AS s SET site_id = v.site_id "
                "FROM vlans AS v "
                "WHERE s.vlan_id = v.id AND s.site_id IS NULL"
            )
        )
        if fallback_site is not None:
            bind.execute(
                sa.text(
                    f"UPDATE {table} SET site_id = :sid WHERE site_id IS NULL"
                ),
                {"sid": fallback_site},
            )
        if _col_nullable(table, "site_id"):
            remaining = bind.execute(
                sa.text(f"SELECT COUNT(*) FROM {table} WHERE site_id IS NULL")
            ).scalar()
            if not remaining:
                op.alter_column(table, "site_id", nullable=False)

        # reserved_count
        if not _has_column(table, "reserved_count"):
            op.add_column(
                table,
                sa.Column(
                    "reserved_count", sa.Integer(),
                    nullable=False, server_default="0",
                ),
            )
        # reservation_anchor + CHECK
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

    # 3. Reservation store extra columns -------------------------------------
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


def downgrade() -> None:
    # 3. Reservation store extra columns
    for col in ("is_locked", "label"):
        if _has_column("subnet_role_assignments", col):
            op.drop_column("subnet_role_assignments", col)

    # 2. Subnets
    for table in SUBNET_TABLES:
        anchor_check = f"ck_{table}_reservation_anchor"
        if _has_check(table, anchor_check):
            op.drop_constraint(anchor_check, table, type_="check")
        for col in ("reservation_anchor", "reserved_count"):
            if _has_column(table, col):
                op.drop_column(table, col)
        fk_name = f"fk_{table}_site_id"
        if _has_fk(table, fk_name):
            op.drop_constraint(fk_name, table, type_="foreignkey")
        if _has_column(table, "site_id"):
            op.drop_column(table, "site_id")

    # 1. VLANs
    if _has_unique("vlans", "uq_vlan_site_vlanid"):
        op.drop_constraint("uq_vlan_site_vlanid", "vlans", type_="unique")
    if not _col_nullable("vlans", "site_id"):
        op.alter_column("vlans", "site_id", nullable=True)
