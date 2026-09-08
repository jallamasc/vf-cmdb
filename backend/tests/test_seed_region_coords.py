"""Bug-fix (post-Phase-6 QA, Req 7.2) — REGION_COORDS backfill.

RegionMap.tsx's marker layer (Phase 6 Task 18) only draws a marker for a
Region row that has latitude/longitude set — before this fix nothing ever
set them except an operator's manual click-to-place (Task 19), so the map
showed no markers at all. `_backfill_region_coords` sets an illustrative
centroid for every seeded region abbreviation, without ever overwriting a
coordinate an operator already placed.

Calls `_seed_lookups()` + `_backfill_region_coords()` directly, mirroring
`test_seed_brands.py`'s pattern of exercising the additive seed helpers
without the full `seed()` (which also creates an unrelated demo topology).
"""
from __future__ import annotations

from sqlalchemy import select

from app import models
from app.seed import REGION_COORDS, _backfill_region_coords, _seed_lookups


async def test_backfill_sets_coordinates_for_every_seeded_region(session):
    m, _created = await _seed_lookups(session)
    n = await _backfill_region_coords(session, m[models.Region])
    await session.commit()

    assert n == len(REGION_COORDS)
    rows = (await session.execute(select(models.Region))).scalars().all()
    by_abbr = {r.abbreviation: r for r in rows}
    for abbr, (lat, lon) in REGION_COORDS.items():
        assert by_abbr[abbr].latitude == lat
        assert by_abbr[abbr].longitude == lon


async def test_backfill_is_idempotent_on_a_second_run(session):
    m, _created = await _seed_lookups(session)
    first = await _backfill_region_coords(session, m[models.Region])
    await session.commit()
    assert first == len(REGION_COORDS)

    second = await _backfill_region_coords(session, m[models.Region])
    await session.commit()
    assert second == 0


async def test_backfill_never_overwrites_an_operator_placed_coordinate(session):
    m, _created = await _seed_lookups(session)
    region = await session.get(models.Region, m[models.Region]["CO-AND"])
    region.latitude = 1.23
    region.longitude = -4.56
    await session.commit()

    await _backfill_region_coords(session, m[models.Region])
    await session.commit()

    await session.refresh(region)
    assert region.latitude == 1.23
    assert region.longitude == -4.56
