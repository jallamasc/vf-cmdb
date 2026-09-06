"""Phase 5 Task 5 — Brave/strict-privacy-browser compatibility audit (Req 4).

This app has no cookie/session auth anywhere, so `allow_credentials=True`
combined with the wildcard `allow_origins=["*"]` default was an invalid CORS
combination per the Fetch spec: Starlette's CORSMiddleware only echoes back
the specific request Origin (instead of the literal `*`) when the request
carries a Cookie header, so a plain credentialed cross-origin request with no
cookie got both `Access-Control-Allow-Origin: *` and
`Access-Control-Allow-Credentials: true` in the same response — a combination
a strict browser is entitled to reject outright. These tests hit the real
ASGI app (via httpx's ASGITransport, no separate server needed) to assert the
actual response headers rather than trusting the middleware config in
isolation.
"""
from __future__ import annotations

import httpx

from app.main import app


async def _get(path: str, origin: str = "http://example.com") -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path, headers={"Origin": origin})


async def test_health_never_sends_wildcard_origin_with_credentials():
    resp = await _get("/health")
    assert resp.headers.get("access-control-allow-credentials") is None


async def test_cors_allows_any_origin_without_credentials():
    resp = await _get("/health", origin="http://some-other-host:5173")
    # Still open to any origin (unauthenticated read-only-friendly API)...
    assert resp.headers.get("access-control-allow-origin") == "*"
    # ...but never paired with a credentials flag, which is the actual
    # invalid-per-spec combination a strict browser can refuse to honor.
    assert resp.headers.get("access-control-allow-credentials") is None
