# Virtualfactor IT CMDB — Operations & Automation Guide

Day-2 operations for the deployed CMDB: how updates flow from code to the host,
how code is continuously reviewed, and the routine commands you'll use.

> ⚠️ **Migrations cannot be rolled back by re-pulling an older image.** The
> backend container runs `alembic upgrade head` on every start, so going back to
> an older image does **not** undo a schema migration that already ran. The only
> true rollback is restoring the pre-update database backup —
> `deploy/scripts/vf-cmdb-backup.sh` (taken automatically before every applied
> update) restored via `deploy/scripts/vf-cmdb-restore.sh`. This caveat is
> repeated wherever an update is described below.

---

## 1. The automation model

The CMDB now ships as **pre-built images on `ghcr.io`** and the host **pulls**
them — it no longer clones the repo and rebuilds on the VM. CI publishes images;
the host follows a tag with `podman auto-update`.

```
   Maintainer                      GitHub Actions                  Deploy host (Podman)
   ───────────────      ──────────────────────────────     ──────────────────────────
   push master       ►  build.yml  → ghcr.io :edge, :sha-*
   tag vX.Y.Z        ►  release.yml → ghcr.io :latest, :vX.Y.Z   vf-cmdb-update.path
   (or dispatch)        + a GitHub Release (make_latest)         + daily .timer
                                                                 └─ podman auto-update
                                                                    ├─ pre-update DB backup
                                                                    ├─ pull :latest images
                                                                    ├─ restart services
                                                                    └─ version-advanced
                                                                       health check
```

Two independent, automatic loops:

1. **Code review loop (GitHub):** every push/PR is linted, type-checked, built,
   and security-scanned. Dependabot proposes dependency bumps weekly.
2. **Deployment loop (host):** images are pulled (never rebuilt) from `ghcr.io`.
   The host applies an update either on demand — the one-click **Update now**
   button in the app footer — or on the daily `vf-cmdb-update.timer`. Every
   applied update takes a pre-update DB backup first and then health-checks that
   the new image's version actually came up.

### The container ↔ host trust boundary

The backend container runs **rootless and never calls `podman` or `systemctl`**.
The one-click update works entirely through a **shared bind-mounted state
directory**: the browser → backend POST writes a *marker file*
(`update.request`); a host-side systemd **`.path` unit** watches that file and
runs the update script, which writes a *status file* (`update.status`) the
backend reads back for the UI. The privileged action stays on the host; the
no-auth container only ever reads and writes files inside its own mount.

---

## 2. Publishing a release (maintainer)

Images live at `ghcr.io/jallamasc/vf-cmdb-backend` and
`ghcr.io/jallamasc/vf-cmdb-frontend`. Two GitHub Actions workflows produce them:

| Workflow | File | Trigger | Publishes |
|----------|------|---------|-----------|
| **build** | `.github/workflows/build.yml` | push to `master` | `:edge` and `:sha-<shortsha>` only. No `:latest`, no Release. |
| **release** | `.github/workflows/release.yml` | push tag `v*` **(primary)** or `workflow_dispatch` **(fallback)** | `:latest` and `:v<version>`, plus a GitHub Release (`make_latest`, auto-generated notes). |

Each image bakes its own version (`VF_VERSION`/`VF_GIT_SHA`/`VF_BUILT_AT` build
args) so the running version the app reports is the image's real version.

### Cut a release

Primary path — push a semver tag:
```bash
git tag v1.6.0
git push origin v1.6.0        # release.yml cuts :latest + :v1.6.0 + a Release
```

Fallback path — run **release.yml** manually (Actions → release → Run workflow)
and supply the version (e.g. `1.6.0`) as the `version` input. This builds the
same images and Release without needing a pushed tag.

> ⚠️ **Never move GitHub "latest" backward.** Only tag/dispatch a version that is
> **≥ the current latest release**. Update detection is a strictly-newer semver
> compare against the GitHub "latest" release, so publishing an *older* version
> as latest would hide real updates (or offer a downgrade) and corrupt the
> notion of "newest". Dispatching or tagging a version that **already exists**
> re-cuts that Release and its images **in place** — it does **not** move the
> tag to the new commit (`softprops/action-gh-release@v2` only creates a tag
> that does not yet exist). Use a fresh, unused version for each new release;
> dispatching an existing version is only for re-cutting that same version.

### One-time: flip the GHCR packages to PUBLIC

The **first** `release.yml` run creates the
`ghcr.io/jallamasc/vf-cmdb-{backend,frontend}` packages **private by default**.
A human must flip each package to **PUBLIC** once in the GitHub package settings
(Package → Package settings → Change visibility → Public) so deploy hosts can
pull **anonymously** (no login, no token). Until flipped, anonymous host pulls
fail: the app degrades silently (no update applied / no badge), but a one-click
**Update now** reports **failed** with an image-pull error. This is a one-time
operational step that cannot be done from the repo.

### Continuous code review (CI)

Push/PR gating (Ruff, `tsc -b && vite build`, CodeQL, Trivy, Dependabot, PR
template) is unchanged — see `.github/` and the project's PR checklist. Merging
to `master` publishes `:edge`/`:sha-*`; it does **not** move `:latest`, so a
merge never auto-updates deploy hosts. Only a tag/dispatch release does.

---

## 3. Updating a deploy host

The host **pulls** pre-built images from `ghcr.io` — it never rebuilds. An
update is applied either on demand (one-click, §3.1) or on the daily timer
(§3.3); both run the same script and take a pre-update backup first.

> ⚠️ **Rollback caveat (repeated):** re-pulling an older image does NOT undo a
> migration — `entrypoint.sh` runs `alembic upgrade head` on every start. The
> pre-update DB backup restored via `deploy/scripts/vf-cmdb-restore.sh` is the
> only true rollback. The update script keeps the backup in every case,
> including on failure.

