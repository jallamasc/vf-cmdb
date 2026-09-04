"""FastAPI application entrypoint for the Virtualfactor IT CMDB."""
from __future__ import annotations

import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .config import settings
from .crud import humanize_field
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


def _friendly_integrity_error(message: str) -> tuple[int, str]:
    """Translate a raw Postgres constraint error into an operator-friendly one.

    Returns ``(status_code, detail)``. Anything unrecognised keeps the original
    (trimmed) message so nothing is silently swallowed.
    """
    # null value in column "site_id" of relation "vlans" violates not-null...
    not_null = re.search(
        r'null value in column "([^"]+)".*?violates not-null constraint',
        message,
        re.S,
    )
    if not_null:
        field = humanize_field(not_null.group(1))
        return 422, (
            f"'{field}' is required — pick a value for it before saving this row."
        )

    # Key (vlan_id)=(10) already exists.
    dup = re.search(r"Key \(([^)]+)\)=\(([^)]*)\) already exists", message)
    if dup:
        fields = " + ".join(
            f"'{humanize_field(f.strip())}'" for f in dup.group(1).split(",")
        )
        return 409, (
            f"{fields} value '{dup.group(2)}' is already in use — it must be unique."
        )
    if "duplicate key value violates unique constraint" in message:
        return 409, "That value is already in use — it must be unique."

    # insert or update on table "vlans" violates foreign key constraint ...
    # DETAIL:  Key (site_id)=(99) is not present in table "sites".
    if "violates foreign key constraint" in message:
        columns: str | None = None
        detail = re.search(r"Key \(([^)]+)\)=\([^)]*\) is not present", message)
        if detail:
            columns = detail.group(1)
        else:
            # Fall back to the constraint name: "vlans_site_id_fkey" -> site_id.
            named = re.search(r'foreign key constraint "(\w+)_fkey"', message)
            if named:
                columns = named.group(1)
                table = re.search(r'on table "(\w+)"', message)
                if table and columns.startswith(f"{table.group(1)}_"):
                    columns = columns[len(table.group(1)) + 1 :]
        if columns:
            fields = " + ".join(
                f"'{humanize_field(f.strip())}'" for f in columns.split(",")
            )
            return 409, (
                f"{fields} points at a record that no longer exists — "
                "pick an existing value."
            )
        return 409, (
            "A referenced record no longer exists — refresh and pick an existing value."
        )

    check = re.search(r'violates check constraint "([^"]+)"', message)
    if check:
        name = check.group(1)
        # The abbreviation/code charset rule is the one operators hit most, so
        # spell out what it expects; other rules only get their name.
        if re.search(r"abbrev|code|charset|slug", name, re.I):
            return 422, (
                f"Value rejected by rule '{name}' — codes may only contain "
                "letters, digits and single hyphens."
            )
        return 422, (
            f"Value rejected by database rule '{name}' — check the values on this row."
        )

    return 409, f"Database rejected the change: {message.strip()[:300]}"


@app.exception_handler(IntegrityError)
async def integrity_error_handler(_: Request, exc: IntegrityError) -> JSONResponse:
    """Return a readable ``detail`` for constraint violations (BUG-C).

    The React grid shows ``detail`` directly, so a raw psycopg traceback string
    here becomes an unusable error message in the UI.
    """
    raw = str(getattr(exc, "orig", None) or exc)
    status_code, detail = _friendly_integrity_error(raw)
    return JSONResponse(status_code=status_code, content={"detail": detail})


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
