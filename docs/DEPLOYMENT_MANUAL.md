# Virtualfactor IT CMDB — Manual First-Time Deployment (Proxmox + Ubuntu 22.04)

This is the **step-by-step manual runbook** for standing up the CMDB test
environment the first time on your Proxmox host, and connecting to it from your
workstation with **VS Code Remote-SSH**.

Once you have done this once, everything here is automated by:
- `deploy/scripts/bootstrap.sh` — one-shot re-deploy on a fresh VM
- `deploy/ansible/site.yml` — repeatable remote deploy from your workstation
- `deploy/cloud-init/user-data.yaml` — zero-touch VM provisioning

See `docs/OPERATIONS.md` (auto-update & code review) and
`docs/DISASTER_RECOVERY.md` (backup & rebuild) for day-2 operations.

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

- **Day-2 operations & auto-update:** `docs/OPERATIONS.md`
- **Backups & disaster recovery:** `docs/DISASTER_RECOVERY.md`
- **Repeatable/automated re-deploys:** `deploy/ansible/README.md`, `deploy/cloud-init/README.md`
