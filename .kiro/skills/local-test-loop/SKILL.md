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

## After a passing phase
- Update SESSION_STATE.md, run `./cbindex build`, and pause for the user to test.
