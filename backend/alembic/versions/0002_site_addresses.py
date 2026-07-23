"""separate reference data (site addresses) from naming conventions

Adds a dedicated ``site_addresses`` reference table and wires it to ``sites``
via ``site_address_id``. Also adds a ``custom_fields`` JSONB column to
``sites`` to back the dynamic-column feature on the Sites page.

A small data migration lifts the free-text ``sites.description`` that was
being used to hold a physical address ("Bogota, Home, 1st Floor Datacenter")
into a proper ``site_addresses`` row and links it back.

NOTE: revision 0001 builds the schema with ``Base.metadata.create_all`` which
always reflects the *current* models. On a brand-new database that means the
``site_addresses`` table and the new ``sites`` columns already exist by the
time this migration runs. Every structural step below is therefore guarded
with an existence check so the migration is safe on both fresh and
previously-seeded databases.

Revision ID: 0002_site_addresses
Revises: 0001_initial
Create Date: 2026-07-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002_site_addresses"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def _inspector():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return column in {c["name"] for c in _inspector().get_columns(table)}


def _has_fk(table: str, name: str) -> bool:
    return name in {fk["name"] for fk in _inspector().get_foreign_keys(table)}


def upgrade() -> None:
    # 1. New reference table -------------------------------------------------
    if not _has_table("site_addresses"):
        op.create_table(
            "site_addresses",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("label", sa.String(length=120), nullable=False),
            sa.Column("street", sa.String(length=200), nullable=True),
            sa.Column("city", sa.String(length=120), nullable=True),
            sa.Column("state_region", sa.String(length=120), nullable=True),
            sa.Column("postal_code", sa.String(length=40), nullable=True),
            sa.Column("country", sa.String(length=120), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
        )

    # 2. Wire it to sites + add dynamic-column store -------------------------
    if not _has_column("sites", "site_address_id"):
        op.add_column(
            "sites",
            sa.Column("site_address_id", sa.Integer(), nullable=True),
        )
    if not _has_column("sites", "custom_fields"):
        op.add_column(
            "sites",
            sa.Column("custom_fields", JSONB(), nullable=True),
        )
    if not _has_fk("sites", "fk_sites_site_address_id"):
        op.create_foreign_key(
            "fk_sites_site_address_id",
            "sites",
            "site_addresses",
            ["site_address_id"],
            ["id"],
        )

    # 3. Data migration: lift existing address-like descriptions -------------
    bind = op.get_bind()
    sites = bind.execute(
        sa.text(
            "SELECT id, description FROM sites "
            "WHERE description IS NOT NULL AND site_address_id IS NULL"
        )
    ).fetchall()
    for site_id, description in sites:
        desc = (description or "").strip()
        if not desc:
            continue
        # Heuristic: the seeded description is "City, Campus, detail".
        parts = [p.strip() for p in desc.split(",") if p.strip()]
        city = parts[0] if parts else None
        label = desc if len(desc) <= 120 else desc[:117] + "..."
        result = bind.execute(
            sa.text(
                "INSERT INTO site_addresses (label, city, country, notes) "
                "VALUES (:label, :city, :country, :notes) RETURNING id"
            ),
            {
                "label": label,
                "city": city,
                "country": "Colombia",
                "notes": "Migrated from sites.description",
            },
        )
        new_id = result.scalar()
        bind.execute(
            sa.text("UPDATE sites SET site_address_id = :aid WHERE id = :sid"),
            {"aid": new_id, "sid": site_id},
        )


def downgrade() -> None:
    if _has_fk("sites", "fk_sites_site_address_id"):
        op.drop_constraint("fk_sites_site_address_id", "sites", type_="foreignkey")
    if _has_column("sites", "custom_fields"):
        op.drop_column("sites", "custom_fields")
    if _has_column("sites", "site_address_id"):
        op.drop_column("sites", "site_address_id")
    if _has_table("site_addresses"):
        op.drop_table("site_addresses")
