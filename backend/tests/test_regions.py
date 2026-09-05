"""Phase 4 Task 9 — region cleanup migration guard.

Feature: phase-4-ux-graphical-views. Covers Requirements 8.2, 8.3: a
non-approved Region referenced by a Site survives; an unreferenced one is
deleted; approved rows are always kept.
"""
import pytest
from sqlalchemy import text

from app import models


@pytest.mark.asyncio
async def test_region_cleanup_guard(session, db_engine):
    # Seed: one approved region, one unreferenced non-approved region, one
    # non-approved region THAT a Site points at.
    approved = models.Region(full_name="Región Central", abbreviation="CO-CTR")
    orphan = models.Region(full_name="EastUS 1", abbreviation="eu1")
    referenced = models.Region(full_name="Europe, Middle East and Africa", abbreviation="EMEA")
    session.add_all([approved, orphan, referenced])
    await session.flush()
    site = models.Site(region_id=referenced.id)
    session.add(site)
    await session.commit()

    approved_id, orphan_id, referenced_id = approved.id, orphan.id, referenced.id

    # Run the same DELETE the migration issues, against this test engine.
    approved_abbrevs = (
        "CO-CTR", "CO-CAR", "CO-PAC", "CO-AND", "CO-ORI", "CO-AMZ",
        "NAEAST", "NAWEST", "CAN", "MEX-CA", "CAR", "LATAM-S",
    )
    placeholders = ", ".join(f"'{a}'" for a in approved_abbrevs)
    async with db_engine.begin() as conn:
        await conn.execute(
            text(
                f"""
                DELETE FROM regions r
                 WHERE upper(coalesce(r.abbreviation, '')) NOT IN ({placeholders})
                   AND NOT EXISTS (
                         SELECT 1 FROM sites s WHERE s.region_id = r.id
                       )
                """
            )
        )
    # The DELETE ran on a separate connection; the ORM session's identity map
    # still holds the pre-delete Python objects, so it must be told to forget
    # them before re-reading (otherwise session.get() returns stale objects).
    session.expire_all()

    approved_row = await session.get(models.Region, approved_id)
    orphan_row = await session.get(models.Region, orphan_id)
    referenced_row = await session.get(models.Region, referenced_id)

    assert approved_row is not None, "approved region must survive"
    assert orphan_row is None, "unreferenced non-approved region must be deleted"
    assert referenced_row is not None, "referenced non-approved region must survive"

    # Idempotency: running the delete again changes nothing further.
    async with db_engine.begin() as conn:
        await conn.execute(
            text(
                f"""
                DELETE FROM regions r
                 WHERE upper(coalesce(r.abbreviation, '')) NOT IN ({placeholders})
                   AND NOT EXISTS (
                         SELECT 1 FROM sites s WHERE s.region_id = r.id
                       )
                """
            )
        )
    session.expire_all()
    assert await session.get(models.Region, referenced_id) is not None
