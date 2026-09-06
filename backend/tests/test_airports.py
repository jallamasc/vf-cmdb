# Phase 5 Task 30 (Req 25.1/25.2) — country-scoped airport search/lookup.
#
# ``airports.py`` is a pure in-memory module (no DB), so most of this file
# exercises it directly. The two `/naming/airport-*` routes are also plain
# GET endpoints with no DB dependency, so they're driven via the real ASGI
# app (httpx.ASGITransport), the same pattern established in
# test_cors_headers.py/test_photos.py, without needing the `session` fixture.
import httpx

from app import airports
from app.main import app


def test_countries_is_sorted_and_deduplicated():
    result = airports.countries()
    assert result == sorted(set(result))
    assert "Colombia" in result
    assert "United States" in result
    # Multiple Colombian airports share the country — must not repeat.
    assert result.count("Colombia") == 1


def test_search_without_country_is_unscoped():
    matches = airports.search("Medellin")
    assert {m["iata"] for m in matches} == {"MDE", "EOH"}


def test_search_with_country_narrows_to_that_country():
    # "San Jose" exists both in the US and Costa Rica — country scoping must
    # exclude the other one entirely, not just re-rank it.
    matches = airports.search("San Jose", country="Costa Rica")
    assert matches
    assert all(m["country"] == "Costa Rica" for m in matches)
    assert "SJC" not in {m["iata"] for m in matches}


def test_search_with_country_and_no_matches_returns_empty():
    assert airports.search("Bogota", country="Germany") == []


def test_search_country_match_is_case_and_accent_insensitive():
    matches = airports.search("Bogota", country="colombia")
    assert any(m["iata"] == "BOG" for m in matches)


def test_lookup_city_forwards_country_to_search():
    resolved = airports.lookup_city("San Jose", country="Costa Rica")
    assert resolved["iata_code"] == "SJO"
    assert resolved["country"] == "Costa Rica"

    resolved_none = airports.lookup_city("San Jose", country="Germany")
    assert resolved_none["iata_code"] is None


async def test_endpoint_airport_countries_lists_the_catalogue():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/v1/naming/airport-countries")
    assert r.status_code == 200
    body = r.json()
    assert "Colombia" in body["countries"]
    assert body["countries"] == sorted(body["countries"])


async def test_endpoint_airport_code_scopes_matches_to_country():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get(
            "/api/v1/naming/airport-code",
            params={"city": "San Jose", "country": "Costa Rica"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["iata_code"] == "SJO"
    assert all(m["country"] == "Costa Rica" for m in body["matches"])

    r_unscoped = await httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ).get("/api/v1/naming/airport-code", params={"city": "San Jose"})
    assert r_unscoped.status_code == 200
    unscoped_countries = {m["country"] for m in r_unscoped.json()["matches"]}
    assert "Costa Rica" in unscoped_countries and "United States" in unscoped_countries
