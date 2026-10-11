# Requirements — Deploy Anywhere + In-App Version Awareness & One-Click Update

## Summary

This feature has two intertwined objectives for the Virtualfactor IT CMDB
(vf-cmdb), a single-user, no-auth, self-hosted CMDB deployed with Podman
Quadlet.

1. **Kiro mechanism alignment & backlog home.** Bring every Kiro working
   mechanism (steering, skills, hooks, specs) back in line with how the project
   actually works today (Alembic head is `0037_physical_asset_theme_names`, not
   `0005`; pytest + Vitest frameworks exist; the backend container self-migrates
   and self-seeds on start), and give all pending/deferred work one tracked home
   — a human-readable `BACKLOG.md` at the repo root plus this dedicated spec for
   the deploy/update feature.

2. **Deploy anywhere + notify-and-apply updates.** Make the app deployable on
   any host that runs Podman Quadlet, using **pre-built images** published to
   GitHub Container Registry (`ghcr.io`, repo is PUBLIC so hosts pull
   anonymously). The running app surfaces its own version and detects when a
   newer **release** exists (by comparing against the public GitHub Releases API
   latest tag), displays an "update available" indicator, and offers a human a
   **one-click "Update now"** on that host. The app never auto-applies an update;
   a human both decides what counts as a release (by tagging `vX.Y.Z`) and
   decides when each host applies it.

The work is organized into seven tasks (A–G) whose requirements follow. Across
every task the following behaviors are mandatory and are called out again where
relevant: **notify, do not auto-apply**; **fail silently and non-fatally on
network errors** (an unreachable GitHub never breaks the app or blocks the UI);
**no authentication** is added anywhere (single-user private network); and the
**migration-rollback caveat** is documented wherever update/rollback is
described.

## Assumptions

- The repo is and remains PUBLIC at `https://github.com/jallamasc/vf-cmdb`,
  default branch `master`. Hosts therefore pull images and query the Releases
  API anonymously; no token is stored on any host.
- Images are named `ghcr.io/jallamasc/vf-cmdb-backend` and
  `ghcr.io/jallamasc/vf-cmdb-frontend` (one per existing Containerfile).
- The GitHub Releases "latest" tag is the single source of truth for "what
  version a host should be following." The backend compares its own running
  version string against that tag.
- "One-click update" on a host means re-pulling the `:latest` images and
  restarting the Quadlet-managed systemd user services for that host; it does
  not mean editing code or running `git pull`. (The legacy
  `deploy/scripts/vf-cmdb-update.sh` git-pull-and-rebuild flow remains valid for
  source-based hosts but is not the path this feature wires into the UI.)
- The host that serves the UI can reach `ghcr.io` and `api.github.com`
  outbound; if it cannot, update-checking degrades silently (see NFRs).

## Task A — Kiro configuration alignment

Bring `.kiro/steering/*`, `.kiro/skills/*`, and `.kiro/hooks/*` in line with the
live project so an agent booting a fresh session is never told something false.

Known drifts to correct (confirmed in the repo): `.kiro/steering/tech.md` states
the Alembic head is `0005_site_redesign` and that "No automated test framework
is installed yet on either side" — both false (head is
`0037_physical_asset_theme_names`; backend pytest against `vfcmdb_test` on
`127.0.0.1:55432` and frontend Vitest 2.1.9 + happy-dom both exist and pass).
The `.kiro/skills/add-entity/SKILL.md` migration step also hard-codes
`0005_site_redesign` as "the current head."

Acceptance criteria:

1. WHEN an agent reads `.kiro/steering/tech.md` THE SYSTEM SHALL present the
   current Alembic head as `0037_physical_asset_theme_names` (not `0005`) and
   SHALL describe the test frameworks as installed (backend pytest against
   `vfcmdb_test` on `127.0.0.1:55432`; frontend Vitest + happy-dom), with the
   single-run commands used to invoke each.
2. WHEN an agent reads `.kiro/skills/add-entity/SKILL.md` THE SYSTEM SHALL
   instruct it to chain a new migration's `down_revision` to the current head
   discovered from `backend/alembic/versions/` rather than to a hard-coded
   `0005`.
