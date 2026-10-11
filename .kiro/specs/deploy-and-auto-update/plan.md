# Implementation Plan — Deploy Anywhere + In-App Version Awareness & One-Click Update

This plan implements the APPROVED design at
`.kiro/specs/deploy-and-auto-update/{requirements,design}.md`. The design phase
is done; this plan sequences it into dependency-ordered, individually
verifiable commits. Work on `master` directly (no worktree). Never `git push`.

## Authoritative current-state facts (verified against the live repo)

- Alembic head = `0037_physical_asset_theme_names` (NOT `0005`). This feature
  adds NO migration (NFR 5).
- `backend/app/main.py` hard-codes `version="1.0.0"` (~line 16); has `GET /health`
  and `GET {api_prefix}/meta/entities`; `api_prefix = "/api/v1"`; `special.router`
  is registered BEFORE the generic catch-all.
- `frontend/package.json` version `1.0.0`.
- `frontend/vite.config.ts` has `plugins`/`server`/`test` top-level keys and the
  `/// <reference types="vitest" />` header. `server` = host:true, port:5173,
  proxy for `/api` and `/health`; `test` = environment "happy-dom", globals:true,
  setupFiles `["./src/test/setup.ts"]`, css:false.
- `frontend/tsconfig.json` has `include:["src"]`, `noEmit:true`,
  `resolveJsonModule:true` already. **`vite.config.ts` is OUTSIDE `tsc -b`'s
  project** (it is not under `src/`), so no tsconfig/resolveJsonModule change is
  needed for vite.config.ts (finding 1).
- `frontend/src/main.tsx` wraps `<QueryClientProvider><BrowserRouter><App/></…>`;
  `App.tsx` renders `Layout` as a routed element — the footer is inside the
  provider, so a `useQuery` in the footer is safe (design-verified).
- `frontend/src/components/Layout.tsx` footer div renders
  "Single-user · No auth · Home network".
- `frontend/src/api.ts` exposes a shared `handle(res)` (throws on `!res.ok`) and
  an `export const api = {…}` object; `const BASE = "/api/v1"`.
- Backend tests use `httpx.ASGITransport(app=app)` + an `AsyncClient` fixture
  (see `backend/tests/test_automation_endpoints.py`); `conftest.py` provides a
  `session` fixture and forces all external integrations "unconfigured".
- `deploy/scripts/vf-cmdb-update.sh` is the legacy git-pull-and-rebuild script.
- `deploy/systemd/vf-cmdb-update.service` (oneshot, has NO `[Install]`) and
  `vf-cmdb-update.timer` (daily, has `[Install]`) exist; NO `.path` unit yet.
- `deploy/quadlet/vf-cmdb-{backend,frontend}.container` reference
  `localhost/vf_cmdb_{backend,frontend}:latest` with no `AutoUpdate`; backend has
  `Network=vf-cmdb.network:alias=backend` (nginx proxies `http://backend:8000`).
- CI exists only as inactive templates in
  `deploy/ci-templates/github-workflows/` (ci.yml, codeql.yml, security-scan.yml);
  no `.github/workflows/` dir.
- `.kiro/hooks/*.kiro.hook` already use the current Kiro v1 envelope
  `{version:"v1", hooks:[{name, trigger, matcher?, action:{type, command|prompt}}]}`.
- Repo is PUBLIC at github.com/jallamasc/vf-cmdb, default branch master; GHCR
  namespace `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}`.

## The 5 review findings baked in as requirements

1. **Vite version via `define` only.** Do NOT add a tsconfig/resolveJsonModule
   remediation for `vite.config.ts` (it is outside `tsc -b`; resolveJsonModule is
   already set for `src/**`). Expose `__APP_VERSION__`/`__APP_GIT_SHA__` via Vite
   `define`, declared in `src/vite-env.d.ts`. ADD the `define` key ALONGSIDE the
   existing `plugins`/`server`/`test` blocks — never drop or overwrite them.
