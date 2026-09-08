"""Naming-convention modifications, item 1/9 — Max Length becomes a real
constraint instead of purely decorative metadata:

1. A LookupMixin row's own `max_length` must be within 1-9 (the frontend's
   new dropdown range).
2. An abbreviation/code longer than its row's `max_length` is rejected.

Both checks are `None`-safe: an unset `max_length` never constrains
anything (pre-existing rows created before this change keep working).
"""
import pytest
from fastapi import HTTPException

from app import crud, models


@pytest.mark.asyncio
async def test_abbreviation_within_max_length_is_accepted(session):
    org = await crud.create_item(
        session, models.Organization, {"full_name": "Acme", "abbreviation": "ac", "max_length": 2}
    )
    assert org.abbreviation == "ac"
    assert org.max_length == 2


@pytest.mark.asyncio
async def test_abbreviation_longer_than_max_length_is_rejected(session):
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.Organization,
            {"full_name": "Acme", "abbreviation": "acme", "max_length": 2},
        )
    assert exc.value.status_code == 422
    assert "Max Length" in exc.value.detail


@pytest.mark.asyncio
async def test_unset_max_length_never_constrains_the_abbreviation(session):
    org = await crud.create_item(
        session, models.Organization, {"full_name": "Acme", "abbreviation": "acmecorp"}
    )
    assert org.abbreviation == "acmecorp"
    assert org.max_length is None


@pytest.mark.asyncio
async def test_max_length_out_of_range_is_rejected_on_create(session):
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.Organization,
            {"full_name": "Acme", "abbreviation": "ac", "max_length": 15},
        )
    assert exc.value.status_code == 422
    assert "between 1 and 9" in exc.value.detail


@pytest.mark.asyncio
async def test_max_length_zero_is_rejected(session):
    with pytest.raises(HTTPException) as exc:
        await crud.create_item(
            session,
            models.Organization,
            {"full_name": "Acme", "abbreviation": "ac", "max_length": 0},
        )
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_max_length_out_of_range_is_rejected_on_update(session):
    org = await crud.create_item(
        session, models.Organization, {"full_name": "Acme", "abbreviation": "ac"}
    )
    with pytest.raises(HTTPException) as exc:
        await crud.update_item(session, models.Organization, org.id, {"max_length": 10})
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_lowering_max_length_below_the_existing_abbreviation_length_is_rejected(session):
    """Changing max_length itself doesn't re-validate the OTHER field
    (abbreviation) automatically unless the update also touches it — but if
    an operator changes BOTH in the same PATCH, the new pair must be
    mutually consistent."""
    org = await crud.create_item(
        session, models.Organization, {"full_name": "Acme", "abbreviation": "acme", "max_length": 4}
    )
    with pytest.raises(HTTPException) as exc:
        await crud.update_item(
            session, models.Organization, org.id, {"max_length": 2, "abbreviation": "acme"}
        )
    assert exc.value.status_code == 422
    assert "Max Length" in exc.value.detail
