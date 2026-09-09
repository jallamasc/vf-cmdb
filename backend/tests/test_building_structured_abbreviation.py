"""Post-Phase-6 QA (round 4) — "how did the app deduce that 'Main Building
1' equals to M1 abbreviation... do not guess." Building's abbreviation is
now composed deterministically from explicit `building_type` + `number`
columns (crud.py's `_auto_abbreviate`), not consonant-derived from
`full_name` text like every other plain lookup.
"""
from app import crud, models


async def test_abbreviation_composes_from_type_and_number(session):
    b = await crud.create_item(
        session, models.Building, {"full_name": "Main Building 1", "building_type": "Main", "number": 1}
    )
    assert b.abbreviation == "m1"


async def test_abbreviation_ignores_a_client_supplied_value(session):
    b = await crud.create_item(
        session,
        models.Building,
        {"full_name": "Main Building 1", "building_type": "Main", "number": 1, "abbreviation": "whatever"},
    )
    assert b.abbreviation == "m1"


async def test_falls_back_to_full_name_derivation_when_structured_fields_are_unset(session):
    """A legacy/incomplete row without building_type/number still gets a
    forced abbreviation — just via the generic consonant-derivation path,
    same as every other plain lookup."""
    b = await crud.create_item(session, models.Building, {"full_name": "Warehouse"})
    assert b.abbreviation  # non-empty
    assert b.building_type is None
    assert b.number is None


async def test_updating_number_re_composes_the_abbreviation(session):
    b = await crud.create_item(
        session, models.Building, {"full_name": "Main Building 1", "building_type": "Main", "number": 1}
    )
    assert b.abbreviation == "m1"
    updated = await crud.update_item(session, models.Building, b.id, {"number": 2})
    assert updated.abbreviation == "m2"


async def test_a_collision_gets_a_numeric_suffix(session):
    first = await crud.create_item(
        session, models.Building, {"full_name": "Main Building 1", "building_type": "Main", "number": 1}
    )
    second = await crud.create_item(
        session, models.Building, {"full_name": "Main Annex 1", "building_type": "Main", "number": 1}
    )
    assert first.abbreviation == "m1"
    assert second.abbreviation == "m11"


async def test_switching_from_legacy_to_structured_mode_re_derives_on_update(session):
    b = await crud.create_item(session, models.Building, {"full_name": "Old Wing"})
    original = b.abbreviation
    updated = await crud.update_item(
        session, models.Building, b.id, {"building_type": "Secondary", "number": 3}
    )
    assert updated.abbreviation == "s3"
    assert updated.abbreviation != original