3. WHERE a steering, skill, or hook file references a path, port, head
   revision, or command that no longer matches the live repo THE SYSTEM SHALL
   update it to the authoritative value (local path `/Volumes/development/vf-cmdb`;
   ports frontend 8080 / backend 8000 / postgres 5432 / pgAdmin 5050).
4. THE SYSTEM SHALL document (in steering) that the deployed backend container
   runs `alembic upgrade head` + `python -m app.seed` on every start via
   `backend/entrypoint.sh`, so a pulled backend image self-migrates.
5. WHERE a Kiro mechanism was accurate THE SYSTEM SHALL leave it unchanged — the
   alignment edits SHALL NOT alter the fixed-stack hard rules (no auth, no
   credentials in the DB, generic-CRUD write path, Postgres inet/cidr/jsonb
   types, kebab/snake/camel naming).

## Task B — BACKLOG.md + spec skeleton + SESSION_STATE cleanup

Establish one tracked home for pending work and record the current truth.

Acceptance criteria:

1. THE SYSTEM SHALL create a human-readable `BACKLOG.md` at the repo root whose
   small deferred items are checkbox entries (`- [ ]`), NOT their own specs.
2. WHEN a deferred item is small (a bug, a minor UX gap, a single-file tweak)
   THE SYSTEM SHALL record it as a `BACKLOG.md` checkbox; WHEN a deferred item
   is a multi-subsystem feature THE SYSTEM SHALL instead give it its own
   `.kiro/specs/<name>/` directory.
3. THE SYSTEM SHALL migrate the still-open "Next" items already captured in
   `SESSION_STATE.md` (e.g. the `PortConfigView`/`owner_device_*` polymorphism
   gap, the Ansible/Semaphore ad-hoc-run limitation) into `BACKLOG.md` so there
   is a single pending-work list.
4. THE SYSTEM SHALL create this spec directory
   `.kiro/specs/deploy-and-auto-update/` containing at minimum `requirements.md`
   (this document); design and tasks artifacts follow in later pipeline steps.
5. WHEN the deploy-and-update work is complete THE SYSTEM SHALL update
   `SESSION_STATE.md` with the new status, decisions made, next steps, and
   current HEAD, per the project's memory protocol.
6. THE SYSTEM SHALL NOT delete historical SESSION_STATE content wholesale; stale
   specifics (old paths/ports) SHALL be corrected in place rather than
   propagated.

## Task C — Backend version awareness

Give the backend a real, inspectable version and a single endpoint the frontend
can poll to learn (a) what version is running and (b) whether a newer release
exists.

Current state: `backend/app/main.py` hard-codes `version="1.0.0"` on the
FastAPI app; there is `/health` and `{api_prefix}/meta/entities` but no version
endpoint. The frontend reaches the backend only through nginx's `/api/` proxy,
so the new endpoint MUST live under `{api_prefix}/meta/...` (i.e.
`/api/v1/meta/version`) to be reachable in both dev and prod.

Acceptance criteria:

1. THE SYSTEM SHALL expose the running application version from a single
   authoritative source (e.g. a build-time-injected `APP_VERSION` env/baked
   value with a sane default) rather than a string duplicated across files, and
   the FastAPI `version=` SHALL read from that same source.
2. THE SYSTEM SHALL serve `GET /api/v1/meta/version` returning at least: the
   running version, the latest released version known from GitHub (or null when
   unknown), and a boolean "update available".
3. WHEN `GET /api/v1/meta/version` is called THE SYSTEM SHALL query the public
   GitHub Releases "latest" endpoint for `jallamasc/vf-cmdb` anonymously (no
   token) to determine the latest release tag.
4. WHEN comparing the running version to the latest release tag THE SYSTEM SHALL
   treat them as semantic versions (tag form `vX.Y.Z`) and SHALL report
   "update available" true only when the latest release is strictly newer than
   the running version.
5. IF the GitHub Releases API is unreachable, times out, rate-limits, or returns
   an unparseable payload THE SYSTEM SHALL return the running version with
   latest=null and updateAvailable=false, SHALL NOT raise an error to the
   caller, and SHALL NOT block the request beyond a short bounded timeout.
