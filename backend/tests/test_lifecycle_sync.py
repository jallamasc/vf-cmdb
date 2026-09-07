"""Phase 5 Task 38 (Req 30.1/30.2/30.3) — three-way lifecycle sync:
Generic_Entity record <-> Bitwarden secret <-> Semaphore inventory.

Both external clients are mocked (no real Bitwarden SDK / Semaphore HTTP).
Verifies that create/update/delete of an ansible_managed Generic_Entity
produce the expected Semaphore inventory calls, that delete never deletes
the Bitwarden secret, and that a non-ansible_managed type produces no calls
at all.
"""
from __future__ import annotations

import pytest

from app import bitwarden_client, crud, lifecycle_sync, models, semaphore_client
from app.config import settings


class FakeSecretsClient:
    """No delete method exists on this fake, mirroring the real
    `SecretsClient` (Req 27.2) — lifecycle sync has no way to delete a
    Bitwarden secret even if it wanted to."""

    def __init__(self):
        self.created: list[dict] = []
        self._n = 0

    def create_secret(self, key, value, note=""):
        self._n += 1
        secret = {"id": f"secret-{self._n}", "key": key, "value": value, "note": note}
        self.created.append(secret)
        return dict(secret)

    def get_secret(self, secret_id):
        return {"id": secret_id, "key": "", "value": "pw", "note": ""}


class FakeSemaphoreClient:
    def __init__(self):
        self.calls: list[tuple] = []
        self._n = 0

    async def create_inventory(self, project_id, name, inventory, **extra):
        self.calls.append(("create_inventory", project_id, name, inventory, extra))
        self._n += 1
        return {"id": self._n, "name": name}

    async def update_inventory(self, project_id, inventory_id, **fields):
        self.calls.append(("update_inventory", project_id, inventory_id, fields))

    async def delete_inventory(self, project_id, inventory_id):
        self.calls.append(("delete_inventory", project_id, inventory_id))


@pytest.fixture
def fake_clients(monkeypatch):
    secrets = FakeSecretsClient()
    semaphore = FakeSemaphoreClient()
    monkeypatch.setattr(bitwarden_client, "get_secrets_client", lambda: secrets)
    monkeypatch.setattr(bitwarden_client, "generate_password", lambda length=24: "pw")
    monkeypatch.setattr(semaphore_client, "get_semaphore_client", lambda: semaphore)
    monkeypatch.setattr(settings, "semaphore_project_id", 7)
    return secrets, semaphore


async def _make_entity_type(session, slug="widget", capabilities=None):
    return await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": slug, "label": slug.title(), "capabilities": capabilities or []},
    )


async def test_create_upserts_a_semaphore_inventory_for_ansible_managed(session, fake_clients):
    _secrets, semaphore = fake_clients
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert row.semaphore_host_id == "1"
    create_calls = [c for c in semaphore.calls if c[0] == "create_inventory"]
    assert len(create_calls) == 1
    assert create_calls[0][1] == 7  # configured project id
    assert create_calls[0][2] == f"vf-cmdb generic-entities #{row.id}"


async def test_no_semaphore_calls_for_a_non_ansible_managed_type(session, fake_clients):
    _secrets, semaphore = fake_clients
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert row.semaphore_host_id is None
    assert semaphore.calls == []


async def test_update_updates_the_existing_inventory_not_a_new_one(session, fake_clients):
    _secrets, semaphore = fake_clients
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    semaphore.calls.clear()
    await crud.update_item(
        session, models.GenericEntity, row.id, {"attributes": {"note": "x"}}
    )
    assert [c[0] for c in semaphore.calls] == ["update_inventory"]
    assert semaphore.calls[0][1] == 7
    assert semaphore.calls[0][2] == 1  # same inventory id from create


async def test_delete_removes_the_inventory_and_never_deletes_the_secret(session, fake_clients):
    secrets, semaphore = fake_clients
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert row.bw_secret_id is not None  # credential was provisioned on create
    secret_id_before_delete = row.bw_secret_id
    semaphore.calls.clear()
    await crud.delete_item(session, models.GenericEntity, row.id)
    assert [c[0] for c in semaphore.calls] == ["delete_inventory"]
    assert semaphore.calls[0] == ("delete_inventory", 7, 1)
    # Req 30.2 — the Bitwarden secret itself is never touched: the fake has
    # no delete method at all (mirrors the real SecretsClient's Req 27.2
    # no-delete guarantee), and the secret it created is still right there.
    assert secrets.created == [
        {"id": secret_id_before_delete, "key": f"generic-entities-{row.id}-admin", "value": "pw", "note": f"vf-cmdb generic-entities #{row.id} default admin credential"}
    ]


async def test_delete_of_a_non_ansible_managed_row_produces_no_semaphore_call(session, fake_clients):
    _secrets, semaphore = fake_clients
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    await crud.delete_item(session, models.GenericEntity, row.id)
    assert semaphore.calls == []


async def test_sync_noop_when_semaphore_project_not_configured(session, monkeypatch):
    semaphore = FakeSemaphoreClient()
    monkeypatch.setattr(semaphore_client, "get_semaphore_client", lambda: semaphore)
    monkeypatch.setattr(settings, "semaphore_project_id", 0)  # not configured
    # Bitwarden also unconfigured so create still succeeds without a credential.
    def _raise():
        raise bitwarden_client.BitwardenNotConfigured("x")

    monkeypatch.setattr(bitwarden_client, "get_secrets_client", _raise)
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    assert row.semaphore_host_id is None
    assert semaphore.calls == []


async def test_management_ip_flows_into_the_inventory_content(session, fake_clients):
    _secrets, semaphore = fake_clients
    et = await _make_entity_type(session, capabilities=["ansible_managed"])
    ip = await crud.create_item(
        session, models.IpAssignment, {"ipv4_address": "10.5.5.5", "status": "active"}
    )
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": et.id, "attributes": {}, "management_ip_id": ip.id},
    )
    create_call = next(c for c in semaphore.calls if c[0] == "create_inventory")
    inventory_content = create_call[3]
    assert "10.5.5.5" in inventory_content
    assert row.bw_secret_id in inventory_content  # secret id referenced, not the value
