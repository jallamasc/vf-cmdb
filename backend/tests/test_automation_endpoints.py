"""Phase 5 Task 39 (Req 31.1/31.2/31.3) — Automation_Tab proxy endpoints,
tested against a mocked Semaphore client (never a real Semaphore instance).

Same pattern as test_generic_entity_credential.py: ASGI-driven endpoint
tests (httpx.ASGITransport) layered on top of the `session` fixture.
"""
from __future__ import annotations

import httpx
import pytest

from app import crud, models, semaphore_client
from app.config import settings
from app.main import app


class FakeSemaphoreClient:
    def __init__(self):
        self.launch_calls: list[tuple] = []

    async def list_templates(self, project_id):
        return [{"id": 1, "name": "ping"}, {"id": 2, "name": "deploy"}]

    async def launch_task(self, project_id, template_id, **extra):
        self.launch_calls.append((project_id, template_id, extra))
        return {"id": 42, "template_id": template_id, "status": "waiting"}

    async def get_task(self, project_id, task_id):
        return {"id": task_id, "status": "running"}

    async def get_task_output(self, project_id, task_id):
        return [{"task_id": task_id, "time": "now", "output": "hello"}]


async def _make_entity_type(session, slug="widget", capabilities=None):
    return await crud.create_item(
        session,
        models.EntityTypeDef,
        {"slug": slug, "label": slug.title(), "capabilities": capabilities or []},
    )


@pytest.fixture
def fake_semaphore(monkeypatch):
    fake = FakeSemaphoreClient()
    monkeypatch.setattr(semaphore_client, "get_semaphore_client", lambda: fake)
    monkeypatch.setattr(settings, "semaphore_project_id", 7)
    monkeypatch.setattr(settings, "semaphore_url", "http://semaphore.test")
    monkeypatch.setattr(settings, "semaphore_api_token", "tok")
    return fake


async def _client():
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def test_status_reflects_configuration_and_linked_ids(session, fake_semaphore):
    # capabilities=[] deliberately — this test sets semaphore_host_id
    # directly and must not trigger the real lifecycle_sync hook (which
    # would call methods this file's minimal FakeSemaphoreClient lacks).
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": et.id, "attributes": {}, "semaphore_host_id": "9"},
    )
    async with await _client() as client:
        r = await client.get(f"/api/v1/automation/generic-entities/{row.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["inventory_id"] == 9
    assert body["configured"] is True
    assert body["semaphore_url"] == "http://semaphore.test"
    assert body["project_id"] == 7


async def test_status_reports_not_configured_when_unset(session, monkeypatch):
    monkeypatch.setattr(settings, "semaphore_project_id", 0)
    monkeypatch.setattr(settings, "semaphore_url", "")
    monkeypatch.setattr(settings, "semaphore_api_token", "")
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    async with await _client() as client:
        r = await client.get(f"/api/v1/automation/generic-entities/{row.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["configured"] is False
    assert body["inventory_id"] is None


async def test_status_rejects_an_unsupported_resource(session, fake_semaphore):
    async with await _client() as client:
        r = await client.get("/api/v1/automation/sites/1")
    assert r.status_code == 400


async def test_templates_lists_the_configured_projects_templates(session, fake_semaphore):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    async with await _client() as client:
        r = await client.get(f"/api/v1/automation/generic-entities/{row.id}/templates")
    assert r.status_code == 200
    assert r.json() == [{"id": 1, "name": "ping"}, {"id": 2, "name": "deploy"}]


async def test_launch_requires_a_linked_inventory(session, fake_semaphore):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session, models.GenericEntity, {"entity_type_id": et.id, "attributes": {}}
    )
    async with await _client() as client:
        r = await client.post(
            f"/api/v1/automation/generic-entities/{row.id}/launch", json={"template_id": 1}
        )
    assert r.status_code == 400


async def test_launch_requires_a_template_id(session, fake_semaphore):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": et.id, "attributes": {}, "semaphore_host_id": "9"},
    )
    async with await _client() as client:
        r = await client.post(f"/api/v1/automation/generic-entities/{row.id}/launch", json={})
    assert r.status_code == 422


async def test_launch_targets_this_records_own_inventory(session, fake_semaphore):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": et.id, "attributes": {}, "semaphore_host_id": "9"},
    )
    async with await _client() as client:
        r = await client.post(
            f"/api/v1/automation/generic-entities/{row.id}/launch", json={"template_id": 2}
        )
    assert r.status_code == 200
    assert r.json() == {"id": 42, "template_id": 2, "status": "waiting"}
    assert fake_semaphore.launch_calls == [(7, 2, {"inventory_id": 9})]


async def test_task_status_and_output_proxy_through(session, fake_semaphore):
    et = await _make_entity_type(session, capabilities=[])
    row = await crud.create_item(
        session,
        models.GenericEntity,
        {"entity_type_id": et.id, "attributes": {}, "semaphore_host_id": "9"},
    )
    async with await _client() as client:
        r1 = await client.get(f"/api/v1/automation/generic-entities/{row.id}/tasks/42")
        r2 = await client.get(f"/api/v1/automation/generic-entities/{row.id}/tasks/42/output")
    assert r1.status_code == 200
    assert r1.json() == {"id": 42, "status": "running"}
    assert r2.status_code == 200
    assert r2.json() == [{"task_id": 42, "time": "now", "output": "hello"}]
