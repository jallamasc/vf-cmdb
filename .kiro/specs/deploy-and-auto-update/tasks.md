# Tasks — Deploy Anywhere + In-App Version Awareness & One-Click Update

This is the task checklist for the APPROVED spec at
`.kiro/specs/deploy-and-auto-update/{requirements,design,plan}.md`. It mirrors
the dependency-ordered plan: Tasks A & B (Kiro config + backlog, docs/config
only) are tracked as **FEAT-001** and done first; Tasks C–G below are the code
and deploy work (FEAT-002..005). Work on `master` directly, never `git push`.

Per-task verification commands come from `plan.md` → "Verification commands
(exact)" and `context.json`. Frontend build = `cd frontend && npm run build`
(`tsc -b && vite build`); frontend tests = `cd frontend && npx vitest run`;
backend tests (from `backend/`, kill stray pytest first) =
`POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_USER=vfcmdb POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb_test .venv/bin/pytest -q`.
After editing `backend/**` or `frontend/**`: `./cbindex build` from repo root.

See `plan.md` for the full per-item detail; this file is the actionable
checklist and the per-task gate.

---

## Task A & B — Kiro config alignment + backlog (FEAT-001, docs/config only)

Tracked in `features/FEAT-001.json`. Correct stale steering/skills/hooks, create
`BACKLOG.md` and this `tasks.md`, trim `SESSION_STATE.md`. No app code; the greps
in FEAT-001's `verification` are the gate.

---

## Task C — Backend version awareness + GitHub update detection

- [ ] C1. `backend/app/version.py` — frozen `VersionInfo` dataclass +
      `@lru_cache get_version_info()` resolving `{version, git_sha, built_at}`
      from `VF_VERSION`/`VF_GIT_SHA`/`VF_BUILT_AT` (empty string = unset;
      fallbacks `dev`/`unknown`/`unknown`).
- [ ] C2. `backend/app/updates.py` — `parse_semver`/`is_newer` (pure, strictly
      newer, `^v?(\d+)\.(\d+)\.(\d+)`); 10-min-TTL cached `latest_release_tag()`
      (anonymous GitHub releases/latest, ~4s timeout, returns last-good on any
      failure WITHOUT advancing the cache timestamp — SILENT); `_normalize_tag`;
      marker/status file I/O under `UPDATE_DIR` (`VF_UPDATE_DIR`, default
      `/var/lib/vf-cmdb`), `MARKER`, `STATUS`, and `_read_status(default_state)`
      returning the camelCase shape
      `{state,message,requestedVersion,startedAt,finishedAt}`.
- [ ] C3. Source FastAPI `version=` from `version.py` in `backend/app/main.py`
      (replace hard-coded `"1.0.0"`).
- [ ] C4. Add to `backend/app/routers/special.py` (owns `/meta/entities`, wins
      over the generic catch-all): `GET {api_prefix}/meta/version`
      (`{version,gitSha,builtAt,latest,latestTag,updateAvailable}`; `latest` null
      / `updateAvailable` false when GitHub unavailable — browser never calls
      GitHub directly), `POST {api_prefix}/admin/update` (writes the marker,
      returns `_read_status("requested")`, 503 on OSError), and
      `GET {api_prefix}/admin/update/status` (`_read_status("idle")`).
- [ ] C5. `backend/tests/test_version_updates.py` — follow the
      `httpx.ASGITransport(app=app)` client-fixture pattern of
      `test_automation_endpoints.py`. Cover the `is_newer` AC-10 table +
      `parse_semver` edge cases; `get_version_info` set/unset/empty;
      `latest_release_tag` success/timeout/403/404/bad-JSON → each yields
      `latest=null, updateAvailable=false`; `/meta/version` shape; marker-write +
      `_read_status` against a `tmp_path` `VF_UPDATE_DIR`; POST→`requested`,
      GET-before-script→`idle` (finding 4).
- [ ] C6. Migration-cannot-be-rolled-back caveat as a code comment adjacent to
      the version/update code, naming `deploy/scripts/vf-cmdb-backup.sh` as the
      only true rollback (code layer of the 3-layer rule).

Gate: backend pytest green incl. `test_version_updates.py`; `./cbindex build`.

---

## Task D — Frontend version + update-available indicator

