"""Pytest fixtures for FEAT-6 backend tests.

Tests run against a real PostgreSQL 16 database (the app uses Postgres-only
INET/CIDR/JSONB types), pointed at ``vfcmdb_test`` on the local Podman
container. Configure the connection with the standard POSTGRES_* env vars, e.g.:

    POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_USER=vfcmdb \
    POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb_test .venv/bin/pytest

asyncpg connections are pinned to the event loop that opened them, and
pytest-asyncio (auto mode) uses a fresh loop per test. So instead of the app's
module-level engine we build a NullPool engine *inside each test's loop* and
override ``app.database.get_session`` / ``AsyncSessionLocal`` to use it. This
avoids all "attached to a different loop" errors.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app import database, models  # noqa: F401  (registers all tables)
from app.config import settings

_TABLES = [
    "cables",
    "device_interfaces",
    "power_outlets",
    "power_devices",
    "network_devices",
    "physical_servers",
    "rack_units",
    "racks",
    "rooms",
    "datacenter_floors",
    "datacenters",
    "network_device_types",
    "compute_device_types",
    "storage_device_types",
    "power_device_types",
    "stencil_anchors",
    "sites",
    "regions",
    "change_log",
]


@pytest.fixture(autouse=True)
def _no_real_external_integrations(monkeypatch):
    """Phase 6 — force every external-integration setting back to its
    "unconfigured" default for every test, regardless of what a real
    ``backend/.env`` on this machine sets them to for live dev/browser
    testing (Bitwarden/Semaphore credentials are routinely written there —
    see the Phase 5/6 session history). Without this, a test that creates
    an ``ansible_managed`` record without explicitly mocking
    ``bitwarden_client``/``semaphore_client`` would silently make a REAL
    network call against whatever real Bitwarden org / Semaphore instance
    happens to be configured — slow, flaky, and a real production-adjacent
    credential risk. A test that needs a specific client mocked as
    "configured" still does so itself via its own ``monkeypatch`` fixture,
    which runs after this one and simply overrides these same attributes.
    """
    monkeypatch.setattr(settings, "bw_organization_id", "")
    monkeypatch.setattr(settings, "bw_access_token", "")
    monkeypatch.setattr(settings, "bw_project_id", "")
    monkeypatch.setattr(settings, "semaphore_url", "")
    monkeypatch.setattr(settings, "semaphore_api_token", "")
    monkeypatch.setattr(settings, "semaphore_project_id", 0)
    # Phase 6 Task 34/35 — same rationale, for the Hardware_Spec_Lookup's
    # Icecat/Brave Search credentials.
    monkeypatch.setattr(settings, "icecat_username", "")
    monkeypatch.setattr(settings, "icecat_password", "")
    monkeypatch.setattr(settings, "brave_search_api_key", "")


@pytest_asyncio.fixture
async def db_engine():
    """A fresh NullPool engine bound to the current test's event loop.

    Schema is DROPPED and rebuilt from the current ORM metadata every test.
    ``create_all`` alone is NOT enough once a model gains a new column on an
    already-existing table (it only creates missing tables, never ALTERs an
    existing one) — drop+create guarantees the test DB always matches the
    current models, even across schema-changing commits within a session.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.drop_all)
        await conn.run_sync(models.Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session(db_engine, monkeypatch):
    """A clean session; also re-points the app's session factory at this engine
    so code paths that call ``AsyncSessionLocal()`` internally hit the test DB
    on the same loop."""
    Maker = async_sessionmaker(
        bind=db_engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    monkeypatch.setattr(database, "AsyncSessionLocal", Maker)

    from sqlalchemy import text

    async with Maker() as s:
        await s.execute(
            text("TRUNCATE " + ", ".join(_TABLES) + " RESTART IDENTITY CASCADE")
        )
        await s.commit()
        yield s
