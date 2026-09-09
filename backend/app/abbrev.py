"""Global abbreviation registry, naming derivation and validation helpers.

The registry guarantees that every abbreviation / code is unique across ALL
record types (case-insensitively). It also centralises:

* domain-name charset validation for abbreviation/code values,
* per record-type case enforcement,
* trim-mode derivation of a short code from a full name,
* device naming sequence gap detection.
"""
from __future__ import annotations

import re
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import models

# Columns treated as an abbreviation/code for global-uniqueness purposes,
# keyed by the SQLAlchemy model. All values participate in the same global
# namespace enforced by ``abbreviation_registry``.
ABBR_FIELDS: dict[type, str] = {}


def _build_abbr_fields() -> None:
    """Populate ABBR_FIELDS: lookups use ``abbreviation``; hierarchy uses ``code``."""
    for model in (
        models.Organization, models.Cloud, models.Region, models.Campus,
        models.Building, models.FloorSection, models.ComputeDeviceType,
        models.Brand, models.DeviceRole, models.NetworkDeviceType,
        models.NetworkSubtype, models.OsFamily, models.OsVersion,
        models.AppType, models.ClusterType, models.StorageDeviceType,
        models.NetworkIdType,
    ):
        ABBR_FIELDS[model] = "abbreviation"
    for model in (
        models.Datacenter, models.DatacenterFloor, models.Room,
        models.RackType, models.Rack,
    ):
        ABBR_FIELDS[model] = "code"


_build_abbr_fields()

# Domain-name charset: only [A-Za-z0-9-], no leading/trailing/consecutive "-".
_DOMAIN_RE = re.compile(r"^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$")

VOWELS = set("aeiou")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def validate_charset(value: str, field: str = "abbreviation") -> None:
    """Raise HTTP 422 when *value* is not a valid domain-name code."""
    if value is None or value == "":
        return
    if not _DOMAIN_RE.match(value):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Invalid {field} '{value}': only letters, digits and hyphens "
                "are allowed, with no leading/trailing hyphen and no "
                "consecutive hyphens."
            ),
        )


def validate_max_length_bounds(value: Optional[int]) -> None:
    """Naming-convention modifications (item 1) — a `LookupMixin` row's own
    `max_length` must be within the 1-9 range the frontend's dropdown
    offers. Raises HTTP 422 otherwise. A `None` value (not yet set) is
    always fine — `max_length` is optional."""
    if value is None:
        return
    if not (1 <= value <= 9):
        raise HTTPException(
            status_code=422,
            detail=f"Max Length must be between 1 and 9 (got {value}).",
        )


def validate_abbreviation_length(
    value: str, max_length: Optional[int], field: str = "abbreviation"
) -> None:
    """Naming-convention modifications (item 1/9) — make `max_length`
    actually mean something: reject an abbreviation/code longer than the
    row's own `max_length`. A `None`/unset `max_length` never constrains
    anything (existing rows created before this check keep working)."""
    if not value or max_length is None:
        return
    if len(value) > max_length:
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{value}' is {len(value)} character(s), longer than this "
                f"row's own Max Length ({max_length}). Shorten it, or raise "
                "Max Length first."
            ),
        )


def apply_case(value: str, case_enforcement: Optional[str]) -> str:
    """Normalise *value* according to the record-type case setting."""
    if value is None:
        return value
    if case_enforcement == "uppercase":
        return value.upper()
    if case_enforcement == "lowercase":
        return value.lower()
    return value  # "mixed" or unset -> no enforcement


# ---------------------------------------------------------------------------
# Trim-mode derivation
# ---------------------------------------------------------------------------
def derive_abbreviation(full_name: str, trim_mode: str) -> str:
    """Derive a short code from *full_name* using *trim_mode*.

    ``manual`` returns an empty string (the user types the value directly).
    Case enforcement is applied separately by the caller.
    """
    name = (full_name or "").strip()
    if not name or trim_mode in (None, "manual"):
        return ""
    if trim_mode.startswith("first_"):
        n = int(trim_mode.split("_", 1)[1])
        # Only keep charset-valid characters from the leading run.
        letters = re.sub(r"[^A-Za-z0-9]", "", name)
        return letters[:n]
    if trim_mode == "acronym":
        words = re.split(r"[\s\-_/]+", name)
        return "".join(w[0] for w in words if w and w[0].isalnum())
    if trim_mode == "consonants":
        letters = re.sub(r"[^A-Za-z0-9]", "", name)
        return "".join(ch for ch in letters if ch.lower() not in VOWELS)
    return ""


def preview_abbreviation(full_name: str, trim_mode: str, case_enforcement: str) -> str:
    """Full preview: derive by trim-mode then apply case enforcement."""
    return apply_case(derive_abbreviation(full_name, trim_mode), case_enforcement)


# ---------------------------------------------------------------------------
# Registry synchronisation
# ---------------------------------------------------------------------------
async def _conflict(
    session: AsyncSession, value: str, entity_type: str, entity_id: Optional[int]
) -> Optional[models.AbbreviationRegistry]:
    stmt = select(models.AbbreviationRegistry).where(
        func.lower(models.AbbreviationRegistry.abbreviation) == value.lower()
    )
    result = await session.execute(stmt)
    for row in result.scalars().all():
        if not (row.entity_type == entity_type and row.entity_id == entity_id):
            return row
    return None


