"""Phase 5 Task 37 (Req 29.2) — SemaphoreClient, tested against a mocked
HTTP transport (httpx.MockTransport) — never a real Semaphore instance.
"""
from __future__ import annotations

import json

import httpx
import pytest

from app import semaphore_client
from app.config import settings
from app.semaphore_client import SemaphoreClient, SemaphoreNotConfigured


def _make_client(handler):
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(
        base_url="http://semaphore.test/api",
        headers={"Authorization": "Bearer tok"},
        transport=transport,
    )
    return SemaphoreClient(
        base_url="http://semaphore.test", api_token="tok", http_client=http_client
    )


@pytest.fixture(autouse=True)
def _clear_semaphore_client_cache():
    semaphore_client.get_semaphore_client.cache_clear()
    yield
    semaphore_client.get_semaphore_client.cache_clear()


def test_raises_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "semaphore_url", "")
    monkeypatch.setattr(settings, "semaphore_api_token", "")
    with pytest.raises(SemaphoreNotConfigured):
        SemaphoreClient()


def test_get_semaphore_client_raises_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "semaphore_url", "")
    monkeypatch.setattr(settings, "semaphore_api_token", "")
    with pytest.raises(SemaphoreNotConfigured):
        semaphore_client.get_semaphore_client()


async def test_list_projects_calls_expected_endpoint_with_bearer_auth():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=[{"id": 1, "name": "vf-cmdb"}])

    client = _make_client(handler)
    result = await client.list_projects()
    assert result == [{"id": 1, "name": "vf-cmdb"}]
    assert calls[0].method == "GET"
    assert calls[0].url.path == "/api/projects"
    assert calls[0].headers["authorization"] == "Bearer tok"


async def test_create_project_posts_name():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(201, json={"id": 1, "name": "vf-cmdb"})

    client = _make_client(handler)
    result = await client.create_project("vf-cmdb")
    assert result["id"] == 1
    assert json.loads(calls[0].content) == {"name": "vf-cmdb"}


async def test_create_inventory_merges_extra_fields():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(201, json={"id": 5})

    client = _make_client(handler)
    await client.create_inventory(1, "hosts", "[all]\n", type="static")
    assert calls[0].url.path == "/api/project/1/inventory"
    assert json.loads(calls[0].content) == {
        "project_id": 1,
        "name": "hosts",
        "inventory": "[all]\n",
        "type": "static",
    }


async def test_update_inventory_includes_id_and_project_id():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(204)

    client = _make_client(handler)
    await client.update_inventory(1, 5, name="renamed")
    assert calls[0].method == "PUT"
    assert calls[0].url.path == "/api/project/1/inventory/5"
    assert json.loads(calls[0].content) == {"id": 5, "project_id": 1, "name": "renamed"}


async def test_delete_inventory():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(204)

    client = _make_client(handler)
    await client.delete_inventory(1, 5)
    assert calls[0].method == "DELETE"
    assert calls[0].url.path == "/api/project/1/inventory/5"


async def test_create_environment_defaults_json_env():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(201, json={"id": 1})

    client = _make_client(handler)
    await client.create_environment(1, "default")
    assert json.loads(calls[0].content) == {
        "project_id": 1,
        "name": "default",
        "json": "{}",
        "env": "{}",
    }


async def test_list_templates_and_get_template():
    def handler(request):
        if request.url.path == "/api/project/1/templates":
            return httpx.Response(200, json=[{"id": 3, "name": "ping"}])
        return httpx.Response(200, json={"id": 3, "name": "ping"})

    client = _make_client(handler)
    templates = await client.list_templates(1)
    assert templates == [{"id": 3, "name": "ping"}]
    template = await client.get_template(1, 3)
    assert template["name"] == "ping"


async def test_launch_task_posts_template_id_and_extras():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(201, json={"id": 9, "status": "waiting"})

    client = _make_client(handler)
    result = await client.launch_task(1, 3, debug=True)
    assert result["status"] == "waiting"
    assert calls[0].url.path == "/api/project/1/tasks"
    assert json.loads(calls[0].content) == {"template_id": 3, "debug": True}


async def test_get_task_and_get_task_output():
    def handler(request):
        if request.url.path.endswith("/output"):
            return httpx.Response(200, json=[{"task_id": 9, "output": "hello"}])
        return httpx.Response(200, json={"id": 9, "status": "running"})

    client = _make_client(handler)
    task = await client.get_task(1, 9)
    assert task["status"] == "running"
    output = await client.get_task_output(1, 9)
    assert output == [{"task_id": 9, "output": "hello"}]


async def test_stop_task_posts_force_flag():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(204)

    client = _make_client(handler)
    await client.stop_task(1, 9, force=True)
    assert calls[0].url.path == "/api/project/1/tasks/9/stop"
    assert json.loads(calls[0].content) == {"force": True}


async def test_http_error_status_propagates():
    def handler(request):
        return httpx.Response(404, json={"error": "not found"})

    client = _make_client(handler)
    with pytest.raises(httpx.HTTPStatusError):
        await client.get_task(1, 999)
