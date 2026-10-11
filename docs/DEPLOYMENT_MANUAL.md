# Virtualfactor IT CMDB — Manual First-Time Deployment (Proxmox + Ubuntu 22.04)

This is the **step-by-step manual runbook** for standing up the CMDB test
environment the first time on your Proxmox host, and connecting to it from your
workstation with **VS Code Remote-SSH**.

Once you have done this once, everything here is automated by:
- `deploy/scripts/bootstrap.sh` — one-shot re-deploy on a fresh VM
- `deploy/ansible/site.yml` — repeatable remote deploy from your workstation
- `deploy/cloud-init/user-data.yaml` — zero-touch VM provisioning

See `docs/OPERATIONS.md` (releases, pull-based updates & one-click update) and
`docs/DISASTER_RECOVERY.md` (backup & rebuild) for day-2 operations.

> **Two deploy models.** This manual's Proxmox walkthrough (§1–§6) is the
> original VM-centric path. The CMDB now also ships as **pre-built images on
> `ghcr.io`**, so the recommended way to deploy anywhere that can run **Podman
> Quadlet (rootless)** is to **pull** those images rather than clone-and-build.
> That self-contained procedure is **§9 — Deploy anywhere from pre-built
> `ghcr.io` images**; read it if you just want the app running on a Podman host.

---

## 0. Overview of what you will build

```
┌── Your workstation ─────────────┐          ┌── Proxmox host ───────────────────────┐
│  VS Code (Remote-SSH)           │   SSH    │  VM: cmdb  (Ubuntu 22.04)             │
│  Browser  ───────────────────── │ ───────► │   rootless Podman                     │
│  ssh vfadmin@<vm-ip>            │  :8080   │    ├─ vf_cmdb_db        (Postgres 16) │
│                                 │  :8000   │    ├─ vf_cmdb_backend   (FastAPI)     │
│                                 │  :5050   │    ├─ vf_cmdb_frontend  (Nginx/React) │
│                                 │          │    └─ vf_cmdb_pgadmin   (pgAdmin)     │
└─────────────────────────────────┘          └───────────────────────────────────────┘
```

**VM specs (recommended):** 2 vCPU · 4 GB RAM · 20 GB disk · bridged NIC.

---

## 1. Create the Ubuntu VM on Proxmox

You can either use the **Ubuntu cloud image** (fastest) or the **ISO installer**.
The cloud image path is recommended because it pairs with cloud-init later.

### Option A — Ubuntu cloud image (recommended)

SSH into the Proxmox host (or use the shell in the Proxmox web UI) and run:

```bash
# 1. Download the Ubuntu 22.04 cloud image (once)
cd /var/lib/vz/template/iso
wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img

# 2. Create the VM (id 9000 here — pick a free VMID)
qm create 9000 --name cmdb --memory 4096 --cores 2 --net0 virtio,bridge=vmbr0 \
   --scsihw virtio-scsi-pci --ostype l26

# 3. Import the disk into your storage (replace 'local-lvm' with your storage)
qm importdisk 9000 jammy-server-cloudimg-amd64.img local-lvm
qm set 9000 --scsi0 local-lvm:vm-9000-disk-0
qm set 9000 --boot order=scsi0

# 4. Add a cloud-init drive + serial console (needed by the cloud image)
qm set 9000 --ide2 local-lvm:cloudinit
qm set 9000 --serial0 socket --vga serial0

# 5. Grow the disk to 20 GB
qm resize 9000 scsi0 20G

# 6. Cloud-init basics: user, SSH key, static IP
qm set 9000 --ciuser vfadmin
qm set 9000 --sshkeys ~/.ssh/authorized_keys      # your workstation's PUBLIC key
qm set 9000 --ipconfig0 ip=192.168.1.50/24,gw=192.168.1.1
qm set 9000 --nameserver 8.8.8.8

# 7. Start it
qm start 9000
```

