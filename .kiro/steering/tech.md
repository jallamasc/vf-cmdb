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
- Migrations in `backend/alembic/versions/` — latest is `0005_site_redesign`.
  New migrations chain `down_revision` and must be idempotent/guarded
  (inspect for existing columns) like `0005`.

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

Podman stack helper (delegates to podman compose / podman-compose):
- `./deploy-podman.sh up` — build + start (backend auto-migrates + seeds)
- `./deploy-podman.sh down`
- `./deploy-podman.sh logs`
- `./deploy-podman.sh reset` — clears stale containers + pgadmin vol; KEEPS pgdata
- `./deploy-podman.sh quadlet` — install rootless systemd units

Default ports: frontend 8080, backend 8000 (+/docs), postgres 5432, pgAdmin 5050.

## Testing
- No automated test framework is installed yet on either side. When adding
  tests: backend uses pytest (async client); frontend uses Vitest + Testing
  Library. Use single-run modes; never leave watchers running.

## Do NOT
- Reintroduce Docker (Dockerfile/docker-compose). It is Podman + Containerfile.
- Store credentials in the DB. Change kebab-case slugs the frontend depends on.
  Remove the changelog or the naming engine. Drop PostgreSQL inet/cidr types.
