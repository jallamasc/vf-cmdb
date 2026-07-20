# Virtualfactor IT CMDB - Quick Start Guide

## 🎯 What You Have

A complete, production-ready IT Configuration Management Database with:
- ✅ **64 files** tracked in Git, ready to push to GitHub
- ✅ **Full-stack application**: FastAPI backend + React frontend + PostgreSQL
- ✅ **Docker Compose** setup for easy deployment
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

### 3b. Install Docker

SSH into your VM and run:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose (if not included)
docker compose version  # Check if already installed
```

### 3c. Clone and Deploy

```bash
# Clone the repository
git clone https://github.com/jallamasc/vf-cmdb.git
cd vf-cmdb

# Configure environment
cp .env.example .env
nano .env  # Set your passwords (important!)

# Start everything
docker compose up -d

# Wait for database to be ready, then run migrations and seed
sleep 10
docker compose exec backend alembic upgrade head
docker compose exec backend python seed.py
```

### 3d. Access the Application

From your workstation browser:

- **CMDB Web UI**: `http://your-vm-ip:8080`
- **API Docs**: `http://your-vm-ip:8000/docs`
- **pgAdmin**: `http://your-vm-ip:5050`

---

## 🔧 Common Operations

### Check Status
```bash
docker compose ps
```

### View Logs
```bash
docker compose logs -f backend    # Backend logs
docker compose logs -f frontend   # Nginx logs
docker compose logs -f db         # PostgreSQL logs
```

### Restart Services
```bash
docker compose restart backend
docker compose restart frontend
```

### Stop Everything
```bash
docker compose down
```

### Update Code (After Git Pull)
```bash
git pull
docker compose down
docker compose up -d --build
```

### Backup Database
```bash
docker compose exec db pg_dump -U cmdbuser cmdb > backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
docker compose exec -T db psql -U cmdbuser cmdb < backup_20260719.sql
```

---

## 📁 Key Files Reference

| File | Purpose |
|------|---------|
| `README.md` | Full documentation |
| `GITHUB_SETUP.md` | GitHub push instructions |
| `VSCODE_REMOTE_SETUP.md` | VS Code remote development guide |
| `.env.example` | Environment variables template |
| `docker-compose.yml` | Full stack orchestration |
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