> **SSH key:** copy your workstation public key (`~/.ssh/id_ed25519.pub`) onto the
> Proxmox host first, e.g. into `~/.ssh/authorized_keys`, so step 6 can reference it.
> Don't have a key yet? See §5.1.

### Option B — ISO installer

1. Upload the Ubuntu 22.04 Server ISO to Proxmox storage.
2. Create a VM (2 vCPU / 4 GB / 20 GB, NIC on `vmbr0`), attach the ISO, install
   Ubuntu, create the `vfadmin` user, and enable **OpenSSH server** during install.
3. After install, note the VM's IP (`ip a`).

---

## 2. First login & base OS prep

From your workstation:

```bash
ssh vfadmin@192.168.1.50        # use the IP you assigned

# Update the OS
sudo apt-get update && sudo apt-get upgrade -y
```

---

## 3. Fast path — run the bootstrap script

Everything in §4 is automated by the bootstrap script. To use it, just run:

```bash
# On the VM, as vfadmin:
bash <(curl -fsSL https://raw.githubusercontent.com/jallamasc/vf-cmdb/master/deploy/scripts/bootstrap.sh)
```

This installs Podman, clones the repo to `~/vf-cmdb` (master branch), generates a
`.env` with a strong DB password, deploys the stack via systemd/Quadlet, installs
the auto-update + backup timers, and opens the firewall. **Skip to §5** to connect
VS Code, or continue with §4 to understand/do each step by hand.

---

## 4. Manual step-by-step (what bootstrap automates)

### 4.1 Install Podman

```bash
sudo apt-get install -y podman uidmap slirp4netns fuse-overlayfs
podman --version
```

> **Ubuntu 22.04 note:** ships Podman 3.4, which lacks the built-in `podman compose`
> and full Quadlet support (Quadlet needs Podman ≥ 4.4). Two options:
> - **Simplest:** also install `podman-compose` (`pip3 install --user podman-compose`)
>   and deploy with `./deploy-podman.sh up` (uses container `restart=unless-stopped`).
> - **Best (always-on via systemd):** use **Ubuntu 24.04** (Podman 4.9, Quadlet native)
>   or install a newer Podman on 22.04 from the Kubic repo. Then use the Quadlet path.

### 4.2 Enable lingering (so services run without an active login)

```bash
sudo loginctl enable-linger vfadmin
```

### 4.3 Clone the repository (⚠ master branch)

```bash
git clone -b master https://github.com/jallamasc/vf-cmdb.git ~/vf-cmdb
cd ~/vf-cmdb
```

> The default `main` branch is empty — the app lives on **`master`**.

### 4.4 Configure environment

```bash
cp .env.example .env
nano .env
```

Set at minimum:
- `POSTGRES_PASSWORD=` a strong password
- `PGADMIN_DEFAULT_PASSWORD=` change from `admin`
- `CORS_ORIGINS=http://192.168.1.50:8080` (your UI URL; avoid `*` on a shared LAN)

### 4.5 Deploy the stack

**Quadlet / systemd (Podman ≥ 4.4, recommended, always-on):**
```bash
./deploy-podman.sh quadlet
loginctl enable-linger $USER
```

**Compose (Podman 3.x on Ubuntu 22.04):**
```bash
./deploy-podman.sh up
```

The backend automatically waits for Postgres, runs Alembic migrations, and seeds
all your data on first boot. First run pulls base images and builds — give it a few
minutes. Watch progress:

```bash
# Quadlet:
journalctl --user -u vf-cmdb-backend.service -f
# Compose:
podman logs -f vf_cmdb_backend
```