async def disambiguate(
    session: AsyncSession,
    base: str,
    max_length: Optional[int] = None,
    case_enforcement: Optional[str] = "lowercase",
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
) -> str:
    """Round 4 — extracted out of ``suggest_abbreviation`` so a caller that
    already has a deterministic, STRUCTURED base value (e.g. Building's
    ``{TypeLetter}{Number}`` composition — see ``crud.py``'s
    ``_auto_abbreviate`` — instead of one derived from ``full_name`` text)
    can still reuse the exact same case-normalisation, max-length-fitting
    and numeric-suffix collision resolution as every mechanically-derived
    abbreviation in this app, without deriving anything from a name.
    Never raises — always returns a usable, charset-valid, currently-free
    value.
    """
    base = apply_case(base, case_enforcement) or "x"
    if max_length:
        base = base[:max_length] or "x"

    candidate = base
    suffix_n = 0
    while True:
        conflict = await _conflict(session, candidate, entity_type or "", entity_id)
        if conflict is None:
            return candidate
        suffix_n += 1
        suffix = str(suffix_n)
        room = max_length - len(suffix) if max_length else None
        trimmed_base = base[: max(1, room)] if room is not None else base
        candidate = f"{trimmed_base}{suffix}"


async def suggest_abbreviation(
    session: AsyncSession,
    full_name: str,
    max_length: Optional[int] = None,
    trim_mode: str = "consonants",
    case_enforcement: Optional[str] = "lowercase",
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
) -> str:
    """Bug fix (post-Phase-6 QA) — a GUARANTEED-available abbreviation
    candidate derived from *full_name*. Called by ``crud.py``'s
    ``_auto_abbreviate`` on every create/update of a LookupMixin row (the
    forced, non-editable path) and still exposed via
    ``GET /naming/suggest-abbreviation`` for any other caller.

    Defaults to consonant-stripping ("Hoymeaseguro" -> "hm") — the closest
    mechanical rule to how real-world abbreviations like "Virtualfactor" ->
    "vf" are actually chosen, though no rule can perfectly reproduce a
    hand-picked abbreviation from a single un-delimited word every time.
    On a collision, appends an incrementing numeric suffix (`vf` -> `vf1`
    -> `vf2` -> ...), trimming the base further if *max_length* would
    otherwise be exceeded. Never raises — always returns a usable, charset-
    valid, currently-free value.
    """
    base = derive_abbreviation(full_name, trim_mode)
    if not base:
        # Fall back to every alnum character in full_name, then to a
        # single placeholder letter if full_name itself has none.
        base = re.sub(r"[^A-Za-z0-9]", "", full_name or "")
    return await disambiguate(session, base, max_length, case_enforcement, entity_type, entity_id)


async def check_available(
    session: AsyncSession,
    value: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
) -> Optional[dict]:
    """Return the owning registry row (as dict) if *value* is taken, else None."""
    if not value:
        return None
    row = await _conflict(session, value, entity_type or "", entity_id)
    if row is None:
        return None
    return {
        "abbreviation": row.abbreviation,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "field_name": row.field_name,
    }


async def sync_registry(
    session: AsyncSession,
    entity_type: str,
    entity_id: int,
    field_name: str,
    new_value: Optional[str],
) -> None:
    """Insert / update / delete the registry row owned by (entity_type, id).

    Validates the charset and global (case-insensitive) uniqueness. Raises
    HTTP 409 with a clear message on a cross-record collision.
    """
    if new_value:
        validate_charset(new_value, field_name)
        conflict = await _conflict(session, new_value, entity_type, entity_id)
        if conflict is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Abbreviation '{new_value}' is already used by "
                    f"{conflict.entity_type} #{conflict.entity_id}. "
                    "Abbreviations must be globally unique (case-insensitive)."
                ),
            )

    # Find existing registry row for this owner.
    stmt = select(models.AbbreviationRegistry).where(
        models.AbbreviationRegistry.entity_type == entity_type,
        models.AbbreviationRegistry.entity_id == entity_id,
        models.AbbreviationRegistry.field_name == field_name,
    )
    existing = (await session.execute(stmt)).scalars().first()

    if not new_value:
        if existing is not None:
            await session.delete(existing)
        return

    if existing is None:
        session.add(
            models.AbbreviationRegistry(
                abbreviation=new_value,
                entity_type=entity_type,
                entity_id=entity_id,
                field_name=field_name,
            )
        )
    else:
        existing.abbreviation = new_value


async def remove_registry(
    session: AsyncSession, entity_type: str, entity_id: int
) -> None:
    """Delete any registry rows owned by (entity_type, entity_id)."""
    stmt = select(models.AbbreviationRegistry).where(
        models.AbbreviationRegistry.entity_type == entity_type,
        models.AbbreviationRegistry.entity_id == entity_id,
    )
    for row in (await session.execute(stmt)).scalars().all():
        await session.delete(row)
