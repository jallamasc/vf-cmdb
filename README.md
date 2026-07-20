# Virtualfactor IT CMDB

A self-hosted **Configuration Management Database** for the Virtualfactor home /
lab network. It tracks sites, racks, power, cabling, compute (physical servers,
VMs, containers, workstations), networking (VLANs, IPv4/IPv6 subnets, network
devices, interfaces) and IP address management — with **auto-generated naming**
(VF long/short names and TIA-606-B labels), a **full audit changelog**, an
**IPAM next-free-IP** helper, and a **live Ansible dynamic inventory**.

> Single-user, home-network deployment — **no authentication** by design.

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
  Browser  ──8080─▶ │  frontend   React 18 + Vite + AG Grid      │
                    │             served by Nginx                │
                    │             /api/* ─┐ (reverse proxy)      │
                    └─────────────────────┼──────────────────────┘
                                          ▼
                    ┌──────────────────────────────────────────┐
  Ansible  ──8000─▶ │  backend    FastAPI + async SQLAlchemy     │
  (inventory)       │             Alembic migrations + seeding   │
                    └─────────────────────┬──────────────────────┘
                                          ▼
                    ┌──────────────────────────────────────────┐
                    │  db         PostgreSQL 16 (inet/cidr/jsonb)│
                    └──────────────────────────────────────────┘
  pgAdmin ──5050─▶  optional DB admin UI
```

| Service   | Tech                                   | Port  |
|-----------|----------------------------------------|-------|
| frontend  | React 18, TypeScript, Vite, AG Grid, Tailwind, Nginx | 8080 |
| backend   | Python 3.11, FastAPI, SQLAlchemy 2 (async), Alembic  | 8000 |
| db        | PostgreSQL 16                          | 5432  |
| pgadmin   | pgAdmin 4                              | 5050  |

---

## Quick start (Podman)

Requires **Podman 4.x+**. For the compose workflow you also need either the
built-in `podman compose` (Podman 4.7+) or the `podman-compose` Python tool.
Podman runs **rootless** and **daemonless** — no root daemon, no `docker` group.

```bash
git clone <your-repo-url> vf_cmdb
cd vf_cmdb

cp .env.example .env
# edit .env and set a real POSTGRES_PASSWORD

# easiest — the helper script picks up podman compose / podman-compose for you:
./deploy-podman.sh up

# ...or call compose directly:
podman compose -f podman-compose.yml up -d --build
```

On first start the backend automatically:

1. waits for PostgreSQL to be healthy,
2. runs the Alembic migration (creates every table),
3. seeds the reference data and the imported inventory (idempotent — safe to
   re-run),
4. starts the API.

Then open:

* **Web UI**  → http://localhost:8080
* **API docs** → http://localhost:8000/docs
* **pgAdmin**  → http://localhost:5050

### Two ways to run on Podman

| Approach | Command | Best for |
|----------|---------|----------|
| **Compose** | `./deploy-podman.sh up` / `podman compose -f podman-compose.yml up -d` | quick start, dev, familiar workflow |
| **Quadlet (systemd)** | `./deploy-podman.sh quadlet` | always-on production; native auto-start, journald logging |

The **Quadlet** units in `deploy/quadlet/` are the Podman-native way to run the
stack as systemd services — they replace Docker's `restart:` policy with proper
systemd supervision. See "Production: Quadlet + systemd" below.

### Deploying on a Proxmox Ubuntu VM

1. Create an Ubuntu 22.04/24.04 VM in Proxmox and install Podman:
   ```bash
   sudo apt-get update
   sudo apt-get install -y podman
   # optional compose front-end:
   sudo apt-get install -y podman-compose      # or: pip install podman-compose
   ```
   (On Fedora/Rocky/RHEL: `sudo dnf install -y podman podman-compose`.)
2. Copy this project onto the VM (git clone or `scp`).
3. `cp .env.example .env`, set a strong `POSTGRES_PASSWORD`, and (recommended)
   set `CORS_ORIGINS` to the UI URL, e.g. `http://cmdb.home.lan:8080`.
4. `./deploy-podman.sh up` (or the Quadlet path for always-on).
5. Point a DNS record (e.g. `cmdb.home.lan`) at the VM, or use its IP.

Everything runs rootless — no `sudo` needed for day-to-day operation.

### Production: Quadlet + systemd

Quadlet lets systemd manage the containers natively (auto-start on boot,
restart on failure, `journalctl` logs). One command installs and starts them:

```bash
./deploy-podman.sh quadlet
```

This builds the backend/frontend images, copies the units from
`deploy/quadlet/` into `~/.config/containers/systemd/`, runs
`systemctl --user daemon-reload`, and starts the services. To keep them running
after you log out of the VM:

```bash
loginctl enable-linger "$USER"
```

Manage them like any systemd service:

```bash
systemctl --user status  vf-cmdb-backend.service
systemctl --user restart vf-cmdb-frontend.service
journalctl --user -u vf-cmdb-db.service -f
```

---

## Everyday operations

Using the helper script (delegates to whichever compose front-end is present):

```bash
./deploy-podman.sh ps        # running containers
./deploy-podman.sh logs      # follow all logs
./deploy-podman.sh restart   # rebuild + restart
./deploy-podman.sh down      # stop & remove (named volumes survive)
```

Or with Podman directly:

```bash
# status / logs
podman ps --filter name=vf_cmdb_
podman logs -f vf_cmdb_backend

# update after pulling new code
git pull
podman compose -f podman-compose.yml up -d --build

# tear down (KEEPS data — named volumes survive)
podman compose -f podman-compose.yml down

# tear down AND wipe the database
podman compose -f podman-compose.yml down -v
```

### Database backup & restore

```bash
# backup
podman exec -t vf_cmdb_db pg_dump -U vfcmdb vfcmdb > cmdb_backup_$(date +%F).sql

# restore (into a fresh/empty db)
cat cmdb_backup_2026-07-20.sql | podman exec -i vf_cmdb_db psql -U vfcmdb vfcmdb
```

The Postgres data also lives in the `pgdata` named volume, so it persists across
container recreation unless you run `... down -v`.

---

## Features

### Auto-generated naming
Names are derived from the reference lookups (organization, cloud, region,
campus, building, floor/section, device type, brand, role, OS, sequence). When
you create or edit a record the backend regenerates:

* **VF long name**  e.g. `VFVSCCHMM1+F1S1AA01PSGEHVPR1`
* **VF short name** e.g. `psgehvpr1`
* **TIA-606-B label**

The **Naming Conventions** page lets you edit every abbreviation; new names use
the updated values immediately. Try `GET /api/v1/naming/generate` to preview a
name from parts.

### Audit changelog
Every create / update / delete is written to `change_log` (old value → new
value, timestamp, source). Facts pushed in by Ansible are tagged
`ansible_callback`; UI edits are `web_ui`. Browse and filter them on the
**Changelog** page or via `GET /api/v1/changelog`.

### IPAM
* Per-subnet **utilisation** with a colour bar (`/ipam/subnets/{id}/utilization`).
* **Next free IP** button that returns the lowest unused address, respecting the
  configured range (`/ipam/subnets/{id}/next-ip`).
* IP addresses are **colour-coded by network zone** (management, servers,
  storage, services, cluster, dmz, lan, wlan, vpn, public, private).

### Visual rack view
Front-elevation, unit-by-unit diagram of each rack, colour-coded by device type.

### Ansible integration
* **Dynamic inventory** at `GET /api/v1/ansible/inventory`, grouped by role,
  site, OS and type — served to Ansible by `ansible/cmdb_inventory.py`.
* **Fact write-back** via `POST /api/v1/devices/{type}/{id}/facts`.

See [`ansible/README.md`](ansible/README.md) for full usage.

---

## Data import & the WLAN correction

The seed data was imported from the six source spreadsheets (naming
conventions, IPv4/IPv6 networking, firewall port config, computing inventory,
rack layout). During import the invalid WLAN network **`192.169.x.x`** was
corrected to the intended private range **`192.168.x.x`**, host bits on CIDRs
were canonicalised, and malformed IP/range values were cleaned. Re-running the
seeder is idempotent.

---

## REST API cheat-sheet

Base path: `/api/v1`

| Method | Path                                   | Purpose                          |
|--------|----------------------------------------|----------------------------------|
| GET    | `/meta/entities`                       | List all CRUD resources          |
| GET/POST/PATCH/DELETE | `/{resource}` `/{resource}/{id}` | Generic CRUD per entity |
| GET    | `/dashboard/summary`                   | Counts + recent changes          |
| GET    | `/changelog`                           | Audit log (filterable)           |
| GET    | `/ipam/subnets/{id}/next-ip`           | Next free IPv4                    |
| GET    | `/ipam/subnets/{id}/utilization`       | Subnet utilisation               |
| GET    | `/naming/generate`                     | Preview a generated name         |
| GET    | `/ansible/inventory`                   | Ansible dynamic inventory        |
| POST   | `/devices/{type}/{id}/facts`           | Write facts back (Ansible)       |

Resource slugs use hyphens, e.g. `physical-servers`, `subnets-ipv4`,
`network-devices`, `device-interfaces`, `ip-assignments`. Full list at
`GET /api/v1/meta/entities` or in the interactive docs at `/docs`.

---

## Local development (without containers)

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# point at a running Postgres:
export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432 \
       POSTGRES_USER=vfcmdb POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev      # Vite dev server, proxies /api → 127.0.0.1:8000
```

---

## Project layout

```
vf_cmdb/
├── backend/            FastAPI app, models, CRUD, routers, Alembic, seed
│   ├── app/
│   │   ├── models.py       SQLAlchemy models (all tables)
│   │   ├── crud.py         generic async CRUD + changelog + naming hook
│   │   ├── naming.py       name-generation engine
│   │   ├── registry.py     resource-slug → model map
│   │   ├── routers/        generic CRUD, special (ipam/naming/facts), ansible
│   │   ├── seed.py         idempotent data seeder
│   │   └── seed_subnets.json
│   ├── alembic/            migrations
│   ├── Containerfile · entrypoint.sh · requirements.txt
├── frontend/           React + Vite + AG Grid UI
│   ├── src/pages/          Dashboard, Sites, RackView, compute, IPAM, …
│   ├── src/components/      Layout, EntityGrid
│   ├── Containerfile · nginx.conf
├── ansible/            cmdb_inventory.py + README
├── deploy/quadlet/     systemd Quadlet units (.container/.network/.volume)
├── deploy-podman.sh    build / up / down / logs / quadlet helper
├── podman-compose.yml
├── .env.example
└── README.md
```
