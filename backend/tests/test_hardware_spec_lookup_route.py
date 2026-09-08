"""Phase 6 Task 36 (Requirement 13.3) — POST /hardware-specs/lookup:
Icecat first, Brave Search fallback. Direct-router-call pattern, same as
test_stencil_library_routes.py; icecat_client/search_client themselves are
mocked (already covered in isolation by their own test files)."""
from unittest.mock import patch

import pytest

from app import icecat_client, search_client
from app.routers.special import lookup_hardware_specs


@pytest.mark.asyncio
async def test_returns_icecat_result_when_found():
    fake_icecat = icecat_client.IcecatClient.__new__(icecat_client.IcecatClient)
    icecat_result = icecat_client.IcecatLookupResult(
        found=True, title="APC Smart-UPS 3000VA", specs=[icecat_client.IcecatSpec("Capacity", "3000VA")]
    )
    with patch.object(icecat_client, "get_icecat_client", return_value=fake_icecat), \
         patch.object(fake_icecat, "lookup_by_brand_model", return_value=icecat_result):
        body = await lookup_hardware_specs(brand="APC", model="SMT3000RM2U")

    assert body["source"] == "icecat"
    assert body["icecat"]["title"] == "APC Smart-UPS 3000VA"
    assert body["brave_results"] == []


@pytest.mark.asyncio
async def test_falls_back_to_brave_when_icecat_not_found():
    fake_icecat = icecat_client.IcecatClient.__new__(icecat_client.IcecatClient)
    not_found = icecat_client.IcecatLookupResult(found=False)
    fake_brave = search_client.BraveSearchClient.__new__(search_client.BraveSearchClient)
    brave_results = [search_client.BraveSearchResult(title="T", url="U", description="D")]
    with patch.object(icecat_client, "get_icecat_client", return_value=fake_icecat), \
         patch.object(fake_icecat, "lookup_by_brand_model", return_value=not_found), \
         patch.object(search_client, "get_brave_search_client", return_value=fake_brave), \
         patch.object(fake_brave, "search", return_value=brave_results):
        body = await lookup_hardware_specs(brand="Acme", model="Unknown123")

    assert body["source"] == "brave"
    assert body["icecat"] is None
    assert body["brave_results"] == [{"title": "T", "url": "U", "description": "D"}]


@pytest.mark.asyncio
async def test_falls_back_to_brave_when_icecat_not_configured():
    fake_brave = search_client.BraveSearchClient.__new__(search_client.BraveSearchClient)
    brave_results = [search_client.BraveSearchResult(title="T", url="U")]
    with patch.object(icecat_client, "get_icecat_client", side_effect=icecat_client.IcecatNotConfigured()), \
         patch.object(search_client, "get_brave_search_client", return_value=fake_brave), \
         patch.object(fake_brave, "search", return_value=brave_results):
        body = await lookup_hardware_specs(brand="Acme", model="X1")

    assert body["source"] == "brave"


@pytest.mark.asyncio
async def test_falls_back_to_brave_when_icecat_lookup_fails():
    fake_icecat = icecat_client.IcecatClient.__new__(icecat_client.IcecatClient)
    fake_brave = search_client.BraveSearchClient.__new__(search_client.BraveSearchClient)
    brave_results = [search_client.BraveSearchResult(title="T", url="U")]
    with patch.object(icecat_client, "get_icecat_client", return_value=fake_icecat), \
         patch.object(
             fake_icecat, "lookup_by_brand_model",
             side_effect=icecat_client.IcecatLookupFailed("unreachable"),
         ), \
         patch.object(search_client, "get_brave_search_client", return_value=fake_brave), \
         patch.object(fake_brave, "search", return_value=brave_results):
        body = await lookup_hardware_specs(brand="Acme", model="X1")

    assert body["source"] == "brave"


@pytest.mark.asyncio
async def test_returns_none_when_neither_source_is_configured():
    with patch.object(icecat_client, "get_icecat_client", side_effect=icecat_client.IcecatNotConfigured()), \
         patch.object(search_client, "get_brave_search_client", side_effect=search_client.BraveSearchNotConfigured()):
        body = await lookup_hardware_specs(brand="Acme", model="X1")

    assert body == {"source": "none", "icecat": None, "brave_results": []}


@pytest.mark.asyncio
async def test_returns_none_when_brave_search_itself_fails():
    fake_brave = search_client.BraveSearchClient.__new__(search_client.BraveSearchClient)
    with patch.object(icecat_client, "get_icecat_client", side_effect=icecat_client.IcecatNotConfigured()), \
         patch.object(search_client, "get_brave_search_client", return_value=fake_brave), \
         patch.object(fake_brave, "search", side_effect=search_client.BraveSearchFailed("rate limited")):
        body = await lookup_hardware_specs(brand="Acme", model="X1")

    assert body == {"source": "none", "icecat": None, "brave_results": []}


@pytest.mark.asyncio
async def test_returns_none_when_brave_finds_nothing():
    fake_brave = search_client.BraveSearchClient.__new__(search_client.BraveSearchClient)
    with patch.object(icecat_client, "get_icecat_client", side_effect=icecat_client.IcecatNotConfigured()), \
         patch.object(search_client, "get_brave_search_client", return_value=fake_brave), \
         patch.object(fake_brave, "search", return_value=[]):
        body = await lookup_hardware_specs(brand="Acme", model="X1")

    assert body["source"] == "none"
    assert body["brave_results"] == []