6. THE SYSTEM SHALL cache the latest-release lookup for a short interval so that
   frequent frontend polls do not hammer the GitHub API (and so a transient
   outage is tolerated using the last known good value).
7. WHEN registering this route THE SYSTEM SHALL place it before the generic
   `/{resource}/{item_id}` catch-all router, consistent with the existing
   `/meta/entities` ordering requirement in `main.py`.
8. THE SYSTEM SHALL NOT require or add any authentication to this endpoint.
9. THE SYSTEM SHALL document, adjacent to the version/update code, that an image
   rollback does NOT undo an Alembic migration (because `entrypoint.sh` runs
   `alembic upgrade head` on every start) and that the pre-update DB backup
   (`deploy/scripts/vf-cmdb-backup.sh`) is the real rollback safety net.

## Task D — Frontend version + update-available indicator

Surface the running version and an "update available" notice in the UI without
nagging and without ever breaking the page when offline.

Acceptance criteria:

1. THE SYSTEM SHALL display the running application version somewhere persistent
   in the UI chrome (the `Layout.tsx` sidebar footer, next to the existing
   "Single-user · No auth · Home network" line, is the chosen location).
2. WHEN `GET /api/v1/meta/version` reports updateAvailable=true THE SYSTEM SHALL
   show a clear, non-modal "update available" indicator that names the latest
   version and does not obstruct normal use.
3. WHEN updateAvailable is false THE SYSTEM SHALL show only the running version
   with no update affordance.
4. THE SYSTEM SHALL fetch version info through the existing typed API client
   (`frontend/src/api.ts`) and the existing `/api/` proxy path, adding no new
   proxy rule or direct cross-origin call to GitHub from the browser.
5. IF the version request fails THE SYSTEM SHALL fail silently — the indicator
   SHALL simply not appear (or show the running version only) and SHALL NOT
   surface an error toast, console-breaking exception, or blocked render.
6. THE SYSTEM SHALL poll for update availability on a modest interval (and/or on
   app focus) rather than only once at load, so a newly tagged release is
   noticed without a manual reload, while respecting the backend cache in C.6.
7. THE SYSTEM SHALL add no authentication, login, or gating UI of any kind.

## Task E — One-click update plumbing

Let a human apply the available update on the current host with one click, and
nothing happens until that click.

Acceptance criteria:

1. WHEN the operator clicks "Update now" THE SYSTEM SHALL trigger a host-local
   update that re-pulls the `:latest` backend and frontend images from
   `ghcr.io` and restarts the Quadlet-managed systemd user services on that
   host.
2. THE SYSTEM SHALL NOT apply, download-and-swap, or restart anything on its own:
   until the operator clicks "Update now" the running stack SHALL remain exactly
   as deployed (notify-only).
3. BEFORE applying an update THE SYSTEM SHALL take (or confirm) a pre-update
   database backup via `deploy/scripts/vf-cmdb-backup.sh`, consistent with the
   migration-rollback caveat.
4. THE SYSTEM SHALL surface clear progress/outcome feedback for the update
   action (in progress, succeeded, failed) and SHALL remain usable (or recover)
   if the update fails.
5. IF the update cannot complete (image pull fails, service restart fails,
   health check fails afterward) THE SYSTEM SHALL report the failure to the
   operator and SHALL document that recovery uses the pre-update DB backup, and
   SHALL make clear that re-pulling an older image does NOT roll back a migration
   that already ran on start.
6. THE SYSTEM SHALL document how the UI click reaches a host-privileged action
   given that the app has no auth and runs as rootless Podman — i.e. the chosen
   mechanism (e.g. a user systemd unit / `podman auto-update` trigger / a thin
   host-side script the backend invokes) and its trust boundary on a single-user
   private host. The design step SHALL choose exactly one mechanism, not leave
   alternatives open.
7. THE SYSTEM SHALL NOT add authentication to the update trigger; the single-user
   private-network assumption is the trust model, and this SHALL be stated
   explicitly in the docs.

## Task F — CI + registry + Quadlet repoint

Publish pre-built images with a human release gate and repoint the Quadlet units
to follow them.

Current state: CI exists only as inactive templates in
`deploy/ci-templates/github-workflows/`; there is no `.github/workflows/`
directory. Quadlet backend/frontend units reference `localhost/...:latest`
images with no `AutoUpdate`; db + pgadmin already use `AutoUpdate=registry`.

