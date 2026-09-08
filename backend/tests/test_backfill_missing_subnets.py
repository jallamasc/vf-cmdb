"""Post-Phase-6 QA (round 3) — "Subnets (IPAM) is always completely empty
and I can't add anything, what is this for?"

The demo-topology seed block (VLANs/subnets included) only ever runs ONCE,
gated by the `Organization` row count. A database that reached "already
seeded" status before subnets existed in `seed_subnets.json` — or simply
had an `Organization` row created by hand first — is locked out of ever
getting subnet rows from a normal `seed()` run again. `_backfill_missing_subnets`
recovers from exactly that, but ONLY when the whole database currently has
zero subnets of either family, so it can never duplicate or interfere with
real (possibly hand-edited) subnet data.
"""
import json
import os

from sqlalchemy import func, select

from app import crud, models
from app.seed import HERE, _backfill_missing_subnets


def _seed_json_counts():
    with open(os.path.join(HERE, "seed_subnets.json")) as f:
        data = json.load(f)
    return len(data["subnets_ipv4"]), len(data["subnets_ipv6"])


async def test_backfills_subnets_when_none_exist_and_a_site_is_present(session):
    v4_expected, v6_expected = _seed_json_counts()
    await crud.create_item(session, models.Site, {})

    created_vlans = await _backfill_missing_subnets(session)

    assert created_vlans > 0
    v4_count = (await session.execute(select(func.count()).select_from(models.SubnetIpv4))).scalar_one()
    v6_count = (await session.execute(select(func.count()).select_from(models.SubnetIpv6))).scalar_one()
    assert v4_count == v4_expected
    assert v6_count == v6_expected


async def test_does_nothing_when_no_site_exists_yet(session):
    created_vlans = await _backfill_missing_subnets(session)
    assert created_vlans == 0
    v4_count = (await session.execute(select(func.count()).select_from(models.SubnetIpv4))).scalar_one()
    assert v4_count == 0


async def test_never_touches_a_database_that_already_has_real_subnet_data(session):
    """Even ONE pre-existing subnet (of either family) must fully disable
    the backfill — it must never assume it knows what else "should" be
    there and risk duplicating or clobbering real, possibly hand-edited
    data."""
    site = await crud.create_item(session, models.Site, {})
    manual = await crud.create_item(
        session, models.SubnetIpv4, {"site_id": site.id, "network_cidr": "10.99.0.0/24"}
    )

    created_vlans = await _backfill_missing_subnets(session)

    assert created_vlans == 0
    v4_count = (await session.execute(select(func.count()).select_from(models.SubnetIpv4))).scalar_one()
    assert v4_count == 1  # only the manually-created one — nothing added
    still_there = await session.get(models.SubnetIpv4, manual.id)
    assert still_there is not None


async def test_is_idempotent_on_a_second_call(session):
    await crud.create_item(session, models.Site, {})
    first = await _backfill_missing_subnets(session)
    assert first > 0

    second = await _backfill_missing_subnets(session)
    assert second == 0

    v4_expected, _ = _seed_json_counts()
    v4_count = (await session.execute(select(func.count()).select_from(models.SubnetIpv4))).scalar_one()
    assert v4_count == v4_expected  # not doubled
