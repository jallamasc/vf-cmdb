# VS Code Remote Development Setup

This guide helps you work on the CMDB project remotely from your workstation using VS Code.

## Option 1: Work Locally (Recommended for Development)

### 1. Clone the Repository

```bash
git clone https://github.com/jallamasc/vf-cmdb.git
cd vf-cmdb
```

### 2. Open in VS Code

```bash
code .
```

### 3. Install Extensions (VS Code will prompt)

- **Podman** (or **Container Tools**) - For managing containers
- **Python** - For backend development
- **Pylance** - Python IntelliSense
- **ESLint** - For frontend linting
- **Prettier** - Code formatting

### 4. Development Workflow

**Backend Development:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend Development:**
```bash
cd frontend
npm install
npm run dev  # Runs on http://localhost:5173
```

**Database (Podman):**
```bash
# From project root — start just the db (+ pgadmin) for local dev
podman compose -f podman-compose.yml up -d db pgadmin
```

## Option 2: VS Code Remote - SSH (Work on Proxmox VM)

### 1. Install VS Code Extension

Install **Remote - SSH** extension in VS Code

### 2. Configure SSH Connection

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) → "Remote-SSH: Add New SSH Host"

```
ssh your-username@your-proxmox-vm-ip
```

### 3. Connect

- Press `Ctrl+Shift+P` → "Remote-SSH: Connect to Host"
- Select your VM
- VS Code will open a new window connected to your VM

### 4. Open Project

File → Open Folder → `/home/your-username/vf-cmdb`

### 5. Work Remotely

All files are edited on the VM. Terminal commands run on the VM. Perfect for testing in the actual deployment environment.

## Option 3: Hybrid Approach

- **Code locally** on your workstation (faster, better IntelliSense)
- **Test on VM** using Podman before committing
- **Git push/pull** to sync between environments

```bash
# On your workstation
git add .
git commit -m "Add new feature"
git push

# On your Proxmox VM
git pull
./deploy-podman.sh restart
```

## Recommended Extensions for This Project

- **Podman** / **Container Tools** (ms-azuretools.vscode-containers)
- **Python** (ms-python.python)
- **Pylance** (ms-python.vscode-pylance)
- **ESLint** (dbaeumer.vscode-eslint)
- **Prettier** (esbenp.prettier-vscode)
- **GitLens** (eamodio.gitlens)
- **Thunder Client** (rangav.vscode-thunder-client) - For testing API endpoints
- **Auto Rename Tag** (formulahendry.auto-rename-tag)
- **Path Intellisense** (christian-kohler.path-intellisense)

## Tips

1. **Use `.env` for local development** - Copy `.env.example` to `.env` and adjust for local ports
2. **Run backend + frontend separately** - Faster iteration than rebuilding Podman containers
3. **Use Thunder Client or Postman** - Test API endpoints at http://localhost:8000/docs
4. **Database GUI** - pgAdmin at http://localhost:5050 or use VS Code PostgreSQL extension
5. **Hot reload works** - Backend (FastAPI) and frontend (Vite) both auto-reload on file changes

## Project Structure Quick Reference

```
vf_cmdb/
├── backend/           # FastAPI app
│   ├── app/
│   │   ├── main.py    # Entry point
│   │   ├── models.py  # SQLAlchemy models
│   │   ├── api/       # API routes
│   │   └── utils/     # Naming engine, etc.
│   ├── alembic/       # Database migrations
│   └── seed.py        # Initial data seeder
├── frontend/          # React app
│   ├── src/
│   │   ├── pages/     # Main views
│   │   ├── components/# Reusable components
│   │   └── lib/       # API client, utils
│   └── vite.config.ts
├── ansible/           # Ansible integration
│   └── cmdb_inventory.py
├── deploy/quadlet/    # systemd Quadlet units (production)
├── deploy-podman.sh   # Deploy helper script
└── podman-compose.yml # Full stack deployment
```
