"""Phase 6 Task 31 (Requirement 12.2) — curated hardware Brand seed rows.

Calls seed.py's own `_seed_lookups()` directly (the additive, idempotent
upsert every LOOKUPS entry goes through) rather than the full `seed()`,
which also creates an entire demo topology unrelated to this task.
"""
from __future__ import annotations

from sqlalchemy import func, select

from app import models
from app.seed import _seed_lookups

NEW_BRANDS = {
    "Dell": "dl",
    "Cisco": "cs",
    "NetApp": "ntap",
    "IBM": "ibm",
    "Supermicro": "smc",
    "Fortinet": "ftnt",
    "Ubiquiti": "ubnt",
    "Netgear": "ntgr",
    "Synology": "syn",
    "QNAP": "qnap",
    "Juniper Networks": "jnpr",
    "Vertiv": "vrt",
    "Eaton": "etn",
}


async def test_seed_creates_every_new_curated_brand(session):
    await _seed_lookups(session)
    await session.commit()

    rows = (await session.execute(select(models.Brand))).scalars().all()
    by_name = {r.full_name: r for r in rows}
    for full_name, abbreviation in NEW_BRANDS.items():
        assert full_name in by_name, f"{full_name} was not seeded"
        assert by_name[full_name].abbreviation == abbreviation

    # The catalogue should now be a realistic ~25-30 well-known-vendor list
    # (17 pre-existing + 13 new), not a token handful.
    assert len(rows) >= 25


async def test_seed_is_idempotent_on_a_second_run(session):
    await _seed_lookups(session)
    await session.commit()
    first_count = len((await session.execute(select(models.Brand))).scalars().all())

    await _seed_lookups(session)
    await session.commit()
    second_count = len((await session.execute(select(models.Brand))).scalars().all())

    assert first_count == second_count


async def test_every_new_brand_abbreviation_is_registered_globally_unique(session):
    """Every new abbreviation must round-trip through the SAME global
    abbreviation_registry every other lookup's abbreviation/code uses —
    proves there is no silent cross-table collision in the curated list."""
    await _seed_lookups(session)
    await session.commit()

    for full_name, abbreviation in NEW_BRANDS.items():
        registry_row = (
            await session.execute(
                select(models.AbbreviationRegistry).where(
                    func.lower(models.AbbreviationRegistry.abbreviation) == abbreviation.lower()
                )
            )
        ).scalars().first()
        assert registry_row is not None, f"{full_name}'s abbreviation was never registered"
        assert registry_row.entity_type == "brands"
