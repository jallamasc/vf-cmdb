"""Round 5 QA: repair legacy sites.site_code_type='theme' rows

Requested: "I keep seeing the column on site code showing only the
fantastic name... in Sites, the site code shows the fantastic name
instead of the conformed name." Before this session's earlier fix
(generate_site no longer mirrors theme_name into simple_name for
site_code_type='theme' rows), a row created under that now-removed mode
had its real code column (`simple_name`) permanently overwritten with the
themed name, and its `theme_name` column was often left NULL (nothing
ever wrote it back) — so the site's "code" and its "fantastic name" were
never actually two independent values, just one name shown twice under
two different labels.

This is a one-time data repair, not a schema change:

  * Any row with ``site_code_type = 'theme'`` and ``theme_name IS NULL``
    gets ``theme_name`` backfilled from its current ``simple_name`` (the
    value the deprecated mode put there really was the operator's chosen
    fantastic name — this makes it visible/editable as one instead of
    silently missing).
  * Every ``site_code_type = 'theme'`` row is then switched to
    ``'custom'`` — the UI (SiteCodePanel.tsx) has treated "theme" as
    "custom" for display/edit purposes since that earlier fix anyway, so
    this just makes the stored value match what the UI already implies;
    ``simple_name`` itself is left completely untouched (it remains
    whatever real/placeholder code the row already had).

Idempotent / guarded, following the style of 0005-0035.

Revision ID: 0036_site_theme_legacy_repair
Revises: 0035_power_outlet_section
Create Date: 2026-09-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0036_site_theme_legacy_repair"
down_revision = "0035_power_outlet_section"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sites = sa.table(
        "sites",
        sa.column("id", sa.Integer),
        sa.column("site_code_type", sa.String),
        sa.column("simple_name", sa.String),
        sa.column("theme_name", sa.String),
    )
    bind = op.get_bind()

    # Backfill theme_name from simple_name only where it's still empty —
    # never overwrite a theme_name an operator already set independently.
    bind.execute(
        sites.update()
        .where(sa.and_(sites.c.site_code_type == "theme", sites.c.theme_name.is_(None)))
        .values(theme_name=sites.c.simple_name)
    )
    # "theme" is no longer offered anywhere in the UI as a Site Code mode;
    # normalize stored rows to "custom" (simple_name is untouched).
    bind.execute(
        sites.update()
        .where(sites.c.site_code_type == "theme")
        .values(site_code_type="custom")
    )


def downgrade() -> None:
    # Data repair only — not reversible (the original theme_name-was-NULL
    # state can't be distinguished from a legitimately-set one after the
    # fact), matching every other data-only step in this migration chain.
    pass
