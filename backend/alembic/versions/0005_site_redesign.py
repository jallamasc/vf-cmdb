"""Sprint 3B site redesign: tri-mode site codes, themed names, airport codes

FEAT-1 — ``sites.site_code_type`` ("auto" | "custom" | "theme") records how the
site's ``simple_name`` is produced. Existing rows are backfilled so no user data
is reinterpreted: a site that already has a hand-typed ``simple_name`` becomes
``custom``, an empty one becomes ``auto``.

FEAT-3 — ``theme_name`` / ``theme_category`` are added to ``sites``,
``datacenter_floors`` and ``rooms`` so any of those levels can carry a themed
"fun" name picked from the built-in catalogues (``app/themes.py``).

FEAT-5 — ``datacenters`` gains ``city`` + ``iata_code`` (the IATA code of the
nearest major airport, see ``app/airports.py``) plus the generated
``vf_long_name``. Existing datacenters are backfilled from their parent site so
the column is never left stale/empty for already-known rows.

As with 0002/0003/0004, revision 0001 builds the schema via ``create_all``
reflecting the current models, so on a fresh DB these objects may already exist.
Every step is guarded with an existence check to stay idempotent on both fresh
and previously-migrated databases.

Revision ID: 0005_site_redesign
Revises: 0004_ipam_by_site
Create Date: 2026-09-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0005_site_redesign"
down_revision = "0004_ipam_by_site"
branch_labels = None
depends_on = None

SITE_CODE_TYPE_VALUES = ("auto", "custom", "theme")

# Same domain-name charset the models enforce on every code column.
DOMAIN_NAME_REGEX = r"^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$"

# Tables that receive the FEAT-3 themed-name pair.
THEMED_TABLES = ("sites", "datacenter_floors", "rooms")

# Mirrors naming.auto_site_code() in SQL: organization + campus + region
# abbreviations, lowercased, followed by a per-prefix sequence number.
BACKFILL_AUTO_SITE_CODES = """
WITH derived AS (
    SELECT s.id,
           lower(
               coalesce(o.abbreviation, '')
               || coalesce(c.abbreviation, '')
               || coalesce(r.abbreviation, '')
           ) AS prefix
      FROM sites s
      LEFT JOIN organizations o ON o.id = s.organization_id
      LEFT JOIN campuses      c ON c.id = s.campus_id
      LEFT JOIN regions       r ON r.id = s.region_id
     WHERE s.site_code_type = 'auto'
       AND (s.simple_name IS NULL OR btrim(s.simple_name) = '')
), candidates AS (
    SELECT d.id,
           d.prefix || (
               row_number() OVER (PARTITION BY d.prefix ORDER BY d.id)
               + coalesce((
                     SELECT max(
                                substring(
                                    lower(x.simple_name)
                                    FROM char_length(d.prefix) + 1
                                )::bigint
                            )
                       FROM sites x
                      WHERE lower(x.simple_name) ~ ('^' || d.prefix || '[0-9]+$')
                 ), 0)
           )::text AS candidate
      FROM derived d
     WHERE d.prefix <> ''
)
UPDATE sites s
   SET simple_name = c.candidate
  FROM candidates c
 WHERE s.id = c.id
   AND NOT EXISTS (
        SELECT 1 FROM sites x WHERE lower(x.simple_name) = c.candidate
   )
