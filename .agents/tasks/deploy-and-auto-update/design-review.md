# Design Review — Deploy Anywhere + In-App Version Awareness & One-Click Update

Reviewed design: `.agents/tasks/deploy-and-auto-update/design.md`
Against requirements: `.agents/tasks/deploy-and-auto-update/requirements.md`
Repo root: `/Volumes/development/vf-cmdb`
Reviewer stance: fresh read, no prior context; every structural claim checked
against live source.

This is the third review iteration. The design already carries a "Responses to
design review findings" log for two prior rounds; those earlier findings are not
re-litigated here. This review re-verifies the seven directed points, re-checks
the source claims the design makes, and looks for anything still blocking
implementation.

---

## Verdict inputs

Directed verification (all seven requested checks):

1. **Version endpoint under `/api/v1` and reachable via nginx `/api/` proxy —
   HOLDS.** The endpoint is `GET /api/v1/meta/version`, placed in
   `special.router` which is mounted with `prefix=settings.api_prefix`
   (`/api/v1`, confirmed in `backend/app/config.py`). `frontend/nginx.conf`
   proxies `location /api/ { proxy_pass http://backend:8000; }`, so the path is
   reachable in prod; the Vite dev proxy forwards `/api` too. Correct.
2. **Update detection is NOTIFY-only, human-triggered one-click apply, no
   auto-apply, silent on network failure — HOLDS.** PART 1/2 return
   `latest=null, updateAvailable=false` on any GitHub failure and never raise;
   the apply flow fires only on the operator click (`POST /api/v1/admin/update`);
   nothing is applied until that click. Matches Tasks C.5, D.5, E.2, NFR 1.
3. **Marker-file + status-file handoff so the container never calls podman —
   HOLDS.** The container only `write_text`s `update.request` and reads
   `update.status`; a host-side systemd `.path` unit runs the script. Trust
   boundary is explicit and a single mechanism is chosen (Task E.6).
4. **Host updater pulls (not builds) ghcr.io images and health-checks the NEW
   version endpoint asserting version advanced — HOLDS.** PART 3 uses
   `podman auto-update` (pull), and the pass condition is HTTP 200 + parseable
   `.version` from `/api/v1/meta/version`, explicitly not merely `/health` 200;
   the outcome table classifies "advanced" vs "refreshed" vs "already up to
   date". Correct.
5. **Image rollback cannot undo a migration; pre-update DB backup kept —
   HOLDS.** Stated at overview, PART 3 ("Migration-cannot-be-rolled-back"),
   and Task G docs; backup taken first (step 1) and never deleted on failure.
   Consistent with `backend/entrypoint.sh` running `alembic upgrade head` on
   every start (verified).
6. **No auth introduced; Docker/compose not reintroduced as primary — HOLDS.**
   Cross-cutting section reaffirms no auth anywhere; Quadlet remains the only
   production path; compose stays a dev convenience. Matches Task F.7, NFR 2.
7. **Kiro-config alignment and backlog/spec tasks covered — HOLDS.** §8 covers
   Tasks A, B, G: `tech.md` head correction to `0037_physical_asset_theme_names`
   (verified that file is the live head), SKILL.md discover-head change,
   `BACKLOG.md`, SESSION_STATE handling.

All seven directed points pass. The findings below are the residual issues.

---

## Findings

### 1. MEDIUM — `tsc -b` / `resolveJsonModule` remediation points at a tsconfig that does not type-check `vite.config.ts`

