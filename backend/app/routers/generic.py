"""Generic CRUD router covering every registered entity."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from .. import crud
from ..database import get_session
from ..registry import ENTITY_REGISTRY

router = APIRouter(tags=["crud"])


def _model_or_404(resource: str):
    model = ENTITY_REGISTRY.get(resource)
    if model is None:
        raise HTTPException(status_code=404, detail=f"Unknown resource '{resource}'")
    return model


@router.get("/{resource}")
async def list_resource(
    resource: str,
    limit: int = Query(1000, le=5000),
    offset: int = 0,
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    model = _model_or_404(resource)
    items = await crud.list_items(session, model, limit=limit, offset=offset)
    return [crud.to_dict(i) for i in items]


@router.post("/{resource}", status_code=201)
async def create_resource(
    resource: str,
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    model = _model_or_404(resource)
    obj = await crud.create_item(session, model, payload)
    return crud.to_dict(obj)


@router.get("/{resource}/{item_id}")
async def get_resource(
    resource: str,
    item_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    model = _model_or_404(resource)
    obj = await crud.get_item(session, model, item_id)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found")
    return crud.to_dict(obj)


@router.put("/{resource}/{item_id}")
@router.patch("/{resource}/{item_id}")
async def update_resource(
    resource: str,
    item_id: int,
    payload: dict[str, Any],
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    model = _model_or_404(resource)
    obj = await crud.update_item(session, model, item_id, payload)
    if obj is None:
        raise HTTPException(status_code=404, detail="Not found")
    return crud.to_dict(obj)


@router.delete("/{resource}/{item_id}")
async def delete_resource(
    resource: str,
    item_id: int,
    session: AsyncSession = Depends(get_session),
) -> Response:
    model = _model_or_404(resource)
    ok = await crud.delete_item(session, model, item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(status_code=204)
