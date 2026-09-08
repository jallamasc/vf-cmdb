"""Naming-convention modifications, item 2/3 — `abbrev.suggest_abbreviation`
and its `GET /naming/suggest-abbreviation` endpoint: a guaranteed-available
abbreviation candidate derived from a lookup row's `full_name`, with a
numeric-suffix collision fallback (`vf` -> `vf1` -> `vf2` ...).
"""
import pytest

from app import abbrev, crud, models
from app.routers.special import naming_suggest_abbreviation


@pytest.mark.asyncio
async def test_suggests_the_first_two_letters_by_default(session):
    suggestion = await abbrev.suggest_abbreviation(session, "Virtualfactor")
    assert suggestion == "vi"


@pytest.mark.asyncio
async def test_suggestion_respects_max_length(session):
    suggestion = await abbrev.suggest_abbreviation(session, "Virtualfactor", max_length=1)
    assert suggestion == "v"


@pytest.mark.asyncio
async def test_collision_gets_a_numeric_suffix(session):
    await crud.create_item(
        session, models.Organization, {"full_name": "Virtualfactor", "abbreviation": "vi"}
    )
    suggestion = await abbrev.suggest_abbreviation(session, "Virtualfactor Two")
    assert suggestion == "vi1"


@pytest.mark.asyncio
async def test_repeated_collisions_increment_the_suffix(session):
    await crud.create_item(
        session, models.Organization, {"full_name": "Org A", "abbreviation": "or"}
    )
    await crud.create_item(
        session, models.Cloud, {"full_name": "Org B", "abbreviation": "or1"}
    )
    suggestion = await abbrev.suggest_abbreviation(session, "Org C", trim_mode="first_2")
    assert suggestion == "or2"


@pytest.mark.asyncio
async def test_suffix_trims_the_base_to_stay_within_max_length(session):
    await crud.create_item(
        session, models.Organization, {"full_name": "Ab", "abbreviation": "ab", "max_length": 2}
    )
    suggestion = await abbrev.suggest_abbreviation(session, "Abacus", max_length=2)
    # base "ab" collides; the suffix "1" must fit within max_length=2, so
    # the base itself gets trimmed to make room ("a" + "1" = "a1").
    assert suggestion == "a1"
    assert len(suggestion) <= 2


@pytest.mark.asyncio
async def test_editing_the_owning_row_itself_is_not_treated_as_a_collision(session):
    org = await crud.create_item(
        session, models.Organization, {"full_name": "Virtualfactor", "abbreviation": "vi"}
    )
    suggestion = await abbrev.suggest_abbreviation(
        session, "Virtualfactor", entity_type="organizations", entity_id=org.id
    )
    assert suggestion == "vi"


@pytest.mark.asyncio
async def test_endpoint_returns_a_free_suggestion(session):
    body = await naming_suggest_abbreviation(full_name="Cybertronika", session=session)
    assert body["abbreviation"] == "cy"
    assert body["full_name"] == "Cybertronika"


@pytest.mark.asyncio
async def test_endpoint_avoids_an_existing_collision(session):
    await crud.create_item(
        session, models.Organization, {"full_name": "Cybertronika", "abbreviation": "cy"}
    )
    body = await naming_suggest_abbreviation(full_name="Cyberdyne", session=session)
    assert body["abbreviation"] == "cy1"