- [ ] D1. `frontend/vite.config.ts` — add a `define` key + `import pkg from
      "./package.json"` ALONGSIDE the preserved `plugins`/`server`/`test` keys
      and the `/// <reference types="vitest" />` header:
      `__APP_VERSION__ = JSON.stringify(process.env.VF_VERSION || pkg.version ||
      "dev")`, `__APP_GIT_SHA__ = JSON.stringify(process.env.VF_GIT_SHA ||
      "unknown")`. Declare both in `frontend/src/vite-env.d.ts`. Do NOT touch any
      tsconfig (vite.config.ts is outside `tsc -b`; finding 1).
- [ ] D2. `frontend/src/api.ts` — `MetaVersion` + `UpdateStatus` interfaces and
      `metaVersion()`, `requestUpdate()` (POST), `updateStatus()` on the `api`
      object, all via the shared `handle()` and `${BASE}` (`/api/v1`). No global
      QueryCache.onError / boundary.
- [ ] D3. `frontend/src/components/VersionFooter.tsx` + mount in `Layout.tsx`
      footer. `useQuery(api.metaVersion)` (`refetchInterval: 60_000`,
      `refetchOnWindowFocus: true`, `retry: false`); show
      `v{data?.version ?? __APP_VERSION__}`; render `UpdateBadge` ONLY when
      `data?.updateAvailable && data.latest`. "Update now" →
      `useMutation(api.requestUpdate)` → poll `api.updateStatus` every 3s; treat
      `requested` + a transient idle/absent window right after POST as "still
      starting" NOT "failed" (finding 4); disable/grey while `state==="running"`
      (finding 3); stop polling on succeeded/failed; invalidate `meta-version` on
      success. Silent degrade on query failure (version only, no badge, no throw).
- [ ] D4. `frontend/src/components/VersionFooter.test.tsx` — Vitest + happy-dom,
      API stubbed, wrapped in `QueryClientProvider`: running==latest → no badge;
      newer latest → badge names the version; `metaVersion` rejects → version
      only, no badge, no crash; the requested→idle→running "still starting" case
      (finding 4) and the disabled button while running (finding 3).

Gate: `npm run build` + `npx vitest run` green; `./cbindex build`.

---

## Task E — One-click update plumbing (host side)

- [ ] E1. Rework `deploy/scripts/vf-cmdb-update.sh` to a PULL-not-build registry
      model (default `VF_UPDATE_MODE=registry`; keep the legacy
      git-pull-and-rebuild flow behind `VF_UPDATE_MODE=source`). Preflight
      fail-fast if `jq`/`curl` missing; `flock` on `$STATE_DIR/update.lock`;
      pre-update backup via `vf-cmdb-backup.sh` (keep on failure); `podman
      auto-update` (pull, no build); `systemctl --user daemon-reload` + restart
      the 4 user services; health-check the NEW `/api/v1/meta/version` up to 180s
      (60×3s) requiring HTTP 200 + parseable `.version`; classify per the design
      outcome table; atomic `jq -n` write-then-`mv` status with the exact
      camelCase keys; remove the marker on completion; never delete the backup;
      add `--dry-run`. State the migration-cannot-be-rolled-back caveat in a
      comment + the failure message (points at `vf-cmdb-restore.sh`).
- [ ] E2. Add `deploy/systemd/vf-cmdb-update.path` (user unit,
      `PathChanged=%h/vf-cmdb/state/update.request`,
      `Unit=vf-cmdb-update.service`, `[Install] WantedBy=default.target`). Rework
      `vf-cmdb-update.service` for registry mode (`Type=oneshot`,
      `Environment=VF_UPDATE_MODE=registry`,
      `Environment=STATE_DIR=%h/vf-cmdb/state`, `ExecStart=…/vf-cmdb-update.sh`,
      `TimeoutStartSec=1800`, NO `[Install]`). Keep the daily
      `vf-cmdb-update.timer`.

Gate: `bash -n deploy/scripts/vf-cmdb-update.sh`; `.path` present and the
`.service` has no `[Install]`; backend pytest (C5) still green (it covers the
marker/status contract).

---

## Task F — CI + registry + Quadlet repoint

