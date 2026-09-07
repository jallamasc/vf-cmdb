"""Phase 5 Task 34 (Req 28.1/28.2/28.3) — default admin credential per
Generic_Entity, provisioned via the (mocked) Bitwarden Secrets_Client.

Mirrors `test_photos.py`'s pattern: unit-level tests exercise
`crud.create_item`/`crud._provision_credential` directly against the
`session` fixture; two ASGI-driven tests (httpx.ASGITransport, same pattern
as `test_cors_headers.py`) drive the real `/credentials/...` endpoints.
Nothing here ever talks to the real Bitwarden API — `FakeSecretsClient`
stands in for `bitwarden_client.SecretsClient` entirely.
"""
from __future__ import annotations

import httpx
import pytest

from app import bitwarden_client, crud, models
from app.config import settings
from app.main import app


class FakeSecretsClient:
    """Stands in for `bitwarden_client.SecretsClient` — no real Bitwarden
    API/SDK involved at all."""

    def __init__(self):
        self.created: list[dict] = []
        self.regenerated: list[tuple[str, str]] = []
        self._store: dict[str, dict] = {}
        self._next_id = 1

    def create_secret(self, key: str, value: str, note: str = "") -> dict:
        secret_id = f"secret-{self._next_id}"
        self._next_id += 1
        secret = {"id": secret_id, "key": key, "value": value, "note": note}
        self._store[secret_id] = secret
        self.created.append(dict(secret))
        return dict(secret)

    def get_secret(self, secret_id: str) -> dict:
        return dict(self._store[secret_id])

    def regenerate_secret(self, secret_id: str, new_value: str) -> dict:
        self.regenerated.append((secret_id, new_value))
        secret = self._store[secret_id]
        secret["value"] = new_value
        return dict(secret)


async def _make_entity_type(session, slug="widget", capabilities=None):
    return await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": slug, "label": slug.title(), "capabilities": capabilities or []},
    )


@pytest.fixture
def fake_secrets(monkeypatch):
    fake = FakeSecretsClient()
    monkeypatch.setattr(bitwarden_client, "get_secrets_client", lambda: fake)
    monkeypatch.setattr(bitwarden_client, "generate_password", lambda length=24: "generated-pw-1")
    # This file only exercises the Bitwarden credential hook — force
    # Semaphore "not configured" (regardless of whatever a real backend/.env
    # on this machine sets it to for live dev testing) so `crud.create_item`
    # creating an ansible_managed record never makes a real Semaphore
    # network call here; that side is covered by test_lifecycle_sync.py.
    monkeypatch.setattr(settings, "semaphore_project_id", 0)
    return fake


async def test_create_hook_provisions_a_credential_for_ansible_managed(session, fake_secrets):
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert row.admin_username == "admin"
    assert row.bw_secret_id == "secret-1"
    assert len(fake_secrets.created) == 1
    created = fake_secrets.created[0]
    assert created["value"] == "generated-pw-1"
    assert created["key"] == f"generic-entities-{row.id}-admin"


async def test_create_hook_does_nothing_without_the_capability(session, fake_secrets):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert row.admin_username is None
    assert row.bw_secret_id is None
    assert fake_secrets.created == []


async def test_create_hook_skips_gracefully_when_bitwarden_not_configured(session, monkeypatch):
    def _raise():
        raise bitwarden_client.BitwardenNotConfigured("not configured")

    monkeypatch.setattr(bitwarden_client, "get_secrets_client", _raise)
    monkeypatch.setattr(settings, "semaphore_project_id", 0)
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    # Creation still succeeds — an unconfigured integration must not block
    # the record from being created at all.
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert row.admin_username is None
    assert row.bw_secret_id is None


async def test_provision_credential_never_reprovisions_an_existing_one(session, fake_secrets):
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert len(fake_secrets.created) == 1
    # Calling the hook again directly (simulating some other code path) must
    # not create a second secret — bw_secret_id is already set.
    await crud._provision_credential(session, row)
    assert len(fake_secrets.created) == 1


async def test_reveal_endpoint_returns_username_and_password(session, fake_secrets):
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get(f"/api/v1/credentials/generic-entities/{row.id}/reveal")
    assert r.status_code == 200
    body = r.json()
    assert body == {"username": "admin", "password": "generated-pw-1"}


async def test_reveal_endpoint_404_when_no_credential_provisioned(session, fake_secrets):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get(f"/api/v1/credentials/generic-entities/{row.id}/reveal")
    assert r.status_code == 404


async def test_regenerate_endpoint_rotates_value_keeps_same_secret_id(
    session, fake_secrets, monkeypatch
):
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    original_secret_id = row.bw_secret_id
    monkeypatch.setattr(
        bitwarden_client, "generate_password", lambda length=24: "regenerated-pw-2"
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post(f"/api/v1/credentials/generic-entities/{row.id}/regenerate")
    assert r.status_code == 200
    body = r.json()
    assert body == {"username": "admin", "password": "regenerated-pw-2"}
    assert fake_secrets.regenerated == [(original_secret_id, "regenerated-pw-2")]
    # The row's own bw_secret_id column never changes — same secret, new value.
    await session.refresh(row)
    assert row.bw_secret_id == original_secret_id


async def test_credential_routes_reject_an_unsupported_resource(session, fake_secrets):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/v1/credentials/sites/1/reveal")
    assert r.status_code == 400