### 4.6 Open the firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp     # Web UI
sudo ufw allow 8000/tcp     # API / docs
sudo ufw allow 5050/tcp     # pgAdmin
sudo ufw enable
sudo ufw status verbose
```

Leave **5432 (Postgres) closed** unless you specifically need remote DB access.

### 4.7 Install auto-update + backup timers (day-2 automation)

```bash
mkdir -p ~/.config/systemd/user
cp deploy/systemd/vf-cmdb-*.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now vf-cmdb-update.timer vf-cmdb-backup.timer
systemctl --user list-timers 'vf-cmdb-*'
```

---

## 5. Connect from your workstation with VS Code Remote-SSH

### 5.1 Create an SSH key (skip if you already have one)

On your **workstation**:
```bash
ssh-keygen -t ed25519 -C "vfadmin@cmdb"        # press Enter for defaults
ssh-copy-id vfadmin@192.168.1.50                # installs your public key on the VM
ssh vfadmin@192.168.1.50                        # should log in without a password
```

### 5.2 Add an SSH host entry (nice-to-have)

Edit `~/.ssh/config` on your workstation:
```
Host cmdb
    HostName 192.168.1.50
    User vfadmin
    IdentityFile ~/.ssh/id_ed25519
```
Now `ssh cmdb` just works.

### 5.3 Connect VS Code

1. Install the **Remote - SSH** extension (`ms-vscode-remote.remote-ssh`).
2. `Ctrl/Cmd+Shift+P` → **Remote-SSH: Connect to Host** → `cmdb`.
3. Once connected: **File → Open Folder → `/home/vfadmin/vf-cmdb`**.
4. When prompted, install the workspace-recommended extensions (defined in
   `.vscode/extensions.json`): Python, Pylance, Ruff, ESLint, Prettier,
   Container Tools, GitLens, Thunder Client, YAML.

You are now editing directly on the VM. The integrated terminal runs on the VM, so
`./deploy-podman.sh`, `git`, and `podman` all operate on the test environment.

---

## 6. Verify the deployment

From your workstation browser:

| Service   | URL                              | Expected |
|-----------|----------------------------------|----------|
| Web UI    | `http://192.168.1.50:8080`       | CMDB dashboard loads |
| API docs  | `http://192.168.1.50:8000/docs`  | Swagger UI |
| Health    | `http://192.168.1.50:8000/health`| `{"status":"ok"}` |
| pgAdmin   | `http://192.168.1.50:5050`       | pgAdmin login |

Quick CLI check on the VM:
```bash
curl -fsS http://localhost:8000/health && echo OK
podman ps --filter name=vf_cmdb_
```

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `podman compose` not found | Install `podman-compose` (pip) or use Quadlet; on 22.04 Podman is 3.x. |
| Quadlet units don't start | Needs Podman ≥ 4.4. Check `systemctl --user status vf-cmdb-db.service` and `journalctl --user -xe`. |
| Services stop after logout | `loginctl enable-linger $USER`. |
| Can't reach UI from workstation | Check `ufw status`; confirm the VM IP; confirm bridge NIC. |
| Backend restarts / DB refused | DB still initialising on first boot — watch `journalctl --user -u vf-cmdb-db.service -f`. |
| Ports already in use | Change `FRONTEND_PORT`/`BACKEND_PORT`/`PGADMIN_PORT` in `.env` and redeploy. |

---

## 8. Next steps

- **Deploy anywhere from pre-built images:** §9 below
- **Day-2 operations, releases & one-click update:** `docs/OPERATIONS.md`
- **Backups & disaster recovery:** `docs/DISASTER_RECOVERY.md`
- **Repeatable/automated re-deploys:** `deploy/ansible/README.md`, `deploy/cloud-init/README.md`

---

## 9. Deploy anywhere from pre-built `ghcr.io` images (Podman Quadlet)

This is the recommended, build-free way to run the CMDB on **any host that can
run Podman Quadlet (rootless)** — a Proxmox VM, a bare-metal Linux box, a NUC,
anything with Podman ≥ 4.4 and a user systemd session. The host **pulls**
pre-built images from `ghcr.io`; it does not clone the repo or build anything.

### 9.0 Prerequisites