2. **One-time host state-dir setup.** The host state dir (default `~/vf-cmdb/state`,
   `VF_UPDATE_DIR` configurable) MUST pre-exist before the backend container
   starts (it bind-mounts it) AND before `vf-cmdb-update.path` is enabled (a
   `.path` whose watched parent dir is missing fails to start). Documented
   enablement: `mkdir -p ~/vf-cmdb/state`; `systemctl --user daemon-reload`;
   `systemctl --user enable --now vf-cmdb-update.path`. The oneshot
   `vf-cmdb-update.service` has NO `[Install]` (pulled by `.path` + daily `.timer`).
   The backend `Volume=` mount and the `.path` watch target share this one dir.
3. **`.path` drops a click during an in-flight run.** systemd `.path` with
   `PathChanged` does not queue a second activation while the triggered service
   runs. DOCUMENT that a click during an in-flight update is intentionally
   dropped; the operator waits for succeeded/failed before clicking again. The
   frontend greys/disables "Update now" while status is `running`. Do NOT build a
   self-retrigger loop.
4. **`requested`/transient-idle is "still starting", not "failed".** POST returns
   `requested` (status file may be absent); the host script's first
   `write_status running` is the first on-disk status; until then GET returns
   `idle`. The frontend treats `requested` + a transient `idle`/absent window
   right after a POST as "still starting", with a test.
5. **`make_latest` must not move latest backward.** DOCUMENT (Task G maintainer
   docs) "only dispatch/tag a version >= current latest"; prefer make_latest
   semantics that won't move latest backward. Tag-push (`v*`) is the primary
   release path; `workflow_dispatch` is the fallback.

## Hard rules (enforced throughout)

No auth anywhere; no credentials in the DB; writes stay on the generic CRUD path;
Podman/Quadlet only (never Docker/compose-as-primary); the container NEVER calls
podman/systemctl (file-marker + host systemd `.path` boundary); the
migration-cannot-be-rolled-back caveat stated at code + script + docs layers
(pre-update DB backup via `deploy/scripts/vf-cmdb-backup.sh` is the only true
rollback); all GitHub/network lookups SILENT on failure (no crash, no badge).

## Verification commands (exact)

- Frontend build: `cd /Volumes/development/vf-cmdb/frontend && npm install && npm run build`
  (= `tsc -b && vite build`; type errors fail the build).
- Frontend tests: `cd /Volumes/development/vf-cmdb/frontend && npx vitest run`
  (Vitest 2.1.9, happy-dom, setup `frontend/src/test/setup.ts`; single-run only).
- Backend tests (from `/Volumes/development/vf-cmdb/backend`, kill stray pytest
  first via `ps aux|grep pytest|grep -v grep`):
  `POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_USER=vfcmdb POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb_test .venv/bin/pytest -q`
  (MUST be `vfcmdb_test`, never `vfcmdb`; ~4 min).
- Do NOT rely on the live dev Postgres `vf_cmdb_dev` (schema 0043, incompatible
  with HEAD 0037); use `vfcmdb_test` which conftest.py manages independently.
- Podman CLI at `/opt/homebrew/bin/podman`.
- After editing `backend/**` or `frontend/**`: `./cbindex build` from repo root.
- YAML workflows: validate they parse (e.g. `python -c "import yaml,sys;
  yaml.safe_load(open(f))"` for each). Do NOT attempt to actually publish.

## Downstream stop contract

The implement-and-review loop gates on
`/Volumes/development/vf-cmdb/.kiro/specs/deploy-and-auto-update/review.json`
with jsonPath `verdict` == `APPROVED`. Each task below states per-task tests so
the coder implements task-by-task and the reviewer can gate on it.

---

## Task A — Kiro config alignment (docs/config only; no app code)

- [ ] A1. Correct `.kiro/steering/tech.md`: Alembic head `0037_physical_asset_theme_names`
      (not `0005`); REMOVE the "No automated test framework is installed" claim and
      state pytest (backend, vs `vfcmdb_test` on `127.0.0.1:55432`) + Vitest 2.1.9 +
      happy-dom (frontend) are present, with the exact single-run commands from the
      Verification section; note the deployed backend self-migrates + self-seeds on
      start via `backend/entrypoint.sh`; add dev-loop ports (Vite 5173, dev Postgres
      `vf_cmdb_dev` on host 55432, dev backend `vf_cmdb_backend_dev` via
      `backend/dev-container.sh`, Semaphore 3000); list the full `deploy-podman.sh`
      subcommands incl. restart/build/ps/recover. Leave all hard-rule content
      unchanged.
      Files: `.kiro/steering/tech.md`
      Verify: `grep -nE "0005|No automated test framework" .kiro/steering/tech.md`
      returns nothing; the file names `0037_physical_asset_theme_names` and both
      test commands.

