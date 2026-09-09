"""Naming-convention modifications, item 1/9 — Max Length becomes a real
constraint instead of purely decorative metadata:

1. A LookupMixin row's own `max_length` must be within 1-9 (the frontend's
   new dropdown range).
2. On CREATE, the forced, server-derived abbreviation (Bug fix,
   post-Phase-6 QA — see crud.py's `_auto_abbreviate`) is trimmed to fit
   the row's own `max_length`, never rejected.
3. Bug fix (round 4) — on UPDATE, lowering `max_length` alone (full_name
   unchanged) does NOT re-derive/re-trim the abbreviation. An operator
   changing Max Length must never silently mangle an already-meaningful,
   already-unique abbreviation (e.g. "vsw" for "Virtual switch", chosen
   to stay distinguishable from a plain "sw" Switch type) just because
   they lowered a limit — that value only ever gets touched by
   `_auto_abbreviate` again once `full_name`/`trim_mode`/
   `case_enforcement` itself changes. So a `max_length` lowered below the
   CURRENT abbreviation's length is instead rejected outright by
   `abbrev.validate_abbreviation_length` (unit-tested below), the same
   422 a client-typed too-long value used to get.

Both checks are `None`-safe: an unset `max_length` never constrains
anything (pre-existing rows created before this change keep working).
"""
import pytest
from fastapi import HTTPException

from app import abbrev, crud, models


@pytest.mark.asyncio
async def test_derived_abbreviation_is_trimmed_to_fit_max_length(session):
    org = await crud.create_item(
        session, models.Organization, {"full_name": "Acme", "max_length": 2}
    )
    assert len(org.abbreviation) <= 2
    assert org.max_length == 2


def test_validate_abbreviation_length_rejects_a_too_long_value():
    with pytest.raises(HTTPException) as exc:
        abbrev.validate_abbreviation_length("acme", 2)
    assert exc.value.status_code == 422
    assert "Max Length" in exc.value.detail


def test_validate_abbreviation_length_accepts_a_value_within_bounds():
    abbrev.validate_abbreviation_length("ac", 2)  # must not raise


@pytest.mark.asyncio
async def test_unset_max_length_never_constrains_the_abbreviation(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Acmecorporation"})
    assert org.max_length is None
    # No max_length -> the derived abbreviation is never truncated.
    assert org.abbreviation == abbrev.preview_abbreviation("Acmecorporation", "consonants", "lowercase")


@pytest.mark.asyncio
async def test_max_length_out_of_range_is_rejected_on_create(session):
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session, models.Organization, {"full_name": "Acme", "max_length": 15}
        )
    assert exc.value.status_code == 422
    assert "between 1 and 9" in exc.value.detail


@pytest.mark.asyncio
async def test_max_length_zero_is_rejected(session):
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(session, models.Organization, {"full_name": "Acme", "max_length": 0})
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_max_length_out_of_range_is_rejected_on_update(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Acme"})
    with pytest.raises(HTTPException) as exc:
        await crud.update_item(session, models.Organization, org.id, {"max_length": 10})
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_lowering_max_length_below_the_current_abbreviation_is_rejected(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Acmecorp", "max_length": 4})
    original_abbrev = org.abbreviation
    assert len(original_abbrev) == 4
    with pytest.raises(HTTPException) as exc:
        await crud.update_item(session, models.Organization, org.id, {"max_length": 2})
    assert exc.value.status_code == 422
    assert "Max Length" in exc.value.detail
    # The rejected attempt must never have reached the database —
    # `refresh()` re-queries and overwrites the in-memory attributes,
    # instead of `get()` returning the same (locally mutated, never
    # flushed) Python instance straight out of the identity map.
    await session.refresh(org)
    assert org.abbreviation == original_abbrev
    assert org.max_length == 4


@pytest.mark.asyncio
async def test_raising_max_length_never_touches_the_existing_abbreviation(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Acmecorp", "max_length": 4})
    original = org.abbreviation
    updated = await crud.update_item(session, models.Organization, org.id, {"max_length": 9})
    assert updated.abbreviation == original
    assert updated.max_length == 9


@pytest.mark.asyncio
async def test_lowering_max_length_to_a_value_the_current_abbreviation_still_fits_is_allowed(session):
    org = await crud.create_item(session, models.Organization, {"full_name": "Ab"})  # -> "b" (1 char)
    updated = await crud.update_item(session, models.Organization, org.id, {"max_length": 3})
    assert updated.abbreviation == org.abbreviation
    assert updated.max_length == 3
