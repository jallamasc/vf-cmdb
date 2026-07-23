"""Generic async CRUD service with automatic changelog + naming.

Every create/update/delete records field-level entries in ``change_log`` and
re-computes auto-generated name fields via the naming engine.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from . import abbrev, models, naming

# Auto-generated columns must never be set directly by clients.
COMPUTED_FIELDS = {
    "vf_long_name",
    "vf_short_name",
    "tia606b_name",
    "vf_friendly_name",
    "created_at",
    "updated_at",
    "id",
}


def _columns(model) -> set[str]:
    return {c.key for c in inspect(model).columns}


def _to_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    return str(value)


def sanitize_payload(model, payload: dict) -> dict:
    cols = _columns(model)
    clean: dict[str, Any] = {}
    for key, value in payload.items():
        if key in COMPUTED_FIELDS:
            continue
        if key in cols:
            if isinstance(value, str) and value.strip() == "":
                value = None
            clean[key] = value
    return clean


async def _validate_abbrev(session: AsyncSession, obj, entity_id) -> None:
    """Normalise the abbreviation/code and validate charset + global uniqueness.

    Runs BEFORE the row is flushed so clients receive a clean 422/409 error
    instead of a raw database CHECK / unique-index violation. The value is
    normalised in place according to the record's ``case_enforcement``.
    """
    field = abbrev.ABBR_FIELDS.get(type(obj))
    if field is None:
        return
    value = getattr(obj, field, None)
    if not value:
        return
    value = abbrev.apply_case(value, getattr(obj, "case_enforcement", None))
    setattr(obj, field, value)
    abbrev.validate_charset(value, field)
    conflict = await abbrev._conflict(
        session, value, obj.__tablename__, entity_id
    )
    if conflict is not None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=409,
            detail=(
                f"Abbreviation '{value}' is already used by "
                f"{conflict.entity_type} #{conflict.entity_id}. "
                "Abbreviations must be globally unique (case-insensitive)."
            ),
        )


async def _sync_abbrev(session: AsyncSession, obj) -> None:
    """Write / update / remove the global registry row for a saved record.

    The value was already normalised + validated by ``_validate_abbrev`` before
    flush; this only persists the registry ownership row.
    """
    field = abbrev.ABBR_FIELDS.get(type(obj))
    if field is None:
        return
    value = getattr(obj, field, None)
    await abbrev.sync_registry(
        session, obj.__tablename__, obj.id, field, value or None
    )


async def _log(
    session: AsyncSession,
    table: str,
    record_id: int,
    field: str,
    old: Any,
    new: Any,
    source: str,
) -> None:
    session.add(
        models.ChangeLog(
            table_name=table,
            record_id=record_id,
            field_name=field,
            old_value=_to_str(old),
            new_value=_to_str(new),
            change_source=source,
        )
    )


async def list_items(
    session: AsyncSession, model, limit: int = 1000, offset: int = 0
) -> list:
    order_col = inspect(model).columns["id"]
    result = await session.execute(
        select(model).order_by(order_col).limit(limit).offset(offset)
    )
    return list(result.scalars().all())


async def get_item(session: AsyncSession, model, item_id: int):
    return await session.get(model, item_id)


async def create_item(
    session: AsyncSession, model, payload: dict, source: str = "web_ui"
):
    data = sanitize_payload(model, payload)
    obj = model(**data)
    await _validate_abbrev(session, obj, entity_id=None)
    session.add(obj)
    await session.flush()  # obtain PK
    await naming.apply_naming(session, obj)
    await _sync_abbrev(session, obj)
    await session.flush()
    for field, value in data.items():
        await _log(session, model.__tablename__, obj.id, field, None, value, source)
    await session.commit()
    await session.refresh(obj)
    return obj


async def update_item(
    session: AsyncSession, model, item_id: int, payload: dict, source: str = "web_ui"
):
    obj = await session.get(model, item_id)
    if obj is None:
        return None
    data = sanitize_payload(model, payload)
    changes: list[tuple[str, Any, Any]] = []
    for field, new_value in data.items():
        old_value = getattr(obj, field)
        if _to_str(old_value) != _to_str(new_value):
            changes.append((field, old_value, new_value))
            setattr(obj, field, new_value)
    if changes:
        await _validate_abbrev(session, obj, entity_id=obj.id)
        await session.flush()
        await naming.apply_naming(session, obj)
        await _sync_abbrev(session, obj)
        await session.flush()
        for field, old, new in changes:
            await _log(session, model.__tablename__, obj.id, field, old, new, source)
        await session.commit()
        await session.refresh(obj)
    return obj


async def delete_item(
    session: AsyncSession, model, item_id: int, source: str = "web_ui"
) -> bool:
    obj = await session.get(model, item_id)
    if obj is None:
        return False
    await _log(session, model.__tablename__, item_id, "__deleted__", "exists", None, source)
    if type(obj) in abbrev.ABBR_FIELDS:
        await abbrev.remove_registry(session, obj.__tablename__, obj.id)
    await session.delete(obj)
    await session.commit()
    return True


import ipaddress as _ipaddress

_IP_TYPES = (
    _ipaddress.IPv4Address,
    _ipaddress.IPv6Address,
    _ipaddress.IPv4Network,
    _ipaddress.IPv6Network,
    _ipaddress.IPv4Interface,
    _ipaddress.IPv6Interface,
)


def to_dict(obj) -> dict:
    if obj is None:
        return {}
    result = {}
    for c in inspect(type(obj)).columns:
        value = getattr(obj, c.key)
        if isinstance(value, _IP_TYPES):
            value = str(value)
        result[c.key] = value
    return result