- Podman ≥ 4.4 (Quadlet native) and a user systemd session (`systemctl --user`).
- `loginctl enable-linger $USER` so services run without an active login.
- `jq` and `curl` on the host (used by the update script's health check).
- The `ghcr.io/jallamasc/vf-cmdb-{backend,frontend}` packages must be **PUBLIC**
  (maintainer flips them once after the first release — see `docs/OPERATIONS.md`
  §2). Until public, anonymous pulls fail.

The host-runtime layout convention is `$HOME/vf-cmdb/{deploy,state,.env}` (the
`%h/vf-cmdb/...` paths the Quadlet units reference). This is the **deploy root**,
distinct from any developer source checkout.

### 9.1 Create the one-time host state directory (REQUIRED before first start)

The backend container **bind-mounts** a host state directory (default
`~/vf-cmdb/state`, configurable via `VF_UPDATE_DIR`), and the one-click update
`.path` unit **watches a file inside it**. This directory **MUST exist before**
the backend container starts and **before** you enable `vf-cmdb-update.path` — a
`.path` unit whose watched parent directory is missing fails to start.

```bash
mkdir -p ~/vf-cmdb/state
```

> The backend's `Volume=%h/vf-cmdb/state:/var/lib/vf-cmdb:Z` mount and the
> `.path` unit's `PathChanged=%h/vf-cmdb/state/update.request` watch target are
> the **same directory** — this is the container ↔ host trust boundary.

### 9.2 Install the Quadlet units

Copy the Quadlet unit files to the user Quadlet directory (they reference the
`ghcr.io` images and carry `AutoUpdate=registry`):

```bash
mkdir -p ~/.config/containers/systemd
cp deploy/quadlet/vf-cmdb-*.{container,network} ~/.config/containers/systemd/
```

### 9.3 Provide `.env`

```bash
cp .env.example ~/vf-cmdb/.env
nano ~/vf-cmdb/.env
```

Set at minimum `POSTGRES_PASSWORD`, `PGADMIN_DEFAULT_PASSWORD`, and
`CORS_ORIGINS=http://<host-ip>:8080`. The `VF_UPDATE_DIR` key is present only if
you want the state dir somewhere other than the default `~/vf-cmdb/state`; leave
it commented to use the default.

### 9.4 Start the services

```bash
systemctl --user daemon-reload
systemctl --user start vf-cmdb-db vf-cmdb-backend vf-cmdb-frontend vf-cmdb-pgadmin
```

The backend waits for Postgres, runs `alembic upgrade head`, and seeds data on
first boot (`entrypoint.sh`). Watch it come up:

```bash
journalctl --user -u vf-cmdb-backend.service -f
```

Reach the UI at `http://<host-ip>:8080` (API docs at `:8000/docs`).

### 9.5 Enable the one-click + daily update units (one-time)

Only **after** the state dir exists (§9.1) and the backend is running:

```bash
systemctl --user daemon-reload
systemctl --user enable --now vf-cmdb-update.path    # one-click Update now watcher
systemctl --user enable --now vf-cmdb-update.timer   # daily scheduled refresh
```

> `vf-cmdb-update.service` is a `oneshot` with **no `[Install]`** section — do
> not try to `enable` it directly. It is pulled by the `.path` unit (one-click)
> and the `.timer` (daily). The `.path` unit fails to start if `~/vf-cmdb/state`
> does not already exist, which is why §9.1 comes first.

### 9.6 How updates reach this host

- **One-click:** the app footer shows the running version and, when a newer
  GitHub release exists, an **Update now** button (notify-and-apply, never
  auto-apply). See `docs/OPERATIONS.md` §3.1.
- **Daily:** `vf-cmdb-update.timer` runs the same pull-and-health-check script.

> ⚠️ **Migrations cannot be rolled back by re-pulling an older image.**
> `entrypoint.sh` runs `alembic upgrade head` on every start. The only true
> rollback is the pre-update DB backup (`deploy/scripts/vf-cmdb-backup.sh`,
> taken automatically before every applied update) restored via
> `deploy/scripts/vf-cmdb-restore.sh`. Keep backups.

### 9.7 Trust model

No authentication — single user, private LAN. Image pulls are anonymous (public
packages). Do not expose this host to the public internet. See
`docs/OPERATIONS.md` §7.