- [ ] F1. `.github/workflows/build.yml` — on push to `master`, a
      `backend`+`frontend` matrix builds each Containerfile and pushes
      `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}:edge` + `:sha-<shortsha>`
      (`docker/login-action` + `docker/build-push-action`, `GITHUB_TOKEN`,
      `packages: write`); `build-args` `VF_VERSION=0.0.0-edge`,
      `VF_GIT_SHA=<shortsha>`, `VF_BUILT_AT=<commit timestamp>`. No `:latest`, no
      Release.
- [ ] F2. `.github/workflows/release.yml` — on tag `v*` OR
      `workflow_dispatch{version}`, build+push `:latest` + `:vX.Y.Z` for both
      components and create a GitHub Release via `softprops/action-gh-release@v2`.
      Finding 5: do NOT move latest backward; tag-push primary, dispatch
      fallback. `permissions: contents: write, packages: write`.
- [ ] F3. `backend/Containerfile` — `ARG VF_VERSION/VF_GIT_SHA/VF_BUILT_AT` →
      `ENV` (after `COPY . .`). `frontend/Containerfile` — `ARG
      VF_VERSION/VF_GIT_SHA` + `ENV` in the `build` stage (nginx serve stage
      needs nothing).
- [ ] F4. Repoint `deploy/quadlet/vf-cmdb-{backend,frontend}.container`: change
      ONLY `Image=` to `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}:latest`, ADD
      `AutoUpdate=registry`, and (backend only) ADD
      `Volume=%h/vf-cmdb/state:/var/lib/vf-cmdb:Z`. PRESERVE everything else
      (backend's `Network=vf-cmdb.network:alias=backend`, ports, Restart,
      `[Install]`).
- [ ] F5. Mark `deploy/ci-templates/README.md` SUPERSEDED by
      `.github/workflows/` (one-line banner; leave template files). Add
      `VF_UPDATE_DIR` key NAME (commented, no secret) to `.env.example` if needed.

Gate: both workflow YAMLs parse (`python -c "import yaml;yaml.safe_load(open(f))"`);
Containerfile/quadlet greps pass. Do NOT publish.

---

## Task G — Docs + finalize

- [ ] G1. Update `docs/DEPLOYMENT_MANUAL.md` + `docs/OPERATIONS.md` for the
      ghcr.io pull-based Quadlet deploy: from-scratch "deploy anywhere from
      pre-built ghcr.io images"; one-time host state-dir + `.path` enablement
      (finding 2: `mkdir -p ~/vf-cmdb/state`; `systemctl --user daemon-reload`;
      `systemctl --user enable --now vf-cmdb-update.path`; dir must pre-exist
      before the backend container starts and before enabling the `.path`);
      the `.path`-drops-an-in-flight-click behavior (finding 3); release-by-tag
      primary + manual `workflow_dispatch` fallback with the "only release a
      version >= current latest" caveat (finding 5); the notify/one-click update
      flow (notify-and-apply, never auto-apply); the
      migration-cannot-be-rolled-back caveat prominently (`vf-cmdb-backup.sh` /
      `vf-cmdb-restore.sh` is the only rollback); the no-auth trust model; and the
      one-time "flip the GHCR package to PUBLIC after the first release" note.
- [ ] G2. Refresh `SESSION_STATE.md` with a new dated round entry (status,
      current HEAD, what shipped for this feature). Update `MEMORY_BANK.md` only
      if a hard rule changed (it did not — leave unless needed).
- [ ] G3. Run `./cbindex build` from repo root; commit everything in Conventional
      Commits (per-task commits are fine). Do NOT push.

Gate: docs greps pass; `./cbindex build` succeeds; working tree committed.

---

## Suggested commit sequence (Conventional Commits)

1. `docs(kiro): align steering/skills/hooks with live repo (Task A)`
2. `docs: add BACKLOG.md + spec tasks + session-state cleanup (Task B)`
3. `feat(backend): add version endpoint + GitHub update detection (Task C)`
4. `feat(frontend): show running version + update-available badge (Task D)`
5. `feat(deploy): pull-not-build host update script + systemd .path (Task E)`
6. `ci: add build/release workflows; repoint Quadlet to ghcr.io (Task F)`
7. `docs: deploy/operations for ghcr pull deploy + one-click update (Task G)`