Acceptance criteria:

1. THE SYSTEM SHALL add active GitHub Actions workflow(s) under
   `.github/workflows/` that build both images from their existing
   Containerfiles (`backend/Containerfile`, `frontend/Containerfile`) and push
   them to `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}`.
2. WHEN a commit is pushed to `master` THE SYSTEM SHALL build and push `:edge`
   and `:sha-<shortsha>` tags (a CI exercise only; these tags are NOT what hosts
   follow).
3. WHEN a git tag matching `vX.Y.Z` is pushed (primary path) OR a manual
   `workflow_dispatch` is run (fallback path) THE SYSTEM SHALL publish `:latest`
   and `:vX.Y.Z` image tags AND create a corresponding GitHub Release.
4. THE SYSTEM SHALL treat the human git-tag/`workflow_dispatch` action as the
   sole release gate; the system SHALL NOT auto-promote any `:edge`/`:sha-*`
   build to `:latest` or auto-create a release.
5. THE SYSTEM SHALL publish images to a PUBLIC package so that any host pulls
   anonymously with no token configured on the host.
6. THE SYSTEM SHALL repoint `deploy/quadlet/vf-cmdb-backend.container` and
   `deploy/quadlet/vf-cmdb-frontend.container` to
   `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}:latest` with
   `AutoUpdate=registry`, matching the existing db/pgadmin units.
7. THE SYSTEM SHALL keep Podman + Quadlet as the only supported deploy path;
   compose (`podman-compose.yml`, `deploy-podman.sh`) remains a local-dev
   convenience and SHALL NOT be promoted to a production path, and Docker /
   docker-compose SHALL NOT be reintroduced.
8. THE SYSTEM SHALL ensure the published backend image injects/bakes the release
   version (feeding Task C.1) so a pulled `:vX.Y.Z` image reports `X.Y.Z` at
   `/api/v1/meta/version`.
9. THE SYSTEM SHALL document that only `:latest`/tagged images are what hosts
   follow and that the version indicator compares against the GitHub Releases
   latest tag produced by this same gate.

## Task G — Docs + finalize

Make it possible to deploy anywhere and apply updates from documentation alone.

Acceptance criteria:

1. THE SYSTEM SHALL document a from-scratch "deploy anywhere with Podman Quadlet
   from pre-built ghcr.io images" procedure (install the Quadlet units, provide
   `.env`, start the user services, reach the UI) in the deploy docs.
2. THE SYSTEM SHALL document the release workflow for the maintainer: push to
   `master` for `:edge`/`:sha-*`, tag `vX.Y.Z` (or run `workflow_dispatch`) to
   cut `:latest` + a GitHub Release.
3. THE SYSTEM SHALL document the in-app update experience (version shown,
   update-available indicator, one-click "Update now") and explicitly state it
   is notify-and-apply, never auto-apply.
4. THE SYSTEM SHALL document the migration-rollback caveat prominently in the
   update/operations docs: re-pulling an older image does not undo an Alembic
   migration run by `entrypoint.sh`, and the pre-update
   `deploy/scripts/vf-cmdb-backup.sh` backup is the rollback safety net
   (restore via `deploy/scripts/vf-cmdb-restore.sh`).
5. THE SYSTEM SHALL state the no-auth trust model explicitly in the deploy and
   update docs (single user, private network, anonymous public image pulls).
6. WHEN docs are finalized THE SYSTEM SHALL update the repo-root memory
   artifacts (`SESSION_STATE.md`, and `MEMORY_BANK.md` only if a hard rule
   changed) and refresh the codebase index per the memory protocol.

## Non-Functional Requirements

1. **Silent-on-failure networking.** Every outbound call to GitHub
   (`api.github.com`, `ghcr.io`) SHALL have a bounded timeout, SHALL be caught,
   and SHALL degrade to "no update info" without raising to the UI or crashing a
   request. An offline host SHALL run the app normally and simply show no update
   notice.
2. **No authentication.** No login, token, session, or credential is introduced
   anywhere — frontend, backend version/update endpoints, update trigger, or CI
   host pull. CI's push to ghcr.io uses the GitHub-provided workflow token only
   inside Actions, never on a host.
