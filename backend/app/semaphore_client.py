"""Phase 5 Task 37 — Ansible Semaphore API client wrapper (Requirement 29.2).

Wraps Semaphore's REST API (projects / inventory / environment / templates /
tasks) over a Bearer API token. Config via `SEMAPHORE_URL` /
`SEMAPHORE_API_TOKEN`. Unlike `bitwarden_client.py` (a native FFI SDK,
effectively local/synchronous), this is real network I/O against a remote
service, so every call here is `async` — this app is built on asyncio
throughout (async SQLAlchemy, async FastAPI) and a blocking sync HTTP call
inside an async request handler would stall other concurrent requests for
the round-trip.

Every endpoint path/payload shape below was verified against a real,
freshly-deployed Semaphore instance (not just its OpenAPI spec) before being
written here — see the Phase 5 Task 37 commit message for the exact
create-project/inventory/environment/template/task/output round-trip that
was exercised.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Optional

import httpx

from app.config import settings


class SemaphoreNotConfigured(RuntimeError):
    """Raised when SEMAPHORE_URL/SEMAPHORE_API_TOKEN aren't both set. This
    app runs fine without Semaphore configured — automation features simply
    aren't available until it is."""


class SemaphoreClient:
    """Thin async wrapper around Semaphore's REST API.

    A pre-built `httpx.AsyncClient` can be injected via `http_client=`
    (bypassing real config/network entirely) — this is how tests exercise
    this wrapper against a mocked transport instead of a live Semaphore
    instance (Req 37.2's "pytest against a mocked HTTP client").
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_token: Optional[str] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ):
        self.base_url = (base_url if base_url is not None else settings.semaphore_url).rstrip("/")
        self.api_token = api_token if api_token is not None else settings.semaphore_api_token
        if not (self.base_url and self.api_token):
            raise SemaphoreNotConfigured(
                "SEMAPHORE_URL and SEMAPHORE_API_TOKEN must both be set."
            )
        self._http = http_client or httpx.AsyncClient(
            base_url=f"{self.base_url}/api",
            headers={"Authorization": f"Bearer {self.api_token}"},
            timeout=30.0,
        )

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        resp = await self._http.request(method, path, **kwargs)
        resp.raise_for_status()
        return resp

    # --- Projects ---------------------------------------------------------
    async def list_projects(self) -> list[dict]:
        return (await self._request("GET", "/projects")).json()

    async def create_project(self, name: str, **extra: Any) -> dict:
        return (await self._request("POST", "/projects", json={"name": name, **extra})).json()

    # --- Inventory ----------------------------------------------------------
    async def list_inventory(self, project_id: int) -> list[dict]:
        return (await self._request("GET", f"/project/{project_id}/inventory")).json()

    async def create_inventory(
        self, project_id: int, name: str, inventory: str, **extra: Any
    ) -> dict:
        payload = {"project_id": project_id, "name": name, "inventory": inventory, **extra}
        return (
            await self._request("POST", f"/project/{project_id}/inventory", json=payload)
        ).json()

    async def update_inventory(self, project_id: int, inventory_id: int, **fields: Any) -> None:
        payload = {"id": inventory_id, "project_id": project_id, **fields}
        await self._request(
            "PUT", f"/project/{project_id}/inventory/{inventory_id}", json=payload
        )

    async def delete_inventory(self, project_id: int, inventory_id: int) -> None:
        await self._request("DELETE", f"/project/{project_id}/inventory/{inventory_id}")

    # --- Environments -------------------------------------------------------
    async def list_environments(self, project_id: int) -> list[dict]:
        return (await self._request("GET", f"/project/{project_id}/environment")).json()

    async def create_environment(self, project_id: int, name: str, **extra: Any) -> dict:
        payload = {"project_id": project_id, "name": name, "json": "{}", "env": "{}", **extra}
        return (
            await self._request("POST", f"/project/{project_id}/environment", json=payload)
        ).json()

    # --- Templates ------------------------------------------------------------
    async def list_templates(self, project_id: int) -> list[dict]:
        return (await self._request("GET", f"/project/{project_id}/templates")).json()

    async def get_template(self, project_id: int, template_id: int) -> dict:
        return (
            await self._request("GET", f"/project/{project_id}/templates/{template_id}")
        ).json()

    # --- Tasks (launch a job, poll status/output) ------------------------------
    async def launch_task(self, project_id: int, template_id: int, **extra: Any) -> dict:
        payload = {"template_id": template_id, **extra}
        return (await self._request("POST", f"/project/{project_id}/tasks", json=payload)).json()

    async def get_task(self, project_id: int, task_id: int) -> dict:
        return (await self._request("GET", f"/project/{project_id}/tasks/{task_id}")).json()

    async def get_task_output(self, project_id: int, task_id: int) -> list[dict]:
        return (
            await self._request("GET", f"/project/{project_id}/tasks/{task_id}/output")
        ).json()

    async def stop_task(self, project_id: int, task_id: int, force: bool = False) -> None:
        await self._request(
            "POST", f"/project/{project_id}/tasks/{task_id}/stop", json={"force": force}
        )


@lru_cache
def get_semaphore_client() -> SemaphoreClient:
    """Shared `SemaphoreClient`, built once per process from `settings`.

    Raises `SemaphoreNotConfigured` (not cached, since `lru_cache` never
    caches an exception — the next call retries construction) if Semaphore
    isn't configured yet.
    """
    return SemaphoreClient()
