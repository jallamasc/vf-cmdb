"""Naming-convention modifications, item 2/3 (+ post-Phase-6 QA bug fix) —
`abbrev.suggest_abbreviation` and its `GET /naming/suggest-abbreviation`
endpoint: a guaranteed-available abbreviation candidate derived from a
lookup row's `full_name`, with a numeric-suffix collision fallback
(`hm` -> `hm1` -> `hm2` ...). The default trim mode is now "consonants"
(Hoymeaseguro -> hymsgr) instead of "first_2" — see `crud.py`'s
`_auto_abbreviate`, which calls this helper with the SAME default to
force-derive every LookupMixin row's `abbreviation` server-side (Bug fix,
post-Phase-6 QA: the field is no longer client-settable).

Collisions here are seeded directly in the `AbbreviationRegistry` table
rather than via `crud.create_item`, because `create_item` now ALWAYS
overrides a LookupMixin row's `abbreviation` with the derived value — a
test can no longer plant an arbitrary literal value on a real row just by
passing it in the create payload.
"""
import pytest

from app import abbrev, models
from app.routers.special import naming_suggest_abbreviation


async def _seed_registry(session, value, entity_type="organizations", entity_id=999):
    session.add(
        models.AbbreviationRegistry(
            abbreviation=value,
            entity_type=entity_type,
            entity_id=entity_id,
            field_name="abbreviation",
        )
    )
    await session.commit()


@pytest.mark.asyncio
async def test_suggests_consonants_by_default(session):
    suggestion = await abbrev.suggest_abbreviation(session, "Hoymeaseguro")
    assert suggestion == "hymsgr"


@pytest.mark.asyncio
async def test_suggestion_respects_max_length(session):
    suggestion = await abbrev.suggest_abbreviation(session, "Virtualfactor", max_length=1)
    assert suggestion == "v"


@pytest.mark.asyncio
async def test_collision_gets_a_numeric_suffix(session):
    await _seed_registry(session, "vrtlfctr")
    suggestion = await abbrev.suggest_abbreviation(session, "Virtualfactor")
    assert suggestion == "vrtlfctr1"


@pytest.mark.asyncio
async def test_repeated_collisions_increment_the_suffix(session):
    await _seed_registry(session, "or", entity_id=1)
    await _seed_registry(session, "or1", entity_id=2)
    suggestion = await abbrev.suggest_abbreviation(session, "Org C", trim_mode="first_2")
    assert suggestion == "or2"


@pytest.mark.asyncio
async def test_suffix_trims_the_base_to_stay_within_max_length(session):
    await _seed_registry(session, "ab")
    suggestion = await abbrev.suggest_abbreviation(
        session, "Abacus", max_length=2, trim_mode="first_2"
    )
    # base "ab" collides; the suffix "1" must fit within max_length=2, so
    # the base itself gets trimmed to make room ("a" + "1" = "a1").
    assert suggestion == "a1"
    assert len(suggestion) <= 2


@pytest.mark.asyncio
async def test_editing_the_owning_row_itself_is_not_treated_as_a_collision(session):
    await _seed_registry(session, "hymsgr", entity_type="organizations", entity_id=42)
    suggestion = await abbrev.suggest_abbreviation(
        session, "Hoymeaseguro", entity_type="organizations", entity_id=42
    )
    assert suggestion == "hymsgr"


@pytest.mark.asyncio
async def test_endpoint_returns_a_free_suggestion(session):
    body = await naming_suggest_abbreviation(full_name="Cybertronika", session=session)
    assert body["abbreviation"] == abbrev.preview_abbreviation("Cybertronika", "consonants", "lowercase")
    assert body["full_name"] == "Cybertronika"


@pytest.mark.asyncio
async def test_endpoint_avoids_an_existing_collision(session):
    base = abbrev.preview_abbreviation("Cybertronika", "consonants", "lowercase")
    await _seed_registry(session, base)
    body = await naming_suggest_abbreviation(full_name="Cybertronika", session=session)
    assert body["abbreviation"] == f"{base}1"
