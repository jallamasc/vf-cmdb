"""Phase 6 Task 35 — Brave Search API client (Requirement 13.3).

Wraps Brave's documented Web Search endpoint
(``GET https://api.search.brave.com/res/v1/web/search``, authenticated via
an ``X-Subscription-Token`` header — see
https://api.search.brave.com and the official `brave/brave-search-skills`
repo's web-search skill doc for the canonical shape) as the
Hardware_Spec_Lookup's FALLBACK source (Task 36) when Icecat
(`icecat_client.py`) has no or incomplete data for a brand+model.

Deliberately returns only links + snippets (title/url/description) — never
attempts to parse a "spec value" out of search result text. Requirement
13.3 is explicit that a Brave Search result is shown to the operator as-is
for them to read and decide from, unlike Icecat's structured specs (which
are still just PROPOSED values needing confirmation, not auto-saved
either).
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import httpx

from app.config import settings


class BraveSearchNotConfigured(RuntimeError):
    """Raised when BRAVE_SEARCH_API_KEY isn't set. This app runs fine
    without Brave Search configured — the Hardware_Spec_Lookup flow simply
    has no fallback when Icecat comes up empty."""


class BraveSearchFailed(RuntimeError):
    """Raised when Brave Search responds with an error status (unreachable,
    bad/expired key, rate-limited, etc.)."""


@dataclass
class BraveSearchResult:
    title: str
    url: str
    description: Optional[str] = None

    def as_dict(self) -> dict[str, Optional[str]]:
        return {"title": self.title, "url": self.url, "description": self.description}


class BraveSearchClient:
    """Thin async wrapper around Brave's Web Search API.

    A pre-built `httpx.AsyncClient` can be injected via `http_client=`
    (bypassing real config/network entirely) — this is how tests exercise
    this wrapper against a mocked transport instead of a live Brave Search
    subscription (Req 35.2's "pytest against a mocked HTTP client").
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ):
        self.api_key = api_key if api_key is not None else settings.brave_search_api_key
        self.base_url = base_url if base_url is not None else settings.brave_search_base_url
        if not self.api_key:
            raise BraveSearchNotConfigured("BRAVE_SEARCH_API_KEY must be set.")
        self._http = http_client or httpx.AsyncClient(
            headers={"X-Subscription-Token": self.api_key, "Accept": "application/json"},
            timeout=15.0,
        )

    async def search(self, query: str, count: int = 5) -> list[BraveSearchResult]:
        """Links + snippets only (Req 13.3) — never auto-parsed values."""
        try:
            resp = await self._http.get(
                self.base_url, params={"q": query, "count": min(max(count, 1), 20)}
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise BraveSearchFailed(f"Brave Search request failed: {exc}") from exc
        data = resp.json()
        web_results = ((data.get("web") or {}).get("results")) or []
        return [
            BraveSearchResult(
                title=r.get("title", ""), url=r.get("url", ""), description=r.get("description")
            )
            for r in web_results[:count]
        ]


@lru_cache
def get_brave_search_client() -> BraveSearchClient:
    """Shared `BraveSearchClient`, built once per process from `settings`.

    Raises `BraveSearchNotConfigured` (not cached, since `lru_cache` never
    caches an exception — the next call retries construction) if Brave
    Search isn't configured yet.
    """
    return BraveSearchClient()
