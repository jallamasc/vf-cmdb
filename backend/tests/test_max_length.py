"""Naming-convention modifications, item 1/9 — Max Length becomes a real
constraint instead of purely decorative metadata:

1. A LookupMixin row's own `max_length` must be within 1-9 (the frontend's
   new dropdown range).
2. The forced, server-derived abbreviation (Bug fix, post-Phase-6 QA — see
   crud.py's `_auto_abbreviate`) is always trimmed to fit its row's own
   `max_length`, never rejected. `abbrev.validate_abbreviation_length`
   itself (unit-tested below) still rejects a too-long value outright, and
   remains the guard for the "code"-based hierarchy models
   (Datacenter/Room/Rack) whose code is still client-set via
   `AbbrevField.tsx` on the Hierarchy page — LookupMixin's `abbreviation`
   is no longer client-set at all, so this path can't be hit via
   `crud.create_item`/`update_item` for it anymore.

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
async def test_lowering_max_length_re_derives_a_shorter_abbreviation(session):
    """Changing `max_length` alone still re-triggers `_auto_abbreviate`
    (it's part of the update's changed-field set), so the abbreviation is
    re-derived/re-trimmed to fit the new bound — never left stale, and
    never rejected the way a client-typed value used to be."""
    org = await crud.create_item(session, models.Organization, {"full_name": "Acme", "max_length": 4})
    updated = await crud.update_item(session, models.Organization, org.id, {"max_length": 2})
    assert len(updated.abbreviation) <= 2