- [ ] A2. Correct `.kiro/steering/structure.md`: change "`0001..0005` migrations" to
      "`0001..0037`".
      Files: `.kiro/steering/structure.md`
      Verify: `grep -n "0001..0037" .kiro/steering/structure.md` matches; no `0005`
      remains in the migrations line.

- [ ] A3. Add `BACKLOG.md` to the memory-artifacts list in
      `.kiro/steering/memory-protocol.md` (the four-artifacts section becomes five,
      or BACKLOG is added as the tracked pending-work home).
      Files: `.kiro/steering/memory-protocol.md`
      Verify: `grep -n "BACKLOG.md" .kiro/steering/memory-protocol.md` matches.

- [ ] A4. Verify + rewrite the 3 hooks to Kiro's REAL hook schema. The files
      already use the current v1 envelope
      `{version:"v1", hooks:[{name, trigger, matcher?, action:{type, command|prompt}}]}`
      (confirmed against the Kiro 1.0 / CLI v3 format). CONFIRM the exact supported
      trigger enum values before changing any `trigger` string; if a specific
      trigger (`SessionStart`/`PostTaskExec`/`PostFileSave`) cannot be confirmed from
      the Kiro hook UI/docs, KEEP the file and add a top-level note rather than
      inventing a trigger that silently never fires. Make `refresh-codebase-index`
      repo-relative — drop the hard-coded `/Volumes/development/vf-cmdb` (use a
      relative `./cbindex build`). Add a test run to `update-session-state`'s prompt
      (backend pytest + frontend vitest alongside the existing build check).
      Files: `.kiro/hooks/refresh-codebase-index.kiro.hook`,
      `.kiro/hooks/update-session-state.kiro.hook`,
      `.kiro/hooks/session-start-memory.kiro.hook`
      Verify: each file is valid JSON — `for f in .kiro/hooks/*.kiro.hook; do python -c "import json,sys;json.load(open(sys.argv[1]))" "$f"; done`;
      `grep -R "/Volumes/development" .kiro/hooks/` returns nothing.

- [ ] A5. Update `.kiro/skills/add-entity/SKILL.md`: change the migration step to
      discover the current head from `backend/alembic/versions/` (currently
      `0037_physical_asset_theme_names`) instead of hard-coding `0005_site_redesign`;
      add a test step (backend pytest + frontend vitest); mention the
      `theme_name`/`theme_category` columns + `useThemePicker` pattern now standard
      for physical assets.
      Files: `.kiro/skills/add-entity/SKILL.md`
      Verify: `grep -n "0005_site_redesign" .kiro/skills/add-entity/SKILL.md` returns
      nothing; the file mentions `theme_name` and a test step.

- [ ] A6. Update `.kiro/skills/local-test-loop/SKILL.md`: add the dev loop
      (containerized dev backend `vf_cmdb_backend_dev`, Vite 5173) and the exact
      pytest/vitest single-run commands from the Verification section.
      Files: `.kiro/skills/local-test-loop/SKILL.md`
      Verify: `grep -n "vitest\|pytest" .kiro/skills/local-test-loop/SKILL.md` matches.

- [ ] A7. Mark `.kiro/specs/rack-back-and-cabling/tasks.md` checkboxes done (`[x]`) —
      that work shipped. Flip `[-]`/`[ ]`/`[ ]*` task lines to `[x]`.
      Files: `.kiro/specs/rack-back-and-cabling/tasks.md`
      Verify: `grep -nE "^\s*- \[( |-)\]" .kiro/specs/rack-back-and-cabling/tasks.md`
      returns nothing (all checkboxes are `[x]`).

Task A tests: no code change — the greps above are the gate. (This is config/docs
only; the build/test commands are unaffected.)

---

## Task B — BACKLOG.md + spec tasks.md + SESSION_STATE cleanup