3. **No credentials in the DB.** Nothing added here persists a secret in
   Postgres; this feature introduces no secret storage.
4. **Fixed stack preserved.** No framework, container runtime, or grid library
   swap. Writes stay on the generic CRUD path; Postgres inet/cidr/jsonb types
   remain; slugs kebab-case, columns snake_case, frontend identifiers camelCase.
5. **Idempotent, guarded migrations.** This feature should need no schema change;
   IF one is required it SHALL chain `down_revision` to the current head
   (`0037_physical_asset_theme_names`) and be idempotent/guarded like `0005`.
6. **Testability.** The version-comparison logic (semver parse, "is newer",
   malformed/unknown input) SHALL be unit-testable in isolation of any network
   call (backend pytest); the GitHub lookup SHALL be mockable. The frontend
   indicator SHALL be component-testable (Vitest + happy-dom) with the API
   client stubbed for the available / not-available / request-failed cases.
7. **Low noise.** The update indicator SHALL be informational and non-modal; it
   SHALL NOT interrupt editing or repeatedly nag.

## Acceptance Criteria (end-to-end, numbered & testable)

1. GIVEN the backend is running image `:v1.4.0` and the GitHub latest release is
   `v1.5.0`, WHEN the frontend loads, THEN the sidebar shows the running version
   and an "update available (v1.5.0)" indicator.
2. GIVEN the running version equals the latest release, WHEN the frontend loads,
   THEN only the running version is shown and no update affordance appears.
3. GIVEN `api.github.com` is unreachable, WHEN `GET /api/v1/meta/version` is
   called, THEN it returns the running version with latest=null and
   updateAvailable=false within a bounded timeout and logs nothing fatal, and the
   UI shows no error.
4. GIVEN an update is available, WHEN the operator clicks "Update now", THEN a
   pre-update DB backup is taken and the host re-pulls `:latest` images and
   restarts the Quadlet services; nothing changes before that click.
5. GIVEN a push to `master`, WHEN CI runs, THEN `:edge` and `:sha-<shortsha>`
   images are published but no `:latest` tag and no GitHub Release are created.
6. GIVEN a maintainer pushes tag `v1.5.0` (or runs `workflow_dispatch`), WHEN CI
   runs, THEN `:latest` and `:v1.5.0` images are published AND a GitHub Release
   `v1.5.0` is created.
7. GIVEN a fresh host with only Podman + the Quadlet units + `.env`, WHEN the
   user services start, THEN the stack pulls public ghcr.io images anonymously,
   the backend self-migrates and self-seeds, and the UI is reachable.
8. GIVEN an agent opens a new session, WHEN it reads `.kiro/steering/tech.md` and
   `.kiro/skills/add-entity/SKILL.md`, THEN they state the Alembic head as
   `0037_physical_asset_theme_names` and describe the pytest/Vitest frameworks as
   present.
9. GIVEN deferred work exists, WHEN a maintainer opens `BACKLOG.md`, THEN every
   open small item appears as a checkbox and multi-subsystem items point to their
   own `.kiro/specs/` directory.
10. GIVEN the version-comparison function, WHEN given `(running=v1.4.0,
    latest=v1.5.0)`, `(v1.5.0, v1.5.0)`, `(v1.6.0, v1.5.0)`, and malformed/null
    inputs, THEN it returns true, false, false, and a safe false respectively,
    under unit test with no network access.

## Out of Scope

- Automatic (unattended) application of updates. The app only notifies; a human
  applies per host.
- Any authentication, authorization, user accounts, or multi-tenant support.
- Storing GitHub tokens or any secret on hosts or in the database.
- Migration down-grade / automatic schema rollback. Rollback is via DB backup
  restore only.
- Reintroducing Docker / docker-compose, or adding a non-Quadlet production
  deploy path.
- Rewriting the legacy source-based `deploy/scripts/vf-cmdb-update.sh`
  git-pull-and-rebuild flow (it stays valid for source hosts but is not the
  UI-wired path).
- Cross-host / fleet-wide coordinated updates; each host is updated
  independently by its own operator click.
