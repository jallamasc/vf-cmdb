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

## Quick start (Docker Compose)

Requires Docker Engine + the Docker Compose plugin.

```bash
git clone <your-repo-url> vf_cmdb
cd vf_cmdb

cp .env.example .env
# edit .env and set a real POSTGRES_PASSWORD

docker compose up -d --build
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

### Deploying on a Proxmox Ubuntu VM

1. Create an Ubuntu 22.04/24.04 VM in Proxmox and install Docker:
   ```bash
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose-plugin
   sudo usermod -aG docker "$USER"    # then log out / back in
   ```
2. Copy this project onto the VM (git clone or `scp`).
3. `cp .env.example .env`, set a strong `POSTGRES_PASSWORD`, and (recommended)
   set `CORS_ORIGINS` to the UI URL, e.g. `http://cmdb.home.lan:8080`.
4. `docker compose up -d --build`.
5. Point a DNS record (e.g. `cmdb.home.lan`) at the VM, or use its IP.

The stack uses `restart: unless-stopped`, so it comes back automatically after
a reboot.

---

## Everyday operations

```bash
# status / logs
docker compose ps
docker compose logs -f backend

# stop / start
docker compose stop
docker compose start

# update after pulling new code
git pull
docker compose up -d --build

# tear down (KEEPS data — named volumes survive)
docker compose down

# tear down AND wipe the database
docker compose down -v
```

### Database backup & restore

```bash
# backup
docker compose exec -T db pg_dump -U vfcmdb vfcmdb > cmdb_backup_$(date +%F).sql

# restore (into a fresh/empty db)
cat cmdb_backup_2026-07-20.sql | docker compose exec -T db psql -U vfcmdb vfcmdb
```

The Postgres data also lives in the `pgdata` named volume, so it persists across
container recreation unless you run `docker compose down -v`.

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

## Local development (without Docker)

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
│   ├── Dockerfile · entrypoint.sh · requirements.txt
├── frontend/           React + Vite + AG Grid UI
│   ├── src/pages/          Dashboard, Sites, RackView, compute, IPAM, …
│   ├── src/components/      Layout, EntityGrid
│   ├── Dockerfile · nginx.conf
├── ansible/            cmdb_inventory.py + README
├── docker-compose.yml
├── .env.example
└── README.md
```
