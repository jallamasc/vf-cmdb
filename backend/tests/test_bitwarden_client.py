"""Phase 5 Task 33 (Req 27.1/27.2) — SecretsClient, tested against a mocked
`bitwarden_sdk` client (never the real Bitwarden API).
"""
from __future__ import annotations

import pytest

from app import bitwarden_client
from app.bitwarden_client import BitwardenNotConfigured, SecretsClient
from app.config import settings


class FakeSecret:
    def __init__(self, id: str, key: str, value: str, note: str):
        self.id = id
        self.key = key
        self.value = value
        self.note = note


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeSecretsApi:
    """Stands in for `bitwarden_sdk.BitwardenClient().secrets()`."""

    def __init__(self):
        self.calls: list[tuple] = []
        self._store: dict[str, FakeSecret] = {}
        self._next_id = 1

    def create(self, organization_id, key, value, note, project_ids):
        self.calls.append(("create", organization_id, key, value, note, project_ids))
        secret = FakeSecret(f"secret-{self._next_id}", key, value, note)
        self._next_id += 1
        self._store[secret.id] = secret
        return FakeResponse(secret)

    def get(self, secret_id):
        self.calls.append(("get", secret_id))
        return FakeResponse(self._store[secret_id])

    def update(self, organization_id, id, key, value, note, project_ids):
        self.calls.append(("update", organization_id, id, key, value, note, project_ids))
        secret = FakeSecret(id, key, value, note)
        self._store[id] = secret
        return FakeResponse(secret)

    def delete(self, ids):  # pragma: no cover - must never be called
        raise AssertionError("SecretsClient must never call delete()")


class FakeSdkClient:
    def __init__(self):
        self._secrets = FakeSecretsApi()

    def secrets(self):
        return self._secrets


def _make_client():
    fake = FakeSdkClient()
    client = SecretsClient(
        organization_id="org-1", access_token="tok", project_id="proj-1", sdk_client=fake
    )
    return client, fake


@pytest.fixture(autouse=True)
def _clear_secrets_client_cache():
    bitwarden_client.get_secrets_client.cache_clear()
    yield
    bitwarden_client.get_secrets_client.cache_clear()


def test_raises_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "bw_organization_id", "")
    monkeypatch.setattr(settings, "bw_access_token", "")
    monkeypatch.setattr(settings, "bw_project_id", "")
    with pytest.raises(BitwardenNotConfigured):
        SecretsClient()


def test_get_secrets_client_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "bw_organization_id", "")
    monkeypatch.setattr(settings, "bw_access_token", "")
    monkeypatch.setattr(settings, "bw_project_id", "")
    with pytest.raises(BitwardenNotConfigured):
        bitwarden_client.get_secrets_client()


def test_create_secret_calls_sdk_and_normalizes_response():
    client, fake = _make_client()
    result = client.create_secret("device-42-admin", "s3cr3t", note="created by vf-cmdb")
    assert result == {
        "id": "secret-1",
        "key": "device-42-admin",
        "value": "s3cr3t",
        "note": "created by vf-cmdb",
    }
    assert fake._secrets.calls[0] == (
        "create",
        "org-1",
        "device-42-admin",
        "s3cr3t",
        "created by vf-cmdb",
        ["proj-1"],
    )


def test_get_secret_returns_normalized_dict():
    client, fake = _make_client()
    client.create_secret("device-42-admin", "s3cr3t")
    result = client.get_secret("secret-1")
    assert result == {
        "id": "secret-1",
        "key": "device-42-admin",
        "value": "s3cr3t",
        "note": "",
    }


def test_regenerate_secret_rotates_value_in_place_preserving_key_and_note():
    client, fake = _make_client()
    client.create_secret("device-42-admin", "old-pw", note="managed by vf-cmdb")
    result = client.regenerate_secret("secret-1", "new-pw")
    assert result == {
        "id": "secret-1",
        "key": "device-42-admin",
        "value": "new-pw",
        "note": "managed by vf-cmdb",
    }
    # Regenerate reads-then-writes the SAME secret id — never deletes it.
    assert [c[0] for c in fake._secrets.calls] == ["create", "get", "update"]
    update_call = fake._secrets.calls[2]
    assert update_call == (
        "update",
        "org-1",
        "secret-1",
        "device-42-admin",
        "new-pw",
        "managed by vf-cmdb",
        ["proj-1"],
    )


def test_regenerate_never_deletes_the_secret():
    """`FakeSecretsApi.delete` raises if ever called — Req 27.2."""
    client, fake = _make_client()
    client.create_secret("device-42-admin", "old-pw")
    client.regenerate_secret("secret-1", "new-pw")
    assert not any(c[0] == "delete" for c in fake._secrets.calls)