- [ ] B1. Create `/Volumes/development/vf-cmdb/BACKLOG.md` grouped into
      **Deferred / Won't-do (+why) / Known-issues / Future-enhancements /
      Shipped-but-was-untracked**, capturing:
      (a) combine `theme_name` into `deviceLinkCol` dashboard-link cells
      (VM `vf_short_name`; PhysicalServer/Workstation `vf_long_name`) — Deferred;
      (b) Cable excluded from theme names — Won't-do (label fully computed from the
      two connected devices);
      (c) Region has no `theme_name` — out of scope;
      (d) Reference section excluded from fantastic names — Won't-do (taxonomy/audit
      data);
      (e) `AgGridPopupEditor.integration.test.tsx` intermittently flaky under
      full-suite load — Known-issue (pre-existing);
      (f) ~1.48 MB frontend single-chunk bundle warning (no manualChunks /
      chunkSizeWarningLimit) — Known-issue;
      (g) Future-enhancements wishlist from SESSION_STATE.md (Bitwarden CLI
      auto-fetch, multi-site expansion, PDF/Excel export, RBAC, topology diagram,
      alerts, backup automation, bulk CSV import);
      plus a Shipped-but-was-untracked note that rack-back-and-cabling SHIPPED. Also
      migrate the still-open "Next" items from SESSION_STATE.md
      (`PortConfigView`/`owner_device_*` polymorphism gap; Ansible/Semaphore
      ad-hoc-run limitation) as Deferred checkboxes.
      Files: `BACKLOG.md`
      Verify: `test -f BACKLOG.md` and `grep -nE "Deferred|Won.t-do|Known|Future|Shipped" BACKLOG.md` matches all five groups.

- [ ] B2. Ensure `/Volumes/development/vf-cmdb/.kiro/specs/deploy-and-auto-update/tasks.md`
      exists and mirrors Tasks C–G of this plan (one section per task with checkbox
      sub-items and the per-task verification).
      Files: `.kiro/specs/deploy-and-auto-update/tasks.md`
      Verify: `test -f .kiro/specs/deploy-and-auto-update/tasks.md`; it references
      Tasks C, D, E, F, G.

- [ ] B3. Trim `SESSION_STATE.md` stale "Immediate Next Steps" (Phase 3 BUG-A..D,
      "PENDING: Proxmox"), the "Future Enhancements" block, and any `/home/ubuntu`
      paths — replace with a pointer to `BACKLOG.md`. KEEP the dated round history
      (do not delete historical content wholesale; correct stale specifics in place).
      Files: `SESSION_STATE.md`
      Verify: `grep -n "/home/ubuntu" SESSION_STATE.md` returns nothing; the file
      points to `BACKLOG.md`; the dated round entries remain.

Task B tests: no code change — the greps/`test -f` above are the gate.

---

## Task C — Backend version awareness (Task C + GitHub lookup)

- [ ] C1. Create `backend/app/version.py` with a frozen `VersionInfo`
      dataclass and an `@lru_cache get_version_info()` resolving
      `{version, git_sha, built_at}` from env `VF_VERSION`/`VF_GIT_SHA`/`VF_BUILT_AT`
      with fallbacks `"dev"`/`"unknown"`/`"unknown"` (empty-string treated as unset).
      Files: `backend/app/version.py`
      Verify: `python -c "from app.version import get_version_info; print(get_version_info())"`
      from `backend/` prints `dev`/`unknown` with no env set.

- [ ] C2. Create `backend/app/updates.py` owning the update concerns:
      `parse_semver`/`is_newer` (pure, strictly-newer, `^v?(\d+)\.(\d+)\.(\d+)`),
      a 10-min-TTL cached `latest_release_tag()` (anonymous
      `https://api.github.com/repos/jallamasc/vf-cmdb/releases/latest`, `httpx`
      timeout ~4s, returns last-good on any failure WITHOUT advancing the cache
      timestamp — SILENT), a `_normalize_tag`, and the marker/status file I/O:
      `UPDATE_DIR = Path(os.getenv("VF_UPDATE_DIR", "/var/lib/vf-cmdb"))`, `MARKER =
      UPDATE_DIR/"update.request"`, `STATUS = UPDATE_DIR/"update.status"`, plus
      `_read_status(default_state)` returning the camelCase shape
      `{state,message,requestedVersion,startedAt,finishedAt}` (absent/garbage →
      default_state).
      Files: `backend/app/updates.py`
      Verify: covered by C5 pytest.

