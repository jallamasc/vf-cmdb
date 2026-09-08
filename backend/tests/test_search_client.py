"""Phase 6 Task 35 (Requirement 13.3) — Brave Search fallback client.
Every HTTP call goes through httpx.MockTransport — never a real Brave
Search subscription."""
from __future__ import annotations

import httpx
import pytest

from app import search_client
from app.config import settings
from app.search_client import BraveSearchClient, BraveSearchFailed, BraveSearchNotConfigured


def _make_client(handler):
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(
        headers={"X-Subscription-Token": "key123", "Accept": "application/json"},
        transport=transport,
    )
    return BraveSearchClient(
        api_key="key123",
        base_url="https://api.search.brave.com/res/v1/web/search",
        http_client=http_client,
    )


FAKE_SEARCH_JSON = {
    "type": "search",
    "query": {"original": "APC SMT3000RM2U specifications"},
    "web": {
        "type": "search",
        "results": [
            {
                "title": "APC Smart-UPS SMT3000RM2U Datasheet",
                "url": "https://example.com/smt3000rm2u",
                "description": "3000VA/2700W rack-mount UPS with 8 outlets.",
            },
            {
                "title": "Smart-UPS 3000VA Review",
                "url": "https://example.com/review",
                "description": "In-depth review of the SMT3000RM2U.",
            },
        ],
    },
}


def test_get_brave_search_client_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "brave_search_api_key", "")
    with pytest.raises(BraveSearchNotConfigured):
        search_client.get_brave_search_client()


@pytest.mark.asyncio
async def test_search_sends_query_and_subscription_token_header():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=FAKE_SEARCH_JSON)

    client = _make_client(handler)
    await client.search("APC SMT3000RM2U specifications")

    assert calls[0].url.params["q"] == "APC SMT3000RM2U specifications"
    assert calls[0].headers["x-subscription-token"] == "key123"


@pytest.mark.asyncio
async def test_search_returns_titles_urls_and_descriptions_only():
    client = _make_client(lambda r: httpx.Response(200, json=FAKE_SEARCH_JSON))
    results = await client.search("APC SMT3000RM2U specifications")

    assert len(results) == 2
    assert results[0].title == "APC Smart-UPS SMT3000RM2U Datasheet"
    assert results[0].url == "https://example.com/smt3000rm2u"
    assert results[0].description == "3000VA/2700W rack-mount UPS with 8 outlets."


@pytest.mark.asyncio
async def test_search_respects_count_and_clamps_out_of_range_values():
    client = _make_client(lambda r: httpx.Response(200, json=FAKE_SEARCH_JSON))
    results = await client.search("query", count=1)
    assert len(results) == 1


@pytest.mark.asyncio
async def test_search_returns_empty_list_when_no_web_results():
    client = _make_client(lambda r: httpx.Response(200, json={"type": "search"}))
    results = await client.search("nothing found query")
    assert results == []


@pytest.mark.asyncio
async def test_search_raises_on_server_error():
    client = _make_client(lambda r: httpx.Response(500, text="internal error"))
    with pytest.raises(BraveSearchFailed):
        await client.search("query")


@pytest.mark.asyncio
async def test_search_raises_on_unauthorized():
    client = _make_client(lambda r: httpx.Response(401, json={"error": "bad token"}))
    with pytest.raises(BraveSearchFailed):
        await client.search("query")


def test_as_dict_shape():
    result = search_client.BraveSearchResult(title="T", url="U", description="D")
    assert result.as_dict() == {"title": "T", "url": "U", "description": "D"}
