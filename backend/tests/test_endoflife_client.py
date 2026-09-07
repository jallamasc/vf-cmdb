"""Phase 6 Task 30 (Requirement 12.1) — endoflife.date sync for
OsFamily/OsVersion. Every HTTP call goes through httpx.MockTransport —
never a real endoflife.date request (mirrors test_semaphore_client.py's
own dependency-injection pattern).
"""
from __future__ import annotations

import json

import httpx
import pytest

from app import endoflife_client as eol
from app import models


def _product(name: str, label: str, releases: list[dict]) -> dict:
    return {"name": name, "label": label, "category": "os", "releases": releases}


def _release(name: str) -> dict:
    return {"name": name, "isEol": False}


UBUNTU = _product("ubuntu", "Ubuntu", [_release("26.04"), _release("24.04")])
RHEL = _product("rhel", "Red Hat Enterprise Linux", [_release("10"), _release("9")])


def _mock_client(products_by_slug: dict[str, dict]) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        slug = request.url.path.rsplit("/", 1)[-1]
        product = products_by_slug.get(slug)
        if product is None:
            return httpx.Response(404, json={"detail": "not found"})
        return httpx.Response(200, json={"result": product})

    transport = httpx.MockTransport(handler)
    return httpx.AsyncClient(transport=transport)


def test_slugify_replaces_punctuation_with_hyphens_and_collapses_runs():
    assert eol._slugify("26.04") == "26-04"
    assert eol._slugify("10 (Upcoming ELS)") == "10-upcoming-els"
    assert eol._slugify("Resolute Raccoon") == "resolute-raccoon"


@pytest.mark.asyncio
async def test_fetch_product_parses_the_result_object():
    client = _mock_client({"ubuntu": UBUNTU})
    product = await eol.fetch_product("ubuntu", client=client)
    assert product["label"] == "Ubuntu"
    assert len(product["releases"]) == 2


@pytest.mark.asyncio
async def test_fetch_product_raises_on_unknown_slug():
    client = _mock_client({})
    with pytest.raises(httpx.HTTPError):
        await eol.fetch_product("nope", client=client)


@pytest.mark.asyncio
async def test_sync_products_creates_families_and_versions(session):
    client = _mock_client({"ubuntu": UBUNTU, "rhel": RHEL})
    result = await eol.sync_products(session, ["ubuntu", "rhel"], client=client)

    assert "Ubuntu" in result.families_created
    assert "Red Hat Enterprise Linux" in result.families_created
    assert "Ubuntu 26.04" in result.versions_created
    assert "Ubuntu 24.04" in result.versions_created
    assert "Red Hat Enterprise Linux 10" in result.versions_created
    assert "Red Hat Enterprise Linux 9" in result.versions_created
    assert result.products_unreachable == []
    assert result.skipped_conflicts == []

    from sqlalchemy import func, select

    families = (await session.execute(select(models.OsFamily))).scalars().all()
    assert any(f.abbreviation == "ubuntu" for f in families)
    versions = (await session.execute(select(models.OsVersion))).scalars().all()
    assert any(v.abbreviation == "ubuntu-26-04" for v in versions)


@pytest.mark.asyncio
async def test_sync_products_is_idempotent_on_a_second_run(session):
    client = _mock_client({"ubuntu": UBUNTU})
    first = await eol.sync_products(session, ["ubuntu"], client=client)
    assert len(first.families_created) == 1
    assert len(first.versions_created) == 2

    second = await eol.sync_products(session, ["ubuntu"], client=client)
    assert second.families_created == []
    assert second.versions_created == []

    from sqlalchemy import select

    families = (await session.execute(select(models.OsFamily))).scalars().all()
    assert len([f for f in families if f.abbreviation == "ubuntu"]) == 1


@pytest.mark.asyncio
async def test_sync_products_records_unreachable_products_without_raising(session):
    client = _mock_client({"ubuntu": UBUNTU})  # "rhel" is deliberately absent
    result = await eol.sync_products(session, ["ubuntu", "rhel"], client=client)

    assert "Ubuntu" in result.families_created
    assert result.products_unreachable == ["rhel"]


@pytest.mark.asyncio
async def test_sync_products_skips_a_real_abbreviation_conflict_without_failing(session):
    # An existing, UNRELATED row already owns the "ubuntu" abbreviation in
    # the global registry (e.g. a hand-typed lookup elsewhere) — the sync
    # must skip creating a family for it instead of raising, and must not
    # touch that pre-existing row.
    from app import abbrev

    conflicting = models.Brand(full_name="Some Brand", abbreviation="ubuntu")
    session.add(conflicting)
    await session.flush()
    await abbrev.sync_registry(session, "brands", conflicting.id, "abbreviation", "ubuntu")

    client = _mock_client({"ubuntu": UBUNTU})
    result = await eol.sync_products(session, ["ubuntu"], client=client)

    assert result.families_created == []
    assert result.skipped_conflicts == ["os_families.ubuntu"]

    from sqlalchemy import select

    families = (await session.execute(select(models.OsFamily))).scalars().all()
    assert not any(f.abbreviation == "ubuntu" for f in families)


@pytest.mark.asyncio
async def test_sync_products_defaults_to_curated_products_when_none_given(session):
    client = _mock_client({slug: UBUNTU for slug in eol.CURATED_PRODUCTS})
    result = await eol.sync_products(session, client=client)
    assert len(result.families_created) == len(eol.CURATED_PRODUCTS)