- [ ] C3. Source the FastAPI `version=` from `version.py` in `backend/app/main.py`
      (replace the hard-coded `"1.0.0"`).
      Files: `backend/app/main.py`
      Verify: `grep -n '"1.0.0"' backend/app/main.py` returns nothing; backend
      imports (`python -c "from app.main import app"` from `backend/`).

- [ ] C4. Add `GET {api_prefix}/meta/version` to `backend/app/routers/special.py`
      (same router that owns `/meta/entities`). It returns
      `{version, gitSha, builtAt, latest, latestTag, updateAvailable}`; `latest` is
      `null` and `updateAvailable` false when the GitHub lookup is unavailable. The
      browser calls THIS endpoint; the backend does the GitHub lookup server-side
      (browser never calls GitHub directly). Also add
      `POST {api_prefix}/admin/update` (writes the marker file via `updates.py`,
      returns `_read_status(default_state="requested")`, 503 with
      "is /var/lib/vf-cmdb mounted?" on OSError) and
      `GET {api_prefix}/admin/update/status` (returns `_read_status("idle")`) — see
      Task E for the host side. `to_tag` in the marker is advisory only.
      Files: `backend/app/routers/special.py`
      Verify: covered by C5 pytest; routes resolve before the generic catch-all
      (they inherit `special.router`'s existing first-registration).

- [ ] C5. Add `backend/tests/test_version_updates.py` (follow the
      `httpx.ASGITransport(app=app)` + client-fixture pattern of
      `test_automation_endpoints.py`; the semver/version-info/`_read_status` cases
      need NO DB and run as plain functions). Cover: the AC-10 `is_newer` table
      (true/false/false/safe-false) + `parse_semver("1.2") is None` +
      `parse_semver("v1.2.3.4") == (1,2,3)`; `get_version_info` env set/unset/empty;
      `latest_release_tag` success/timeout/403/404/bad-JSON via
      `httpx.MockTransport` or monkeypatch → each yields `latest=null,
      updateAvailable=false`; `/meta/version` response shape; marker-write +
      `_read_status` against a `tmp_path` `VF_UPDATE_DIR` (monkeypatch
      `updates.UPDATE_DIR`); POST returns `requested`, GET-before-script returns
      `idle` (finding 4).
      Files: `backend/tests/test_version_updates.py`
      Verify: backend pytest (exact command above) — the new file passes and the
      full suite stays green.

- [ ] C6. Add the migration-cannot-be-rolled-back caveat as a comment adjacent to
      the version/update code (code layer of the 3-layer rule), naming
      `deploy/scripts/vf-cmdb-backup.sh` as the only true rollback.
      Files: `backend/app/updates.py` (or `special.py` near the admin routes)
      Verify: `grep -n "backup\|roll" backend/app/updates.py` matches.

Task C gate: backend pytest green including `test_version_updates.py`; `./cbindex build`.

---

## Task D — Frontend version + update-available indicator

- [ ] D1. Add the Vite `define` and `import pkg from "./package.json"` to
      `frontend/vite.config.ts` as a NEW top-level key ALONGSIDE the existing
      `plugins`/`server`/`test` keys and the `/// <reference types="vitest" />`
      header (do NOT drop/alter any of them): `__APP_VERSION__` =
      `JSON.stringify(process.env.VF_VERSION || pkg.version || "dev")`,
      `__APP_GIT_SHA__` = `JSON.stringify(process.env.VF_GIT_SHA || "unknown")`.
      Declare `declare const __APP_VERSION__: string;` and `__APP_GIT_SHA__` in
      `frontend/src/vite-env.d.ts`. Do NOT touch any tsconfig (vite.config.ts is
      outside `tsc -b`; finding 1).
      Files: `frontend/vite.config.ts`, `frontend/src/vite-env.d.ts`
      Verify: `cd frontend && npm run build` succeeds (tsc -b + vite build) with
      `server` and `test` blocks intact.

- [ ] D2. Add typed methods + interfaces to `frontend/src/api.ts`: `MetaVersion`
      (`version,gitSha,builtAt,latest,latestTag,updateAvailable`), `UpdateStatus`
      (`state:"idle"|"requested"|"running"|"succeeded"|"failed", message,
      requestedVersion, startedAt, finishedAt`), and `metaVersion()`,
      `requestUpdate()` (POST), `updateStatus()` on the `api` object, all via the
      shared `handle()` and `${BASE}` (`/api/v1`). Add NO global
      QueryCache.onError/boundary.
      Files: `frontend/src/api.ts`
      Verify: `cd frontend && npm run build` succeeds.

- [ ] D3. Create `frontend/src/components/VersionFooter.tsx` and mount it in the
      `Layout.tsx` footer (replacing/augmenting the "Single-user · No auth · Home
      network" line). It `useQuery`s `api.metaVersion` (`refetchInterval: 60_000`,
      `refetchOnWindowFocus: true`, `retry: false`, modest `staleTime`), shows
      `v{running}` with `running = data?.version ?? __APP_VERSION__`, and renders an
      `UpdateBadge` ONLY when `data?.updateAvailable && data.latest`. `UpdateBadge`
      is a small non-modal pill ("Update available → vX.Y.Z") + an accessible
      "Update now" button (button semantics, aria-label). On query failure `data` is
      undefined → version only, no badge, no throw (silent degrade). The "Update
      now" flow: `useMutation(api.requestUpdate)` → poll `api.updateStatus` every 3s;
      treat `requested` + a transient `idle`/absent window right after POST as "still
      starting" NOT "failed" (finding 4); disable/grey "Update now" while
      `state==="running"` (finding 3); render `requestedVersion ?? "latest"` for a
      null target; stop polling on `succeeded`/`failed` and invalidate
      `meta-version` on success.
      Files: `frontend/src/components/VersionFooter.tsx`,
      `frontend/src/components/Layout.tsx`
      Verify: `cd frontend && npm run build` succeeds.

- [ ] D4. Add `frontend/src/components/VersionFooter.test.tsx` (Vitest + happy-dom,
      API stubbed, wrapped in a `QueryClientProvider`): running==latest → no badge;
      newer latest → badge names the version; `metaVersion` rejects → version only,
      no badge, no crash; post-click status transitions incl. the
      requested→idle→running "still starting" case (finding 4) and the disabled
      button while running (finding 3).
      Files: `frontend/src/components/VersionFooter.test.tsx`
      Verify: `cd frontend && npx vitest run` — new tests pass and the suite stays
      green.

Task D gate: `npm run build` + `npx vitest run` green; `./cbindex build`.

---

## Task E — One-click update plumbing (host side)

(The backend POST/GET endpoints land in Task C4; this task is the host-side
pull-not-build update path + systemd wiring.)

- [ ] E1. Rework `deploy/scripts/vf-cmdb-update.sh` to a PULL-not-build registry
      model as the primary path (default `VF_UPDATE_MODE=registry`; preserve the
      legacy git-pull-and-rebuild flow behind `VF_UPDATE_MODE=source`). Flow:
      preflight fail-fast if `jq`/`curl` missing (write `state:"failed"` "jq not
      installed on host" and exit non-zero); `flock` on `$STATE_DIR/update.lock`;
      `write_status running "Taking pre-update database backup"` →
      `deploy/scripts/vf-cmdb-backup.sh` (keep backup on failure); capture
      CURRENT_VERSION from `/api/v1/meta/version`; `podman auto-update` (pull, no
      build); `systemctl --user daemon-reload` + restart the 4 user services;
      health-check the NEW `/api/v1/meta/version` for up to 180s (60×3s) requiring
      HTTP 200 + a parseable `.version`; classify per the design outcome table
      ("version advanced" / "digest refreshed same version" / "already up to date"
      all = `succeeded`; only no-healthy-200 within budget = `failed`). Atomic
      status writes via `jq -n` write-then-`mv`; camelCase keys
      `{state,message,requestedVersion,startedAt,finishedAt}` exactly; remove the
      marker on completion; never delete the backup; add a `--dry-run` flag. State
      the migration-cannot-be-rolled-back caveat in a script comment + the failure
      message (points at `vf-cmdb-restore.sh`).
      Files: `deploy/scripts/vf-cmdb-update.sh`
      Verify: `bash -n deploy/scripts/vf-cmdb-update.sh` (syntax OK); the status
      JSON contract matches the backend `_read_status` keys (same camelCase); if
      `shellcheck` is available, it reports no errors.

- [ ] E2. Add `deploy/systemd/vf-cmdb-update.path` (user unit) with
      `[Path] PathChanged=%h/vf-cmdb/state/update.request`,
      `Unit=vf-cmdb-update.service`, and `[Install] WantedBy=default.target`. Rework
      `deploy/systemd/vf-cmdb-update.service` to run the script in registry mode:
      `Type=oneshot`, `Environment=VF_UPDATE_MODE=registry`,
      `Environment=STATE_DIR=%h/vf-cmdb/state`,
      `ExecStart=%h/vf-cmdb/deploy/scripts/vf-cmdb-update.sh`, `TimeoutStartSec=1800`,
      NO `[Install]` (pulled by the `.path` + the retained daily `.timer`). Keep the
      daily `vf-cmdb-update.timer`.
      Files: `deploy/systemd/vf-cmdb-update.path`,
      `deploy/systemd/vf-cmdb-update.service`
      Verify: `test -f deploy/systemd/vf-cmdb-update.path`; the `.service` has no
      `[Install]` section (`grep -n "\[Install\]" deploy/systemd/vf-cmdb-update.service`
      returns nothing); `PathChanged` targets `%h/vf-cmdb/state/update.request`.

Task E gate: `bash -n` on the script; unit files present and consistent; backend
pytest (from Task C5) still green since it covers the marker/status contract.

---

## Task F — CI + registry + Quadlet repoint

- [ ] F1. Add `.github/workflows/build.yml`: on push to `master`, a `backend`+
      `frontend` matrix builds each Containerfile and pushes
      `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}:edge` + `:sha-<shortsha>` using
      `docker/login-action` + `docker/build-push-action` with `GITHUB_TOKEN` and
      `packages: write`; pass `build-args` `VF_VERSION=0.0.0-edge`,
      `VF_GIT_SHA=<shortsha>`, `VF_BUILT_AT=<commit timestamp>`. No `:latest`, no
      Release.
      Files: `.github/workflows/build.yml`
      Verify: `python -c "import yaml;yaml.safe_load(open('.github/workflows/build.yml'))"`.

- [ ] F2. Add `.github/workflows/release.yml`: on `push` tag `v*` OR
      `workflow_dispatch{version}`, build+push `:latest` + `:vX.Y.Z` for both
      components and create a GitHub Release via `softprops/action-gh-release@v2`
      (`tag_name: v<version>`, `target_commitish: github.sha`,
      `generate_release_notes: true`). Honor finding 5: do NOT force latest
      backward; tag-push is primary, dispatch is fallback. `permissions:
      contents: write, packages: write`.
      Files: `.github/workflows/release.yml`
      Verify: `python -c "import yaml;yaml.safe_load(open('.github/workflows/release.yml'))"`.

- [ ] F3. Add `ARG VF_VERSION/VF_GIT_SHA/VF_BUILT_AT` → `ENV …` to
      `backend/Containerfile` (after `COPY . .`) so `version.py` reads them at
      runtime (fallbacks keep a plain build at `dev`/`unknown`). Add
      `ARG VF_VERSION/VF_GIT_SHA` + `ENV` to the `build` stage of
      `frontend/Containerfile` so Vite bakes `__APP_VERSION__` at build; the nginx
      serve stage needs nothing.
      Files: `backend/Containerfile`, `frontend/Containerfile`
      Verify: `grep -n "VF_VERSION" backend/Containerfile frontend/Containerfile`
      matches both files.

- [ ] F4. Repoint `deploy/quadlet/vf-cmdb-backend.container` and
      `deploy/quadlet/vf-cmdb-frontend.container`: change ONLY the `Image=` line to
      `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}:latest`, ADD
      `AutoUpdate=registry`, and (backend only) ADD
      `Volume=%h/vf-cmdb/state:/var/lib/vf-cmdb:Z`. PRESERVE everything else
      (backend's `Network=vf-cmdb.network:alias=backend` alias, ports, Restart,
      `[Install]`).
      Files: `deploy/quadlet/vf-cmdb-backend.container`,
      `deploy/quadlet/vf-cmdb-frontend.container`
      Verify: `grep -n "ghcr.io/jallamasc/vf-cmdb-backend:latest\|AutoUpdate=registry\|/var/lib/vf-cmdb" deploy/quadlet/vf-cmdb-backend.container`
      matches all three; the `alias=backend` line is still present.

- [ ] F5. Mark `deploy/ci-templates/README.md` as SUPERSEDED by
      `.github/workflows/` (one-line banner; leave template files in place). Update
      `.env.example` key NAMES only if a new key is genuinely needed (add
      `VF_UPDATE_DIR` with a commented example, no secret value).
      Files: `deploy/ci-templates/README.md`, `.env.example`
      Verify: `grep -n "SUPERSEDED" deploy/ci-templates/README.md` matches.

Task F gate: both workflow YAMLs parse; Containerfile/quadlet greps pass. Do NOT
publish. (No app code changed, so no cbindex/test change required for F alone.)

---

## Task G — Docs + finalize

- [ ] G1. Update `docs/DEPLOYMENT_MANUAL.md` + `docs/OPERATIONS.md` for the ghcr.io
      pull-based Quadlet deploy: the from-scratch "deploy anywhere from pre-built
      ghcr.io images" procedure; the one-time host state-dir + `.path` enablement
      (finding 2: `mkdir -p ~/vf-cmdb/state`; `systemctl --user daemon-reload`;
      `systemctl --user enable --now vf-cmdb-update.path`; dir must pre-exist before
      the backend container starts and before enabling the `.path`); the
      `.path`-drops-an-in-flight-click behavior (finding 3); release-by-tag primary
      + manual `workflow_dispatch` fallback with the "only release a version >=
      current latest / don't move latest backward" caveat (finding 5); the
      notify/one-click update flow (notify-and-apply, never auto-apply); the
      migration-cannot-be-rolled-back caveat prominently (re-pulling an older image
      does not undo `alembic upgrade head`; `vf-cmdb-backup.sh`/`vf-cmdb-restore.sh`
      is the only rollback); the no-auth trust model; and the one-time
      "flip the GHCR package to PUBLIC after the first release" note.
      Files: `docs/DEPLOYMENT_MANUAL.md`, `docs/OPERATIONS.md`
      Verify: `grep -niE "ghcr.io|state dir|vf-cmdb-update.path|rollback|workflow_dispatch" docs/DEPLOYMENT_MANUAL.md docs/OPERATIONS.md`
      matches each topic.

- [ ] G2. Refresh `SESSION_STATE.md` with a new dated round entry (status, current
      HEAD, what shipped for this feature). Update `MEMORY_BANK.md` only if a hard
      rule changed (it did not — leave unless needed).
      Files: `SESSION_STATE.md`
      Verify: the new dated entry names the deploy-and-auto-update feature and the
      current HEAD.

- [ ] G3. Run `./cbindex build` from repo root; commit everything in Conventional
      Commits (per-task commits are fine). Do NOT push.
      Files: (index refresh + git)
      Verify: `./cbindex build` succeeds; `git -P log --oneline -n 10` shows the
      feature commits.

Task G gate: docs greps pass; `./cbindex build` succeeds; working tree committed.

---

## Suggested commit sequence (Conventional Commits)

1. `docs(kiro): align steering/skills/hooks with live repo (Task A)`
2. `docs: add BACKLOG.md + spec tasks + session-state cleanup (Task B)`
3. `feat(backend): add version endpoint + GitHub update detection (Task C)`
4. `feat(frontend): show running version + update-available badge (Task D)`
5. `feat(deploy): pull-not-build host update script + systemd .path (Task E)`
6. `ci: add build/release workflows; repoint Quadlet to ghcr.io (Task F)`
7. `docs: deploy/operations for ghcr pull deploy + one-click update (Task G)`

Each commit must leave the repo buildable and its task's verification green
before moving on.
