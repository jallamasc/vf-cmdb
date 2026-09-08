"""Phase 6 Task 34 — Icecat Open Catalog client (Requirement 13.3).

Wraps Icecat's documented Open Catalog Interface endpoint
(``https://data.icecat.biz/xml_s3/xml_server3.cgi``, HTTP Basic Auth,
``lang``/``prod_id``/``vendor``/``output`` query params — see
https://iceclog.com/manuals-csv-interface/ for the canonical URL shape)
for a brand+model ("vendor"/"prod_id" in Icecat's own terminology) product
lookup, requesting JSON output.

Unlike `bitwarden_client.py` (a native FFI SDK, effectively local/
synchronous), this is real network I/O against a remote service, so every
call here is `async` — mirrors `semaphore_client.py`'s exact shape for that
reason (this app is built on asyncio throughout).

The Hardware_Spec_Lookup flow (Task 36) queries this FIRST and falls back
to Brave Search (`search_client.py`, Task 35) when this returns no match or
an incomplete result — never auto-saves anything; every proposed value
still needs operator confirmation (Req 13.3).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Optional

import httpx

from app.config import settings


class IcecatNotConfigured(RuntimeError):
    """Raised when ICECAT_USERNAME/ICECAT_PASSWORD aren't both set. This
    app runs fine without Icecat configured — the Hardware_Spec_Lookup flow
    just falls straight through to Brave Search."""


class IcecatLookupFailed(RuntimeError):
    """Raised when Icecat responds but with an error status (a genuinely
    unreachable service, not a "no product found" result — that's a normal,
    non-exceptional `IcecatLookupResult(found=False)`)."""


@dataclass
class IcecatSpec:
    name: str
    value: str


@dataclass
class IcecatLookupResult:
    found: bool
    title: Optional[str] = None
    specs: list[IcecatSpec] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "found": self.found,
            "title": self.title,
            "specs": [{"name": s.name, "value": s.value} for s in self.specs],
        }


def _parse_response(data: dict) -> IcecatLookupResult:
    """Icecat's documented JSON shape: a top-level ``data`` object holding
    ``GeneralInfo`` (title/name) and ``FeaturesGroups`` (a list of
    ``{Features: [{Feature: {Name: {Value}, Presentation_Value}}]}``
    groups) — this module never assumes more structure than it actually
    reads, and any missing/renamed key degrades to an empty result rather
    than raising, since a lookup that finds nothing useful is a normal
    outcome the caller (Task 36's endpoint) falls through to Brave Search
    for.
    """
    root = data.get("data")
    if not isinstance(root, dict):
        return IcecatLookupResult(found=False)

    general = root.get("GeneralInfo") or {}
    title = general.get("Title") or general.get("ProductName") or None

    specs: list[IcecatSpec] = []
    for group in root.get("FeaturesGroups") or []:
        for feature in group.get("Features") or []:
            feat = feature.get("Feature") or {}
            name = ((feat.get("Name") or {}).get("Value")) or feat.get("LocalName")
            value = feature.get("Presentation_Value") or feature.get("Value")
            if name and value:
                specs.append(IcecatSpec(name=str(name), value=str(value)))

    return IcecatLookupResult(found=bool(title or specs), title=title, specs=specs)


class IcecatClient:
    """Thin async wrapper around Icecat's Open Catalog Interface.

    A pre-built `httpx.AsyncClient` can be injected via `http_client=`
    (bypassing real config/network entirely) — this is how tests exercise
    this wrapper against a mocked transport instead of a live Icecat
    account (Req 34.2's "pytest against a mocked HTTP client").
    """

    def __init__(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        base_url: Optional[str] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ):
        self.username = username if username is not None else settings.icecat_username
        self.password = password if password is not None else settings.icecat_password
        self.base_url = base_url if base_url is not None else settings.icecat_base_url
        if not (self.username and self.password):
            raise IcecatNotConfigured(
                "ICECAT_USERNAME and ICECAT_PASSWORD must both be set."
            )
        self._http = http_client or httpx.AsyncClient(
            auth=(self.username, self.password), timeout=15.0
        )

    async def lookup_by_brand_model(
        self, brand: str, model: str, lang: str = "EN"
    ) -> IcecatLookupResult:
        """Requirement 13.3 — the brand+model lookup. Returns
        ``IcecatLookupResult(found=False)`` for "no such product" (a normal
        outcome); raises `IcecatLookupFailed` only when Icecat itself
        errors (unreachable, bad credentials, etc.)."""
        try:
            resp = await self._http.get(
                self.base_url,
                params={"lang": lang, "vendor": brand, "prod_id": model, "output": "json"},
            )
        except httpx.HTTPError as exc:
            raise IcecatLookupFailed(f"Could not reach Icecat: {exc}") from exc
        if resp.status_code == 404:
            return IcecatLookupResult(found=False)
        try:
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise IcecatLookupFailed(f"Icecat returned {resp.status_code}: {exc}") from exc
        try:
            data = resp.json()
        except ValueError as exc:
            raise IcecatLookupFailed(f"Icecat returned a non-JSON response: {exc}") from exc
        return _parse_response(data)


@lru_cache
def get_icecat_client() -> IcecatClient:
    """Shared `IcecatClient`, built once per process from `settings`.

    Raises `IcecatNotConfigured` (not cached, since `lru_cache` never
    caches an exception — the next call retries construction) if Icecat
    isn't configured yet.
    """
    return IcecatClient()