### 3.1 One-click update from the app (notify-and-apply)

The app footer shows the running version (`v1.5.0`). When the backend's cached
GitHub lookup finds a strictly-newer release, an unobtrusive **"Update available
→ v1.6.0"** pill with an **Update now** button appears next to the version. This
is **notify-and-apply, never auto-apply** — nothing updates until you click.

Clicking **Update now**:
1. POSTs to `/api/v1/admin/update`, which writes the `update.request` marker in
   the shared state dir (no privileged action in the container).
2. The host `vf-cmdb-update.path` unit sees the marker and runs the update
   script, which writes progress to `update.status`.
3. The badge polls the status every ~3 s and shows "Taking backup… / Pulling
   images… / Restarting… / Succeeded / Failed". The backend restarts mid-update,
   so a brief unreachable window is treated as **still running**, not failed —
   the authoritative verdict is the status file, which the health check can take
   up to ~180 s to settle (DB-wait + migrate + seed before the new backend
   answers).

**A click during an in-flight update is intentionally dropped.** The systemd
`.path` unit coalesces rapid marker writes, and the script holds a lock, so a
second click while one run is in flight does nothing. The UI greys the **Update
now** button while `state === "running"`, and there is **no self-retrigger
loop**. If you don't see succeeded/failed yet, wait — don't keep clicking.

If GitHub is unreachable at click time the marker's target tag is `null`; the
host always follows `:latest` regardless, and the UI shows "→ latest" rather
than a blank target.

### 3.2 Manual / on-demand update from the shell

```bash
~/vf-cmdb/deploy/scripts/vf-cmdb-update.sh            # registry mode (default)
~/vf-cmdb/deploy/scripts/vf-cmdb-update.sh --dry-run  # writes statuses, no pull/restart
```

The script (registry mode): preflights `jq`/`curl`, takes a pre-update DB
backup, records the current version, runs `podman auto-update` (pull, no build),
restarts the services, then health-checks the **new** `/api/v1/meta/version`
(HTTP 200 **and** a parseable `.version` — not merely `/health`, which the old
image also answers) for up to 180 s before classifying the outcome as
`succeeded` / `failed`. The legacy git-pull-and-rebuild flow is preserved behind
`VF_UPDATE_MODE=source` for source-built hosts.

### 3.3 The daily timer

`vf-cmdb-update.timer` runs the same script on a daily schedule (a scheduled
`podman auto-update` refresh in addition to the one-click path).

```bash
systemctl --user list-timers 'vf-cmdb-*'
systemctl --user status vf-cmdb-update.service
journalctl --user -u vf-cmdb-update.service -n 100 --no-pager
```

> Note: `vf-cmdb-update.service` is a `oneshot` with **no `[Install]`** section —
> it is pulled by the `.path` unit (one-click) and the `.timer` (daily), never
> enabled directly.

### Pin / freeze automatic updates temporarily

```bash
systemctl --user disable --now vf-cmdb-update.timer   # stop the daily refresh
systemctl --user disable --now vf-cmdb-update.path    # stop one-click applies
systemctl --user enable  --now vf-cmdb-update.timer vf-cmdb-update.path   # resume
```

---

## 4. Routine service management

```bash
# Status of all services
systemctl --user status vf-cmdb-db.service vf-cmdb-backend.service \
                        vf-cmdb-frontend.service vf-cmdb-pgadmin.service

# Follow logs
journalctl --user -u vf-cmdb-backend.service -f

# Restart one service
systemctl --user restart vf-cmdb-backend.service

# Restart the whole stack
systemctl --user restart vf-cmdb-{db,backend,frontend,pgadmin}.service

# Container-level view
podman ps --filter name=vf_cmdb_
podman stats --no-stream
```

> Using the compose fallback (Podman 3.x)? Use `./deploy-podman.sh {ps,logs,restart,down}`
> and `podman restart vf_cmdb_backend` instead of `systemctl --user`.

---

## 5. Health & monitoring quick checks

```bash
curl -fsS http://localhost:8000/health          # backend liveness
curl -fsS http://localhost:8000/api/v1/meta/version   # running + latest version, updateAvailable
curl -fsS http://localhost:8000/api/v1/meta/entities | head
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:8080   # UI 200?
podman healthcheck run vf_cmdb_db                # DB healthcheck
```

The in-app update status mirror:
```bash
cat ~/vf-cmdb/state/update.status                # last update outcome (JSON)
```

---

## 6. Configuration changes

1. Edit `~/vf-cmdb/.env` on the VM.
2. Restart affected services:
   ```bash
   systemctl --user restart vf-cmdb-backend.service vf-cmdb-frontend.service
   ```
`.env` is **not** tracked in git (secrets) and is included in every backup.

---

## 7. Trust model (no auth, by design)

The CMDB has **no authentication** — single user, private LAN. Anyone who can
reach the UI can request an update; that is acceptable because the host has one
user on a private network. Image pulls from `ghcr.io` are **anonymous** (the
packages are public). Do not expose the UI, API, or pgAdmin to the public
internet, and do not add auth unless explicitly required — it is an intentional
design decision, not an oversight.

---

## 8. What to check monthly

- [ ] `systemctl --user list-timers 'vf-cmdb-*'` — the daily update timer scheduled
- [ ] `systemctl --user is-active vf-cmdb-update.path` — one-click watcher active
- [ ] Latest backup exists: `ls -lt ~/vf-cmdb-backups | head`
- [ ] Review & merge Dependabot PRs (green CI)
- [ ] Skim the GitHub **Security** tab (CodeQL/Trivy findings)
- [ ] Confirm a test restore works (see `docs/DISASTER_RECOVERY.md` §5)
