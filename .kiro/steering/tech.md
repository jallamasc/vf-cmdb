---
inclusion: always
---

# Tech Stack & Commands

The stack is FIXED. Do not swap frameworks, the container runtime, or the grid
library without explicit user approval.

## Backend (`backend/`)
- Python 3.11, FastAPI 0.111, async SQLAlchemy 2.0 (asyncpg), Alembic 1.13,
  Pydantic 2, httpx. PostgreSQL 16 (uses native `inet`/`cidr`/`jsonb` types).
- Generic CRUD is driven by `ENTITY_REGISTRY` in `backend/app/registry.py`
  (kebab-case slug -> ORM model). Generic routes live in
  `backend/app/routers/generic.py`; non-CRUD endpoints in
  `backend/app/routers/special.py` (IPAM, naming preview, stencils, facts).
- Changelog and auto-naming are applied INSIDE `backend/app/crud.py`
  (`create_item`/`update_item`/`delete_item` call `_log(...)` and
  `naming.apply_naming(...)`). They are NOT raw ORM event listeners. Keep writes
  on the generic CRUD path so audit + naming apply automatically.
- Name generation lives in `backend/app/naming.py` (`GENERATORS` dispatch).
- Migrations in `backend/alembic/versions/` — latest head is
  `0037_physical_asset_theme_names`. New migrations chain `down_revision` to the
  current head and must be idempotent/guarded (inspect for existing
  columns/tables) like the recent ones. The deployed backend self-migrates and
  self-seeds on container start via `backend/entrypoint.sh` (`alembic upgrade
  head` then `python -m app.seed`), so a fresh deploy comes up on the latest
  schema with seed data automatically.

## Frontend (`frontend/`)
- React 18 + TypeScript 5 + Vite 5, AG Grid Community 32, TanStack Query 5,
  React Router 6, Tailwind 3. Typed API client in `frontend/src/api.ts`.
- Generic editable grid: `frontend/src/components/EntityGrid.tsx`. Column
  helpers in `frontend/src/lib/columns.tsx` (fkCol, ipCol, roCol, customCol...).
- Build = `tsc -b && vite build` (type errors fail the build).

## Naming conventions (code style)
- API resource slugs: kebab-case. Database columns: snake_case. Frontend
  identifiers: camelCase. Primary keys are always integer `id`.
- Commits: Conventional Commits (feat:, fix:, docs:, refactor:).

## Common commands
Backend local setup: create venv, `pip install -r backend/requirements.txt`,
`alembic upgrade head`, `python -m app.seed`. The API server (uvicorn on port
8000) and the Vite dev server are long-running — the USER starts those manually.

Frontend verification (safe to run): `cd frontend && npm install` then
`npm run build` (this is `tsc -b && vite build`) to confirm changes compile.

Podman stack helper (delegates to podman compose / podman-compose) — full
subcommand set:
- `./deploy-podman.sh up` — build + start (backend auto-migrates + seeds)
- `./deploy-podman.sh down`
- `./deploy-podman.sh restart`
- `./deploy-podman.sh build` — rebuild images
- `./deploy-podman.sh logs [service]`
- `./deploy-podman.sh ps` — list running containers
- `./deploy-podman.sh reset` — clears stale containers + pgadmin vol; KEEPS pgdata
- `./deploy-podman.sh recover` — repair a corrupted podman volume store (backs
  up DB data first)
- `./deploy-podman.sh quadlet` — install rootless systemd units

Default stack ports: frontend 8080, backend 8000 (+ `/docs`), postgres 5432,
pgAdmin 5050.

Dev-loop ports (how the project is iterated locally, distinct from the full
stack above): Vite dev server 5173 (proxies `/api` + `/health` to the backend);
containerized dev backend `vf_cmdb_backend_dev` on host port 8000 via
`backend/dev-container.sh up` (its live-reload is a `podman cp` + `fswatch` loop
over `backend/app/` ONLY — a new `backend/alembic/` migration needs a manual
`podman cp` or an image rebuild before `alembic upgrade head` inside the
container sees it); dev Postgres `vf_cmdb_dev` (a `postgres:16` container) on
host port 55432; Semaphore (Ansible automation) on 3000.

## Testing
Both sides have a real automated test framework installed — use single-run
modes, never leave a watcher running.

- Backend: pytest + pytest-asyncio (auto mode) in `backend/tests/`, run against
  a REAL Postgres `vfcmdb_test` (NEVER `vfcmdb`). `conftest.py` drops+recreates
  the schema from ORM metadata each test and forces every external integration
  unconfigured. First kill any stray pytest (`ps aux|grep pytest|grep -v grep`),
  then from `backend/`:
  `POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_USER=vfcmdb POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb_test .venv/bin/pytest -q`
  (~4 min). Do NOT point tests at the live dev `vf_cmdb_dev` DB — its schema can
  be ahead of HEAD and is incompatible; `vfcmdb_test` is managed independently by
  conftest.py.
- Frontend: Vitest 2.1.9 + happy-dom (setup `frontend/src/test/setup.ts`), run
  single-run from `frontend/`: `npx vitest run`.

## Do NOT
- Reintroduce Docker (Dockerfile/docker-compose). It is Podman + Containerfile.
- Store credentials in the DB. Change kebab-case slugs the frontend depends on.
  Remove the changelog or the naming engine. Drop PostgreSQL inet/cidr types.
