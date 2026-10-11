---
name: local-test-loop
description: Run and verify the CMDB locally for phase-by-phase testing on Podman, including migrations, seeding, and safe reset without losing the database.
---

# Local Test Loop (Podman)

Use this to bring the stack up locally and verify a phase before moving on.

## Bring up / verify
- Ensure `.env` exists (copy from `.env.example`, set POSTGRES_PASSWORD).
- `./deploy-podman.sh up` — builds images; backend auto-runs Alembic migrations
  then seeds on first boot.
- Check: Web UI http://localhost:8080, API docs http://localhost:8000/docs,
  pgAdmin http://localhost:5050.
- Logs: `./deploy-podman.sh logs`. Containers: `./deploy-podman.sh ps`.

## When something is stuck
- `./deploy-podman.sh reset` clears stale containers and the pgAdmin volume and
  brings the stack back up. It KEEPS the `pgdata` database volume.
- `./deploy-podman.sh recover` repairs a corrupted podman volume store (backs up
  DB data first).

## Safety
- Never run `... down -v` unless the user explicitly wants the database wiped —
  it deletes `pgdata`. Prefer `reset`, which preserves it.
- The DB volume is the only stateful piece; containers are disposable.

## Dev loop (iterating one phase at a time)
The project is usually iterated against a lighter dev loop rather than the full
`deploy-podman.sh` stack:
- **Dev backend** — containerized `vf_cmdb_backend_dev` on host port 8000, via
  `cd backend && DEV_BACKEND_PORT=8000 ./dev-container.sh up`. It has native
  deps (e.g. `vss2svg-conv`) a bare `.venv` uvicorn lacks. Live-reload is a
  `podman cp` + `fswatch` loop over `backend/app/` ONLY — a new
  `backend/alembic/` migration is NOT auto-synced; `podman cp backend/alembic
  vf_cmdb_backend_dev:/app/alembic` then `alembic upgrade head` inside the
  container, or rebuild the image.
- **Dev Postgres** — `vf_cmdb_dev` (`postgres:16`) on host port 55432.
- **Frontend** — `cd frontend && npm run dev` (Vite on 5173, proxies `/api` +
  `/health` to the backend). This is the URL to browser-test.
- **Semaphore** (Ansible automation) on 3000 when running.

If the podman machine or a container silently stops between turns: `podman
machine start`, then `podman start vf_cmdb_dev vf_cmdb_semaphore`, then restart
the dev backend/frontend. The named containers keep their data — restart, don't
recreate.

## Running tests (single-run only)
- **Backend** (from `backend/`, kill stray pytest first via
  `ps aux|grep pytest|grep -v grep`):
  `POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_USER=vfcmdb POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb_test .venv/bin/pytest -q`
  — ALWAYS the `vfcmdb_test` DB, never `vfcmdb`; conftest.py recreates the schema
  each test and forces external integrations off. ~4 min.
- **Frontend** (from `frontend/`): `npx vitest run` — never a watcher.

## After a passing phase
- Update SESSION_STATE.md (defer open items to BACKLOG.md), run `./cbindex
  build`, and pause for the user to test.
