"""Phase 6 Task 34 (Requirement 13.3) — Icecat Open Catalog client. Every
HTTP call goes through httpx.MockTransport — never a real Icecat account
(mirrors test_semaphore_client.py's own dependency-injection pattern)."""
from __future__ import annotations

import httpx
import pytest

from app import icecat_client
from app.config import settings
from app.icecat_client import IcecatClient, IcecatLookupFailed, IcecatNotConfigured


def _make_client(handler):
    transport = httpx.MockTransport(handler)
    return IcecatClient(
        username="user", password="pass", base_url="https://data.icecat.biz/xml_s3/xml_server3.cgi",
        http_client=httpx.AsyncClient(transport=transport),
    )


FAKE_PRODUCT_JSON = {
    "data": {
        "GeneralInfo": {"Title": "APC Smart-UPS 3000VA"},
        "FeaturesGroups": [
            {
                "Features": [
                    {
                        "Feature": {"Name": {"Value": "Output power capacity"}},
                        "Presentation_Value": "3000 VA",
                    },
                    {
                        "Feature": {"Name": {"Value": "Number of AC outlets"}},
                        "Presentation_Value": "8",
                    },
                    # Malformed entry (no name) — must be skipped, not crash.
                    {"Feature": {}, "Presentation_Value": "ignored"},
                ]
            }
        ],
    }
}


def test_get_icecat_client_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "icecat_username", "")
    monkeypatch.setattr(settings, "icecat_password", "")
    with pytest.raises(IcecatNotConfigured):
        icecat_client.get_icecat_client()


@pytest.mark.asyncio
async def test_lookup_by_brand_model_sends_expected_query_params():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=FAKE_PRODUCT_JSON)

    client = _make_client(handler)
    await client.lookup_by_brand_model("APC", "SMT3000RM2U")

    assert calls[0].url.params["vendor"] == "APC"
    assert calls[0].url.params["prod_id"] == "SMT3000RM2U"
    assert calls[0].url.params["lang"] == "EN"
    assert calls[0].url.params["output"] == "json"


@pytest.mark.asyncio
async def test_lookup_by_brand_model_parses_title_and_specs():
    client = _make_client(lambda r: httpx.Response(200, json=FAKE_PRODUCT_JSON))
    result = await client.lookup_by_brand_model("APC", "SMT3000RM2U")

    assert result.found is True
    assert result.title == "APC Smart-UPS 3000VA"
    names = {s.name for s in result.specs}
    assert "Output power capacity" in names
    assert "Number of AC outlets" in names
    # The malformed (nameless) feature is skipped, not raised.
    assert len(result.specs) == 2


@pytest.mark.asyncio
async def test_lookup_by_brand_model_returns_not_found_on_404():
    client = _make_client(lambda r: httpx.Response(404, json={"detail": "not found"}))
    result = await client.lookup_by_brand_model("Nope", "Nope")
    assert result.found is False
    assert result.specs == []


@pytest.mark.asyncio
async def test_lookup_by_brand_model_returns_not_found_for_empty_data():
    client = _make_client(lambda r: httpx.Response(200, json={"data": {}}))
    result = await client.lookup_by_brand_model("APC", "SMT3000RM2U")
    assert result.found is False


@pytest.mark.asyncio
async def test_lookup_by_brand_model_raises_on_server_error():
    client = _make_client(lambda r: httpx.Response(500, text="internal error"))
    with pytest.raises(IcecatLookupFailed):
        await client.lookup_by_brand_model("APC", "SMT3000RM2U")


@pytest.mark.asyncio
async def test_lookup_by_brand_model_raises_on_non_json_response():
    client = _make_client(lambda r: httpx.Response(200, text="<xml>not json</xml>"))
    with pytest.raises(IcecatLookupFailed):
        await client.lookup_by_brand_model("APC", "SMT3000RM2U")


def test_as_dict_shape():
    result = icecat_client.IcecatLookupResult(
        found=True, title="X", specs=[icecat_client.IcecatSpec(name="A", value="B")]
    )
    assert result.as_dict() == {"found": True, "title": "X", "specs": [{"name": "A", "value": "B"}]}