PART 1 ("Frontend running-version source") says: "ensure `resolveJsonModule:
true` ... is set in **the tsconfig that `tsc -b` applies to `vite.config.ts`**"
so the `import pkg from "./package.json"` compiles under the `tsc -b` pass.

Verified against live source, this is mischaracterized:
- `frontend/tsconfig.json` has `"include": ["src"]` and `"noEmit": true`, with
  **no** `references` and **no** `tsconfig.node.json`. So `vite.config.ts` (at
  the frontend root, outside `src/`) is **not** part of any project `tsc -b`
  compiles — it is never type-checked by the current build. The design's premise
  that `tsc -b` type-checks `vite.config.ts` and could "reject the default JSON
  import" does not match the repo.
- `resolveJsonModule: true` already exists in `frontend/tsconfig.json`, but that
  config governs `src/**` (where `vite-env.d.ts` and the `__APP_VERSION__`
  consumers live), not `vite.config.ts`.

Why it matters: an implementer following the design will look for "the tsconfig
`tsc -b` applies to vite.config.ts," find none, and either (a) wrongly conclude
the build is misconfigured, or (b) add a `tsconfig.node.json` + project
references that the project does not currently use — a structural change beyond
scope. The real risk the design was guarding against (a JSON-import type error
breaking `npm run build`) does not exist here because `vite.config.ts` is outside
the typed project.

Concrete fix: replace the paragraph with the accurate statement — "`vite.config.ts`
is outside the `tsc -b` project (`tsconfig.json` includes only `src`), so the
`import pkg from \"./package.json\"` is resolved only by Vite's esbuild loader at
config-load time and is never seen by `tsc -b`; no tsconfig change is required.
`resolveJsonModule: true` is already set for `src/**`, which is sufficient for
the `__APP_VERSION__`/`__APP_GIT_SHA__` consumers and `vite-env.d.ts`." If the
implementer instead prefers to make `pkg.version` available to `src` code rather
than only to the Vite `define`, say so explicitly; otherwise drop the tsconfig
remediation.

### 2. MEDIUM — `vf-cmdb-update.service` lacks `[Install]`; design's reworked unit still omits it, so the `.path`-triggered oneshot and the enablement story are underspecified

PART 3 shows the reworked `vf-cmdb-update.service` as a `Type=oneshot` service
with `[Unit]`/`[Service]` only, and a new `vf-cmdb-update.path` with
`[Install] WantedBy=default.target`. Verified: the live
`deploy/systemd/vf-cmdb-update.service` indeed has **no `[Install]` section**
(it is triggered by its paired `.timer`, which carries the `[Install]`).

The gap: the design introduces the `.path` unit as the one-click trigger but
does not state how the oneshot `.service` is made available to be triggered, nor
confirm that a `oneshot` service with no `[Install]` is correct when pulled by
**both** a `.timer` and a `.path`. For a `.path`/`.timer`-activated oneshot that
is correct (the service needs no `[Install]`; the `.path` and `.timer` are the
enabled units). But the design never says the operator must
`systemctl --user enable --now vf-cmdb-update.path`, and it does not say whether
the `.path` unit (and the new `%h/vf-cmdb/state` dir) must exist **before** the
`.path` can watch `update.request` — a `.path` unit whose `PathChanged=` parent
directory does not exist will fail to start.

Why it matters: without the enable step and the "state dir must pre-exist"
precondition documented, a fresh deploy will have a working UI button that
writes `update.request` into a directory nothing is watching, and the one-click
update silently never fires — a functional dead end that passes every unit test
but fails end-to-end AC 4.

Concrete fix: add to PART 3 (and the Task G deploy docs) the explicit
enablement + precondition steps:
```
# one-time, as the user that owns the Quadlet services:
mkdir -p %h/vf-cmdb/state
systemctl --user daemon-reload
systemctl --user enable --now vf-cmdb-update.path
# .service needs no [Install]; it is pulled by vf-cmdb-update.path and .timer
```
and state that the backend bind-mount (`Volume=%h/vf-cmdb/state:/var/lib/vf-cmdb:Z`)
and the `.path` watch target share this pre-created directory, so the directory
MUST exist before either the container starts or the `.path` unit is enabled.

### 3. NIT — `PathChanged=` on a file re-written in place may not retrigger reliably across coalesced writes

PART 3's `.path` unit uses `PathChanged=%h/vf-cmdb/state/update.request`, and
PART 2 notes a second click "simply rewrites the marker (the host `.path` unit
coalesces rapid triggers)". systemd `.path` with `PathChanged` fires on close-
after-write; if the service is still running (flock held) when the file is
rewritten, systemd will not queue a second activation while the triggered
`.service` is active, so a click made during an in-flight update can be lost
(not merely coalesced). The design's flock protects against concurrent *runs*
but does not guarantee a *re-run* after an in-flight one finishes.

Concrete fix: either state that a click during an in-flight update is
intentionally dropped (operator waits for the current run to reach
`succeeded`/`failed`, which the UI already shows), or have the script re-check
the marker's mtime at the end of a run and self-retrigger if it changed. Pick one
and document it; the "coalesces rapid triggers" phrasing currently implies the
later click is honored, which is not guaranteed.

### 4. NIT — status `state` values differ between the frontend union and the backend/script defaults

`api.ts` `UpdateStatus.state` is typed as
`"idle" | "requested" | "running" | "succeeded" | "failed"`. The backend
`request_update` returns `_read_status(default_state="requested")` and
`update_status` returns `default_state="idle"`; the Bash writer emits
`running`/`succeeded`/`failed`. So `requested` is produced only by the backend
default when the status file is absent, and the host script jumps straight to
`running`. That is internally consistent, but the design never states who, if
anyone, ever writes `state:"requested"` into the file (the script's first write
is `running`), leaving a brief window where the POST returns `requested` but a
near-immediate status poll could read the script's `running` or the absent-file
`idle`. 

Concrete fix: add one sentence clarifying the lifecycle — POST returns
`requested` (file may still be absent); the `.path`-triggered script's first
`write_status "running" ...` is the first on-disk status; until then
`GET /admin/update/status` returns `idle` for an absent file. Confirm the
frontend treats `requested` and a transient `idle`/absent as "still starting,"
not "failed."

### 5. NIT — `make_latest: true` on `workflow_dispatch` for an older version could move "latest" backward

PART 4 `release.yml` sets `make_latest: true` unconditionally. If a maintainer
runs `workflow_dispatch` with an older `version` than the current latest release
(e.g. to re-cut an old build), GitHub will mark that older release as "latest,"
and the backend's `latest_release_tag()` would then report the older tag,
flipping `updateAvailable` logic for all hosts. The design's guidance ("use a
fresh, unused version") mitigates the common case but does not prevent a
foot-gun.

Concrete fix: note the hazard in the maintainer docs (Task G) — dispatching a
version lower than the current latest will move GitHub's "latest" pointer
backward; prefer `make_latest: "legacy"` semantics or simply document "only
dispatch a version `>=` the current latest." Low severity because it is a manual,
single-maintainer action, but it is a sharp edge worth one line.

---

## Verdict

HIGH findings: 0
MEDIUM findings: 2 (Findings 1, 2)
NIT findings: 3 (Findings 3, 4, 5)

Per the mechanical rule (any HIGH or MEDIUM ⇒ CHANGES_REQUESTED), the verdict is
**CHANGES_REQUESTED**. Both MEDIUMs are documentation/precondition gaps rather
than architectural flaws — the design's core is sound and all seven directed
checks pass — but each would cause a real implementation stumble (a non-existent
tsconfig target; a one-click button that silently never fires on a fresh host),
so neither can be downgraded.

---

## Verified Assumptions (checked against live source)

- `backend/app/main.py` hard-codes `version="1.0.0"` and registers
  `special.router` with `prefix=settings.api_prefix` **before** the generic
  catch-all, with an explicit comment that concrete routes must precede it. ✓
- `backend/app/config.py` sets `api_prefix = "/api/v1"`. ✓
- `backend/app/routers/special.py` already imports and uses `httpx`; adding the
  GitHub lookup there (or in a sibling `updates.py` it imports) needs no new
  dependency. ✓
- `backend/entrypoint.sh` waits for the DB (up to 60×2s = 120s), then runs
  `alembic upgrade head` and `python -m app.seed` before `uvicorn` — exactly the
  worst-case start path the 180s health-check budget is sized against. ✓
- The live Alembic head file is `0037_physical_asset_theme_names.py`
  (confirms Task A's correction target and that the current `tech.md`'s `0005`
  claim is stale). ✓
- `frontend/src/main.tsx` renders
  `<QueryClientProvider><BrowserRouter><App/></BrowserRouter></QueryClientProvider>`,
  so the provider wraps the whole shell including `Layout`'s footer —
  `VersionFooter`'s `useQuery` has a client in scope with no hoisting. ✓
  (Note: `main.tsx` also sets global defaults `retry: 1`,
  `refetchOnWindowFocus: false`; the design's per-query `retry: false` /
  `refetchOnWindowFocus: true` correctly override these.)
- `frontend/src/components/Layout.tsx` sidebar footer currently renders the
  `"Single-user · No auth · Home network"` line in a
  `px-4 py-3 text-[11px] ... border-t` div — the exact host the design extends. ✓
- `frontend/src/api.ts` uses `BASE = "/api/v1"` and a shared `handle(res)` that
  throws `` `${status}: ${detail}` `` on `!res.ok` — the behavior the design's
  two divergent error surfaces rely on. ✓
- `frontend/vite.config.ts` has `plugins`, `server.proxy` (`/api` + `/health` →
  `127.0.0.1:8000`), and `test` (happy-dom, globals, setupFiles, css:false)
  plus the `/// <reference types="vitest" />` header — all the blocks the design
  marks PRESERVED. ✓
- `frontend/tsconfig.json` already has `resolveJsonModule: true` and
  `include: ["src"]` (relevant to Finding 1). ✓
- `frontend/package.json` has `"version": "1.0.0"`, so the design's
  `pkg.version` fallback resolves. ✓
- `frontend/Containerfile` is a two-stage `node:20-alpine` build → `nginx:1.27`
  serve; the version must be baked at build stage as the design states. ✓
- `backend/Containerfile` ends with `COPY . .` then chmod/EXPOSE/HEALTHCHECK/CMD
  — "add ARG/ENV near the end after `COPY . .`" is placeable. ✓
- `frontend/nginx.conf` proxies only `location /api/` to `http://backend:8000`
  (no `/health` proxy), confirming the version endpoint MUST live under `/api/`
  to reach the browser in prod, and confirming the backend `alias=backend` must
  be preserved in the Quadlet repoint. ✓
- `deploy/quadlet/vf-cmdb-backend.container` currently uses
  `Image=localhost/vf_cmdb_backend:latest`, `Network=vf-cmdb.network:alias=backend`,
  no `AutoUpdate`, no shared `Volume=` — matches the design's "before" and the
  targeted-edit plan. ✓
- `deploy/quadlet/vf-cmdb-frontend.container` currently uses
  `Image=localhost/vf_cmdb_frontend:latest`, no `AutoUpdate` — matches. ✓
- `deploy/scripts/vf-cmdb-update.sh`, `vf-cmdb-backup.sh`, and `-restore.sh`
  exist; `deploy/systemd/vf-cmdb-update.{service,timer}` and the backup
  service/timer exist — the files the design reworks/references are present. ✓
- `deploy/systemd/vf-cmdb-update.service` is a `Type=oneshot` with
  `TimeoutStartSec=1800`, `Nice=10`, `ExecStart=%h/vf-cmdb/.../vf-cmdb-update.sh`
  and **no `[Install]`** (relevant to Finding 2). ✓
- `deploy/ci-templates/github-workflows/` exists as inactive templates and there
  is no `.github/workflows/` yet (Task F premise). ✓ (inferred from the
  requirements' current-state note; the design only adds the active workflows.)

## Unverified / External Assumptions (cannot be checked from the repo)

- GitHub's unauthenticated rate limit (60 req/hr/IP) used to justify the 10-min
  cache — external service property, correct at time of writing, not verifiable
  from the checkout. The design already flags this (Open assumption 7). Non-blocking.
- GHCR package visibility defaults to PRIVATE on first `release.yml` run and
  must be flipped to PUBLIC by a human once — external GitHub behavior. The
  design calls this out (Open assumption 6) and routes it to Task G docs.
  Non-blocking, correctly handled.
- `podman auto-update`'s exact restart-report output (used to distinguish
  "refreshed" from "already up to date") — a Podman runtime behavior, not
  verifiable from the repo. The classification logic is sound given the
  documented behavior; worth a manual confirmation during PART 3 integration
  testing, but not a design blocker.
- `jq` presence on deploy hosts — the design hardens this with a PART 3 step-0a
  preflight that fails with a clear status, so an absent `jq` degrades
  explicitly rather than silently. Correctly handled.
