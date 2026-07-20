# Virtualfactor IT CMDB - Quick Start Guide

## 🎯 What You Have

A complete, production-ready IT Configuration Management Database with:
- ✅ **64 files** tracked in Git, ready to push to GitHub
- ✅ **Full-stack application**: FastAPI backend + React frontend + PostgreSQL
- ✅ **Podman** setup for easy, rootless, daemonless deployment (compose + Quadlet)
- ✅ **Auto-generated device naming** following your TIA-606-B conventions
- ✅ **IPAM** with subnet utilization and next-free-IP
- ✅ **Ansible dynamic inventory** integration
- ✅ **Complete audit changelog**
- ✅ **Visual rack diagram**
- ✅ **All your Excel data** pre-seeded (sites, racks, devices, VLANs, subnets)

## 📤 Step 1: Push to GitHub (Do This First!)

### 1a. Create GitHub Repository

Go to: **https://github.com/new**

- Repository name: `vf-cmdb`
- Description: `Virtualfactor IT CMDB - Self-hosted configuration management database`
- **Public** or **Private** (your choice)
- ⚠️ **Do NOT** check "Initialize with README" (we already have one)
- Click **"Create repository"**

### 1b. Push Your Code

Run these commands in your terminal:

```bash
cd /home/ubuntu/vf_cmdb

# Add GitHub remote
git remote add origin https://github.com/jallamasc/vf-cmdb.git

# Push all code
git push -u origin master
```

**Done!** Your code is now on GitHub at: `https://github.com/jallamasc/vf-cmdb`

---

## 💻 Step 2: Set Up Your Local Workstation

### Option A: Clone and Work Locally (Recommended)

On your workstation:

```bash
# Clone the repository
git clone https://github.com/jallamasc/vf-cmdb.git
cd vf-cmdb

# Open in VS Code
code .
```

Install recommended VS Code extensions when prompted.

### Option B: VS Code Remote SSH (Work on VM)

1. Install **Remote - SSH** extension in VS Code
2. Press `Ctrl+Shift+P` → "Remote-SSH: Add New SSH Host"
3. Enter: `ssh your-username@your-vm-ip`
4. Connect and open `/home/your-username/vf-cmdb`

See **VSCODE_REMOTE_SETUP.md** for full details.

---

## 🚀 Step 3: Deploy on Your Proxmox VM

### 3a. Prepare Your VM

On your Proxmox server, create a new Ubuntu VM (or use existing):

```bash
# Recommended specs:
# - Ubuntu 22.04 or 24.04
# - 2 vCPU
# - 4GB RAM
# - 20GB disk
# - Bridge network (so you can access from your workstation)
```

### 3b. Install Podman

SSH into your VM and run:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y podman
sudo apt-get install -y podman-compose   # optional; or: pip install podman-compose

# Fedora/Rocky/RHEL
# sudo dnf install -y podman podman-compose

# Verify
podman --version
```

Podman is rootless and daemonless — no `docker` group, no background daemon.

### 3c. Clone and Deploy

```bash
# Clone the repository
git clone https://github.com/jallamasc/vf-cmdb.git
cd vf-cmdb

# Configure environment
cp .env.example .env
nano .env  # Set your passwords (important!)

# Start everything (builds images, runs migrations + seeding automatically)
./deploy-podman.sh up
```

> The backend entrypoint waits for the DB, runs Alembic migrations, and seeds
> the data on first boot — no manual migrate/seed step needed.
>
> For an always-on production setup managed by systemd, use the Quadlet path
> instead: `./deploy-podman.sh quadlet` then `loginctl enable-linger $USER`.

### 3d. Access the Application

From your workstation browser:

- **CMDB Web UI**: `http://your-vm-ip:8080`
- **API Docs**: `http://your-vm-ip:8000/docs`
- **pgAdmin**: `http://your-vm-ip:5050`

---

## 🔧 Common Operations

### Check Status
```bash
./deploy-podman.sh ps
# or: podman ps --filter name=vf_cmdb_
```

### View Logs
```bash
podman logs -f vf_cmdb_backend    # Backend logs
podman logs -f vf_cmdb_frontend   # Nginx logs
podman logs -f vf_cmdb_db         # PostgreSQL logs
```

### Restart Services
```bash
podman restart vf_cmdb_backend
podman restart vf_cmdb_frontend
```

### Stop Everything
```bash
./deploy-podman.sh down
```

### Update Code (After Git Pull)
```bash
git pull
./deploy-podman.sh restart
```

### Backup Database
```bash
podman exec -t vf_cmdb_db pg_dump -U vfcmdb vfcmdb > backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
cat backup_20260719.sql | podman exec -i vf_cmdb_db psql -U vfcmdb vfcmdb
```

> Using the Quadlet/systemd deployment? Manage services with
> `systemctl --user {status,restart,stop} vf-cmdb-backend.service` and view logs
> with `journalctl --user -u vf-cmdb-backend.service -f`.

---

## 📁 Key Files Reference

| File | Purpose |
|------|---------|
| `README.md` | Full documentation |
| `GITHUB_SETUP.md` | GitHub push instructions |
| `VSCODE_REMOTE_SETUP.md` | VS Code remote development guide |
| `.env.example` | Environment variables template |
| `podman-compose.yml` | Full stack orchestration (Podman) |
| `deploy-podman.sh` | Deploy helper (up/down/logs/quadlet) |
| `deploy/quadlet/` | systemd Quadlet units for always-on production |
| `backend/seed.py` | Initial data seeder |
| `ansible/cmdb_inventory.py` | Ansible dynamic inventory |

---

## 🎓 Next Steps

1. ✅ Push to GitHub (Step 1)
2. ✅ Clone to your workstation (Step 2)
3. ✅ Deploy to Proxmox VM (Step 3)
4. 📝 Explore the web UI at `http://your-vm-ip:8080`
5. 🔧 Edit data, add devices, configure network equipment
6. 🤖 Set up Ansible to use the dynamic inventory
7. 📊 Watch the changelog track all your changes

---

## 🆘 Need Help?

- **Full docs**: See `README.md`
- **API reference**: Visit `http://your-vm-ip:8000/docs` after deployment
- **Ansible guide**: See `ansible/README.md`

---

## 📊 What's Pre-Seeded

Your database already contains:

- ✅ All naming convention abbreviations (organizations, clouds, device types, brands, OS, etc.)
- ✅ Home datacenter site (Korriban)
- ✅ Rack AA01 with 36 units
- ✅ Network devices (5 switches)
- ✅ Physical server (Proxmox hypervisor)
- ✅ Virtual machines (VyOS firewall)
- ✅ Containers/Apps (iTop, OCS, Traefik, Mailu, etc.)
- ✅ 40+ VLANs with IPv4/IPv6 subnets
- ✅ All role IP assignments (gateways, switches, DNS, etc.)
- ✅ Network device port configurations

Everything from your Excel files is now in a proper relational database!

---

**Happy configuring! 🎉**
