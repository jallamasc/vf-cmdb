"""FastAPI application entrypoint for the Virtualfactor IT CMDB."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .registry import ENTITY_REGISTRY, LOOKUP_SLUGS, REFERENCE_SLUGS
from .routers import ansible, generic, special

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get(f"{settings.api_prefix}/meta/entities")
async def list_entities() -> dict:
    """Expose the resource catalogue so the frontend can discover endpoints."""
    return {
        "entities": sorted(ENTITY_REGISTRY.keys()),
        "lookups": LOOKUP_SLUGS,
        "reference_tables": REFERENCE_SLUGS,
    }


# Router registration order matters: FastAPI matches routes first-come-first-
# served, so every concrete path (including the "/meta/entities" route defined
# above) MUST be registered BEFORE the generic "/{resource}/{item_id}" catch-all
# router — otherwise "GET /meta/entities" is captured by "/{resource}/{item_id}"
# and fails with 422 (trying to parse "entities" as an int item_id).
app.include_router(special.router, prefix=settings.api_prefix)
app.include_router(ansible.router, prefix=settings.api_prefix)
app.include_router(generic.router, prefix=settings.api_prefix)
