"""End-to-end regression coverage for `app.seed.seed()` itself.

Nothing previously exercised the full first-run demo-topology seed
function directly (only its additive sub-helpers, e.g.
`test_seed_brands.py`/`test_seed_region_coords.py`). Added alongside the
Post-Phase-6 QA (round 3) subnet-seeding refactor (`_seed_subnets_from_json`
extracted out of `seed()`, reused by `_backfill_missing_subnets`) to catch
any regression in the main first-run path, not just the new backfill path.

`seed()` opens its own `AsyncSessionLocal()` internally rather than taking
a session — the `session` fixture (conftest.py) already repoints
`app.database.AsyncSessionLocal` at the same test-DB engine for the
duration of the test, so calling `seed.seed()` directly here lands on the
same database this test then inspects.
"""
from sqlalchemy import func, select

from app import models
from app.seed import seed


async def test_full_seed_run_creates_orgs_sites_and_subnets(session):
    await seed()

    org_count = (await session.execute(select(func.count()).select_from(models.Organization))).scalar_one()
    site_count = (await session.execute(select(func.count()).select_from(models.Site))).scalar_one()
    v4_count = (await session.execute(select(func.count()).select_from(models.SubnetIpv4))).scalar_one()
    v6_count = (await session.execute(select(func.count()).select_from(models.SubnetIpv6))).scalar_one()
    vlan_count = (await session.execute(select(func.count()).select_from(models.Vlan))).scalar_one()

    assert org_count > 0
    assert site_count > 0
    assert v4_count > 0
    assert v6_count > 0
    assert vlan_count > 0

# Note: a "run seed() twice in one test" case was deliberately NOT added
# here — this test harness's asyncpg connections are pinned to the event
# loop that opened them (see conftest.py's own docstring), and `seed()`
# opens brand-new `AsyncSessionLocal()` connections internally on every
# call, which conflicts with connection-pool reuse across two calls within
# the same test. The `already_seeded` gate itself is untouched by this
# round's refactor (still the exact same `Organization` count check), and
# `_backfill_missing_subnets`'s own idempotency is already covered
# directly in `test_backfill_missing_subnets.py`.