"""


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def _has_check(table: str, name: str) -> bool:
    return name in {c["name"] for c in _inspector().get_check_constraints(table)}


def _col_nullable(table: str, column: str) -> bool:
    for c in _inspector().get_columns(table):
        if c["name"] == column:
            return bool(c.get("nullable", True))
    return True


def upgrade() -> None:
    bind = op.get_bind()

    # -----------------------------------------------------------------
    # FEAT-3: themed fun names on sites / floors / rooms
    # -----------------------------------------------------------------
    for table in THEMED_TABLES:
        if not _has_table(table):
            continue
        if not _has_column(table, "theme_name"):
            op.add_column(table, sa.Column("theme_name", sa.String(120), nullable=True))
        if not _has_column(table, "theme_category"):
            op.add_column(
                table, sa.Column("theme_category", sa.String(40), nullable=True)
            )

    # -----------------------------------------------------------------
    # FEAT-1: tri-mode site code
    # -----------------------------------------------------------------
    if _has_table("sites"):
        if not _has_column("sites", "site_code_type"):
            # Added nullable first so the backfill below decides each row's
            # value, then tightened to NOT NULL.
            op.add_column(
                "sites",
                sa.Column(
                    "site_code_type",
                    # VARCHAR(6) + CHECK is exactly what the non-native Enum in
                    # models.py emits, so create_all and this migration agree.
                    sa.String(6),
                    nullable=True,
                    server_default="auto",
                ),
            )
        # Preserve intent of existing data: a site that already carries a
        # simple_name was named by hand -> "custom"; an empty one -> "auto".
        bind.execute(
            sa.text(
                """
                UPDATE sites
                   SET site_code_type = CASE
                        WHEN simple_name IS NOT NULL AND btrim(simple_name) <> ''
                        THEN 'custom' ELSE 'auto' END
                 WHERE site_code_type IS NULL
                """
            )
        )
        if _col_nullable("sites", "site_code_type"):
            op.alter_column("sites", "site_code_type", nullable=False)
        if not _has_check("sites", "site_code_type"):
            op.create_check_constraint(
                "site_code_type",
                "sites",
                "site_code_type IN ("
                + ", ".join(f"'{v}'" for v in SITE_CODE_TYPE_VALUES)
                + ")",
            )
        # Sites that predate FEAT-1 have no code at all. Derive it exactly the
        # way naming.auto_site_code does — organization + campus + region +
        # sequence — so the column is populated instead of being left NULL
        # until someone happens to re-save the row. The sequence continues past
        # any code already following the same pattern, and a candidate that
        # would collide with an existing name is skipped (that row simply keeps
        # its NULL and gets a fresh code the next time it is saved).
        bind.execute(sa.text(BACKFILL_AUTO_SITE_CODES))

    # -----------------------------------------------------------------
    # FEAT-5: airport code + generated long name on datacenters
    # -----------------------------------------------------------------
    if _has_table("datacenters"):
        if not _has_column("datacenters", "city"):
            op.add_column(
                "datacenters", sa.Column("city", sa.String(120), nullable=True)
            )
        if not _has_column("datacenters", "iata_code"):
            op.add_column(
                "datacenters", sa.Column("iata_code", sa.String(10), nullable=True)
            )
        if not _has_column("datacenters", "vf_long_name"):
            op.add_column(
                "datacenters", sa.Column("vf_long_name", sa.String(200), nullable=True)
            )
        if not _has_check("datacenters", "ck_datacenters_iata_code_charset"):
            op.create_check_constraint(
                "ck_datacenters_iata_code_charset",
                "datacenters",
                f"iata_code IS NULL OR iata_code ~ '{DOMAIN_NAME_REGEX}'",
            )
        # Backfill the generated name exactly the way naming.generate_datacenter
        # would for a row with no IATA code yet: parent site long name + code.
        if _has_table("sites"):
            bind.execute(
                sa.text(
                    """
                    UPDATE datacenters d
                       SET vf_long_name = upper(
                             coalesce(s.vf_long_name, '')
                             || coalesce(d.iata_code, '')
                             || coalesce(d.code, '')
                           )
                      FROM sites s
                     WHERE d.site_id = s.id
                       AND d.vf_long_name IS NULL
                       AND coalesce(s.vf_long_name, '') <> ''
                    """
                )
            )


def downgrade() -> None:
    if _has_table("datacenters"):
        if _has_check("datacenters", "ck_datacenters_iata_code_charset"):
            op.drop_constraint(
                "ck_datacenters_iata_code_charset", "datacenters", type_="check"
            )
        for column in ("vf_long_name", "iata_code", "city"):
            if _has_column("datacenters", column):
                op.drop_column("datacenters", column)

    if _has_table("sites"):
        if _has_check("sites", "site_code_type"):
            op.drop_constraint("site_code_type", "sites", type_="check")
        if _has_column("sites", "site_code_type"):
            op.drop_column("sites", "site_code_type")

    for table in THEMED_TABLES:
        if not _has_table(table):
            continue
        for column in ("theme_category", "theme_name"):
            if _has_column(table, column):
                op.drop_column(table, column)
