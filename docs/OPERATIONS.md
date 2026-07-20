# Virtualfactor IT CMDB — Operations & Automation Guide

Day-2 operations for the deployed CMDB: how updates flow from code to the VM,
how code is continuously reviewed, and the routine commands you'll use.

---

## 1. The automation model

```
   Developer / VS Code                GitHub                     Test VM (Proxmox)
   ───────────────────      ──────────────────────────     ──────────────────────────
   edit → commit → push  ►  CI runs (lint/build/scan)  ►    vf-cmdb-update.timer (daily)
   open Pull Request        CodeQL + Trivy + Dependabot      └─ git pull master
   review + merge to master review gates on the PR              ├─ rebuild changed images
                                                                ├─ podman auto-update (bases)
                                                                ├─ health check
                                                                └─ auto-rollback on failure
```

Two independent, automatic loops:

1. **Code review loop (GitHub):** every push/PR is linted, type-checked, built,
   and security-scanned. Dependabot proposes dependency bumps weekly.
2. **Deployment loop (VM):** a systemd timer pulls the reviewed `master` branch
   and safely redeploys, with a pre-update backup and health-checked rollback.

---

## 2. Continuous code review (CI/CD)

Configured under `.github/`:

| Workflow | File | What it checks |
|----------|------|----------------|
| **CI** | `.github/workflows/ci.yml` | Backend: Ruff lint/format, byte-compile, import sanity. Frontend: `tsc -b && vite build`. Container builds. Shellcheck on deploy scripts. |
| **CodeQL** | `.github/workflows/codeql.yml` | Deep static security analysis (Python + JS/TS), on push/PR + weekly. |
| **Trivy** | `.github/workflows/security-scan.yml` | CVEs in dependencies, IaC misconfig, base-image vulns → Security tab. |
| **Dependabot** | `.github/dependabot.yml` | Weekly PRs for pip, npm, GitHub Actions, and Docker base images. |
| **PR template** | `.github/pull_request_template.md` | Enforces a review checklist (tests, migrations, docs, rollback). |

> **One-time activation:** the three workflow files ship under
> `deploy/ci-templates/github-workflows/` (an automated commit can't write to
> `.github/workflows/` without the `workflows` permission). Copy them into
> `.github/workflows/` once — see `deploy/ci-templates/README.md`. `dependabot.yml`
> and the PR template are already active.

### Recommended GitHub settings (do once in the repo UI)
- **Settings → Branches → Add rule** for `master`:
  - Require a pull request before merging
  - Require status checks to pass: `Backend`, `Frontend`, `Container images build`
  - Require branches to be up to date before merging
- **Settings → Code security:** enable Dependabot alerts, Dependabot security
  updates, and CodeQL (the workflow auto-registers).

### Developer workflow
```bash
git checkout -b feature/my-change
# ...edit in VS Code...
git commit -am "feat: describe change"
git push -u origin feature/my-change
# open a PR → CI runs → review → merge to master
```
Merging to `master` is all that's required; the VM picks it up automatically (§3).

---

## 3. Automatic updates on the VM

Provided by two user-level systemd units (installed by bootstrap/Ansible):

- `vf-cmdb-update.timer` → runs `vf-cmdb-update.service` **daily at 03:30**
  (with up to 30 min random spread).
- The service runs `deploy/scripts/vf-cmdb-update.sh`, which:
  1. Takes a **pre-update backup** (safety net).
  2. `git fetch` + fast-forward the tracked branch (`master`).
  3. Rebuilds **only** the image(s) whose source changed (backend/frontend).
  4. Reinstalls Quadlet units if `deploy/quadlet/*` changed.
  5. Runs `podman auto-update` to refresh base images (postgres/pgadmin).
  6. Restarts services and **health-checks** `:8000/health`.
  7. **Auto-rolls back** to the previous commit if the health check fails.

### Manual / on-demand update
```bash
~/vf-cmdb/deploy/scripts/vf-cmdb-update.sh
# or the alias set by cloud-init:
cmdb-update
```

### Inspect the timers
```bash
systemctl --user list-timers 'vf-cmdb-*'
systemctl --user status vf-cmdb-update.service
journalctl --user -u vf-cmdb-update.service -n 100 --no-pager
```

### Change the schedule
Edit `~/.config/systemd/user/vf-cmdb-update.timer` (`OnCalendar=`), then:
```bash
systemctl --user daemon-reload
systemctl --user restart vf-cmdb-update.timer
```

### Pin / freeze updates temporarily
```bash
systemctl --user disable --now vf-cmdb-update.timer   # stop auto-updates
systemctl --user enable  --now vf-cmdb-update.timer   # resume
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
curl -fsS http://localhost:8000/api/v1/meta/entities | head
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:8080   # UI 200?
podman healthcheck run vf_cmdb_db                # DB healthcheck
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

## 7. What to check monthly

- [ ] `systemctl --user list-timers 'vf-cmdb-*'` — both timers scheduled
- [ ] Latest backup exists: `ls -lt ~/vf-cmdb-backups | head`
- [ ] Review & merge Dependabot PRs (green CI)
- [ ] Skim the GitHub **Security** tab (CodeQL/Trivy findings)
- [ ] Confirm a test restore works (see `docs/DISASTER_RECOVERY.md` §5)
