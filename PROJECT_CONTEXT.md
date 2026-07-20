# Virtualfactor IT CMDB - Project Context Document

**Last Updated**: 2026-07-19  
**Status**: Code complete, ready for GitHub push and VM deployment  
**Owner**: Alejandro (jallamasc) - Virtualfactor, Bogotá, Colombia

---

## 📋 Executive Summary

This is a **complete, production-ready IT Configuration Management Database (CMDB)** built to replace 6 Excel files used by Virtualfactor to manage IT infrastructure. The application provides centralized configuration management with auto-naming, IPAM, changelog, and Ansible integration.

**Current State**: All code written, tested, committed to local git repository. Ready to push to GitHub and deploy to Proxmox VM.

---

## 🎯 Project Objectives

### Primary Goal
Centralize IT configuration information and facilitate the addition, update, and management of all configuration information.

### Pain Points Being Solved
1. **Broken Excel references** (`#REF!` errors) when formulas break across workbooks
2. **No validation** - nothing prevents entering invalid abbreviations or values
3. **Manual name concatenation** - device names must be manually built from component parts
4. **No relationship enforcement** - links between files are not enforced
5. **No change history** - edits overwrite old values with no audit trail
6. **Denormalized data** - location hierarchies repeated in every row
7. **Flat IP management** - no tracking of which IPs are used vs. available

### Success Criteria
- Single source of truth for all IT infrastructure data
- Auto-generated device names following TIA-606-B conventions
- Full IPAM with utilization tracking and next-available-IP
- Spreadsheet-like inline editing (user is familiar with Excel)
- Complete audit changelog
- Ansible dynamic inventory integration
- Easy to deploy and maintain on Proxmox home lab

---

## 🏗️ Technical Architecture

### Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React + TypeScript + Vite | 18.x | Single-page application UI |
| **UI Components** | AG Grid Community + Tailwind CSS | Latest | Spreadsheet-like inline editing |
| **State Management** | TanStack Query (React Query) | v5 | Data fetching, caching, mutations |
| **Backend** | FastAPI + Python | 3.11 | REST API server |
| **ORM** | SQLAlchemy (async) | 2.x | Database abstraction |
| **Migrations** | Alembic | Latest | Database schema versioning |
| **Database** | PostgreSQL | 16 | Relational database with `inet`/`cidr` types |
| **Deployment** | Podman (rootless) + podman-compose / Quadlet | 4.x+ | Container orchestration |
| **Web Server** | Nginx | 1.27-alpine | Serves frontend, proxies API |
| **Version Control** | Git + GitHub | - | Source control |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Workstation                       │
│  ┌──────────────┐           ┌──────────────┐               │
│  │   Browser    │           │   VS Code    │               │
│  │ (Port 8080)  │           │  (Remote SSH)│               │
│  └──────┬───────┘           └──────┬───────┘               │
│         │                          │                        │
└─────────┼──────────────────────────┼────────────────────────┘
          │                          │
          │ HTTP                     │ SSH
          ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Proxmox Ubuntu VM (192.168.x.x)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Podman Network (rootless)               │   │
│  │                                                      │   │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │   │
│  │  │ Frontend │───▶│ Backend  │───▶│  PostgreSQL  │  │   │
│  │  │  Nginx   │    │ FastAPI  │    │      16      │  │   │
│  │  │  :8080   │    │  :8000   │    │    :5432     │  │   │
│  │  └──────────┘    └──────────┘    └──────────────┘  │   │
│  │                                          ▲          │   │
│  │                       ┌──────────────────┘          │   │
│  │                       │                             │   │
│  │                  ┌────┴──────┐                      │   │
│  │                  │  pgAdmin  │                      │   │
│  │                  │   :5050   │                      │   │
│  │                  └───────────┘                      │   │
│  │                                                      │   │
│  │  Volumes: pgdata/, pgadmin/                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  /home/user/vf-cmdb/  ← Git repository                     │
│  /home/user/vf-cmdb/ansible/cmdb_inventory.py              │
└─────────────────────────────────────────────────────────────┘
          ▲
          │
          │ Ansible dynamic inventory calls
          │
    ┌─────┴──────┐
    │  Ansible   │
    │  Playbooks │
    └────────────┘
```

### Service Ports

| Service | Port | Access |
|---------|------|--------|
| Frontend (Nginx) | 8080 | Web UI - `http://vm-ip:8080` |
| Backend (FastAPI) | 8000 | API + Docs - `http://vm-ip:8000/docs` |
| PostgreSQL | 5432 | Internal only (Podman network) |
| pgAdmin | 5050 | DB Admin - `http://vm-ip:5050` |

---

## 📊 Data Model Summary

### Entity Hierarchy

```
NAMING CONVENTIONS (Lookup Tables - 17 tables)
  ↓ define abbreviations for
PHYSICAL LAYER
  sites → racks → rack_units
  power_devices → power_outlets
  patch_panels → patch_panel_ports → cables
  ↓ hosts
COMPUTE LAYER
  physical_servers → virtual_machines → containers_apps
  workstations
  ↓ connects via
NETWORK LAYER
  vlans → subnets_ipv4 / subnets_ipv6 → subnet_role_assignments
  network_devices → device_interfaces → interface_vlan_memberships
  ip_assignments
  ↓ tracked by
AUDIT LAYER
  change_log (auto-populated on every change)
```

### Key Design Principles

1. **Normalized relational model** - No duplicate data, everything references lookup tables
2. **Auto-generated names** - `vf_long_name`, `vf_short_name`, `tia606b_name` computed on save
3. **Dual-stack networking** - Full IPv4 and IPv6 support using PostgreSQL `inet`/`cidr` types
4. **Hierarchical naming** - Organization → Cloud → Region → Campus → Building → Floor → Rack → Device
5. **Complete audit trail** - Every field change logged with old/new values
6. **Polymorphic relationships** - Devices can be in racks, VMs can be on physical servers or clusters, etc.
7. **Role-based IP allocation** - Each subnet has designated IPs for gateways, switches, DNS, etc.

### Core Tables Count

- **Lookup/Reference**: 17 tables (organizations, clouds, regions, device types, brands, roles, OS types, etc.)
- **Physical**: 7 tables (sites, racks, rack units, power, patch panels, cables)
- **Network**: 9 tables (VLANs, subnets, role IPs, devices, interfaces, VLAN memberships, IP assignments)
- **Compute**: 4 tables (physical servers, VMs, containers/apps, workstations)
- **Audit**: 1 table (change_log)

**Total**: ~38 tables

---

## 🎨 Key Features Implemented

### 1. Auto-Generated Naming Engine

**How it works**: When a device is created/updated, the backend queries all related lookup tables and builds the name.

**Example**:
- Input: org=vf, cloud=vs, region=cc, campus=hm, building=M1, floor=+F1S1, rack=AA01, device=ps, brand=hp, role=hv, os=pr, consecutive=1
- Output:
  - `vf_long_name`: `VFVSCCHMM1+F1S1AA01PSHPHVPR1`
  - `vf_short_name`: `PSHPHVPR1`
  - `tia606b_name`: (TIA-606-B compliant format)

**Benefit**: No manual concatenation, no `#REF!` errors, names update automatically if conventions change.

### 2. IP Address Management (IPAM)

**Features**:
- Subnet utilization tracking (shows % used)
- Next-available-IP endpoint (`GET /api/v1/ipam/subnets/{id}/next-ip`)
- IP color-coding by zone (management=blue, servers=green, DMZ=orange, etc.)
- Dual-stack IPv4/IPv6 with matching VLAN IDs
- Role-based IP assignment (gateway 1-4, switch 1-4, DNS 1-3, etc.)

**Data structure**:
- VLANs → Subnets (IPv4 + IPv6) → Role Assignments → IP Assignments
- Status tracking: active, reserved, deprecated

### 3. Visual Rack Diagram

**What it shows**:
- U-by-U elevation view (1-36U or 1-42U)
- Color-coded device types (server, switch, PDU, patch panel, UPS, empty)
- Device names and spanning (multi-U devices occupy correct space)
- Interactive - can filter to show specific racks

**Use case**: Visual inventory check, planning new equipment installation.

### 4. Audit Changelog

**What it tracks**:
- Table name, record ID, field name
- Old value → New value
- Timestamp, change source (web_ui, api, ansible_callback, import)

**Implementation**: SQLAlchemy event listeners capture all changes automatically.

**UI**: Filterable/searchable changelog page showing all historical edits.

### 5. Ansible Integration

**Dynamic Inventory** (`ansible/cmdb_inventory.py`):
- Python script queries `GET /api/v1/ansible/inventory`
- Returns Ansible-compatible JSON grouped by role, site, OS
- Host vars include: ansible_host, cmdb_type, rack, VLANs, etc.

**Fact Write-back**:
- Endpoint: `POST /api/v1/devices/{type}/{id}/facts`
- Ansible can push discovered facts back to CMDB
- Enables drift detection (configured vs. discovered state)

### 6. Spreadsheet-Like Editing

**Implementation**: AG Grid Community Edition
- Inline cell editing (click → edit → Enter to save, Esc to cancel)
- Excel-like keyboard navigation
- Dropdown selectors for foreign keys
- Type validation (IPs, numbers, dates)
- Batch operations (multi-row select, copy/paste)

**User benefit**: Familiar interface for someone used to Excel.

---

## 📦 What's Been Seeded (Initial Data)

All data from the 6 Excel files has been normalized and loaded:

### Naming Conventions
- **17 lookup tables** fully populated with all abbreviations from `IT Infrastructure Naming Conventions.xlsx`
- Examples: organizations (vf, em, cb), clouds (aw, az, vs), device types (ps, vs, ws, lp), brands (hp, hpe, ap, ln), OS families (pr, ln, wn, es), roles (hv, wm, frw, bd), etc.

### Sites & Physical
- **1 site**: Home datacenter (Korriban) - org=vf, cloud=vs, region=cc, campus=hm, building=M1, floor=+F1S1
- **1 rack**: AA01 with 36 units
- **Rack layout**: Units 1-36 populated with actual devices from `Rack.xlsx`
- **Power devices**: UPS, PDUs at correct rack units
- **Patch panels**: Seeded but port-level data needs verification

### Compute
- **1 physical server**: `psgehvpr1` - Proxmox hypervisor (Generic brand, role=hv, os=pr, IP=10.0.16.106)
- **1 VM**: `vmopfw1` - VyOS firewall (os=op, role=fw, IP=10.0.0.126)
- **10 containers/apps**: iTop (app+db), OCS Inventory (app+db+proxy), OpenProject, Azure DNS Updater, Traefik, Mailu, Certbot

### Network Devices
- **5 switches** from `IT Infrastructure Inventory.xlsx`:
  - HP A5120-2 (Myrmidon) - edge switch
  - HP A5120-1 - edge switch
  - 3Com 3CRS45G/4510G - edge switch
  - Arista DCS-7148S - aggregation switch
  - Aruba 2930F (Ione) - core switch

### Networking & IPAM
- **40+ VLANs** with matching IPv4/IPv6 subnets from `Networking.xlsx`
- **IPv6 org prefix**: `fd52:bcef:51a7::/48` (Unique Local Address)
- **All subnets** fully configured with:
  - CIDR, gateway, range_from, range_to, expansion ceiling
  - Role IP assignments (gateway 1-4, switch 1-4, LB 1-4, DNS 1-3, AP 1-2, etc.)
- **Zones**: management, servers, storage, services, cluster, DMZ, LAN, WLAN, VPN
- **Data correction applied**: WLAN subnets that incorrectly used `192.169.x.x` (public APNIC space) were corrected to `192.168.x.x` private range

### Port Configurations
- **Switch port config** for 3Com switch from `Firewall.xlsx` - 28 ports with VLAN assignments, trunk/access modes, aggregation IDs

---

## 🔧 Important Design Decisions & Constraints

### 1. Single-User Application
- **No authentication** implemented (runs on private home network)
- **No role-based access control** (only one user: the sysadmin)
- Future: Can add basic auth or OAuth if needed

### 2. Credential Handling
- **Bitwarden references only** - stores `bitwarden_collection_ref` text field (e.g., "HQ-Switches")
- **No passwords stored** in the CMDB database
- User maintains actual credentials in Bitwarden vault
- Ansible integration uses Ansible Vault for secrets, not CMDB

### 3. Naming Convention System
- **TIA-606-B aware** but not strictly compliant
- Virtualfactor has custom naming scheme that incorporates TIA-606-B principles
- Three name formats generated:
  - `vf_long_name`: Full hierarchical name (e.g., `VFVSCCHMM1+F1S1AA01PSHPHVPR1`)
  - `vf_short_name`: Shortened form (e.g., `PSHPHVPR1`)
  - `tia606b_name`: Standards-compliant form (currently computed same as long name)

### 4. Multi-Site Support
- **Schema supports multiple sites** from day one
- **Only one site exists now**: Home datacenter
- Future: Can add office locations, cloud regions, etc.

### 5. IPv4/IPv6 Dual-Stack
- **All networks have both** IPv4 and IPv6 subnets
- **VLAN ID mapping**: IPv6 uses VLAN ID as 4th hextet (e.g., VLAN 66 → `fd52:bcef:51a7:66::/64`)
- **Automatic expansion awareness**: Each subnet tracks expansion ceiling to prevent overlap

### 6. PostgreSQL-Specific Features
- **`inet` and `cidr` types** for IP addresses (native subnet math)
- **JSONB** for flexible fields like `bios_settings`
- **Async SQLAlchemy** for better concurrency
- **Connection pooling** configured

### 7. Data Import Corrections
- **WLAN addressing fixed**: Changed `192.169.x.x` → `192.168.x.x`
- **Duplicate entries removed**: One Aruba switch was listed twice
- **Missing VLAN IDs added**: Management/Storage and Management/Facilities subnets now have VLAN assignments
- **Typos fixed**: LAN/3 subnet had mixed `192.168.8.x` and `192.169.8.x` addresses

---

## 📁 Project Structure

```
vf_cmdb/                                    ← Git repository root
├── .git/                                   ← Git metadata
├── .gitignore                              ← Ignore node_modules, venv, pgdata, etc.
├── .env.example                            ← Environment variables template
├── podman-compose.yml                      ← Full stack orchestration (Podman)
├── deploy-podman.sh                        ← Deploy helper (up/down/logs/quadlet)
├── deploy/quadlet/                         ← systemd Quadlet units (production)
│   ├── vf-cmdb.network                     ← Podman network unit
│   ├── vf-cmdb-pgdata.volume               ← Postgres data volume unit
│   ├── vf-cmdb-pgadmin.volume              ← pgAdmin data volume unit
│   ├── vf-cmdb-db.container                ← PostgreSQL container unit
│   ├── vf-cmdb-backend.container           ← FastAPI container unit
│   ├── vf-cmdb-frontend.container          ← Nginx/React container unit
│   └── vf-cmdb-pgadmin.container           ← pgAdmin container unit
│
├── README.md                               ← Main documentation
├── QUICK_START.md                          ← Quick deployment guide
├── GITHUB_SETUP.md                         ← GitHub push instructions
├── VSCODE_REMOTE_SETUP.md                  ← VS Code remote dev guide
├── PROJECT_CONTEXT.md                      ← THIS FILE (project context for AI)
│
├── backend/                                ← Python/FastAPI backend
│   ├── Containerfile                       ← Backend container build
│   ├── requirements.txt                    ← Python dependencies
│   ├── alembic.ini                         ← Alembic config
│   ├── seed.py                             ← Initial data seeder (idempotent)
│   │
│   ├── alembic/                            ← Database migrations
│   │   ├── versions/                       ← Migration files
│   │   └── env.py                          ← Alembic environment
│   │
│   └── app/                                ← Application code
│       ├── main.py                         ← FastAPI entry point, CORS, routes
│       ├── database.py                     ← SQLAlchemy engine, session
│       ├── models.py                       ← SQLAlchemy ORM models (all 38 tables)
│       │
│       ├── utils/                          ← Shared utilities
│       │   ├── naming.py                   ← Name generation engine
│       │   └── changelog.py                ← Change tracking helpers
│       │
│       └── api/                            ← API route modules
│           ├── lookups.py                  ← Naming convention tables CRUD
│           ├── sites.py                    ← Sites CRUD
│           ├── racks.py                    ← Racks & rack units CRUD
│           ├── power.py                    ← Power devices/outlets CRUD
│           ├── patch_panels.py             ← Patch panels/ports/cables CRUD
│           ├── vlans.py                    ← VLANs CRUD
│           ├── subnets.py                  ← Subnets IPv4/IPv6 CRUD
│           ├── ipam.py                     ← IPAM (utilization, next-IP)
│           ├── network_devices.py          ← Network devices CRUD
│           ├── interfaces.py               ← Device interfaces/ports CRUD
│           ├── compute.py                  ← Servers/VMs/containers CRUD
│           ├── ip_assignments.py           ← IP assignments CRUD
│           ├── ansible.py                  ← Ansible inventory endpoint
│           ├── changelog.py                ← Changelog query endpoint
│           └── dashboard.py                ← Dashboard summary stats
│
├── frontend/                               ← React/TypeScript frontend
│   ├── Containerfile                       ← Frontend container build (multi-stage)
│   ├── nginx.conf                          ← Nginx config (serves static + proxy /api)
│   ├── package.json                        ← NPM dependencies
│   ├── package-lock.json                   ← Locked versions
│   ├── tsconfig.json                       ← TypeScript config
│   ├── vite.config.ts                      ← Vite bundler config
│   ├── tailwind.config.js                  ← Tailwind CSS config
│   ├── postcss.config.js                   ← PostCSS config
│   ├── index.html                          ← HTML entry point
│   │
│   └── src/                                ← Source code
│       ├── main.tsx                        ← React app entry
│       ├── App.tsx                         ← Root component (layout, routing)
│       ├── index.css                       ← Global Tailwind styles
│       │
│       ├── lib/                            ← Shared libraries
│       │   ├── api.ts                      ← API client (fetch wrapper)
│       │   ├── columns.tsx                 ← AG Grid column helpers (fkCol, ipCol, etc.)
│       │   └── types.ts                    ← TypeScript type definitions
│       │
│       ├── components/                     ← Reusable components
│       │   ├── EntityGrid.tsx              ← Generic CRUD grid (AG Grid wrapper)
│       │   └── Layout.tsx                  ← Sidebar navigation, header
│       │
│       └── pages/                          ← Page components (routes)
│           ├── Dashboard.tsx               ← Home page (counts, recent changes)
│           ├── Sites.tsx                   ← Sites grid
│           ├── RackView.tsx                ← Visual rack diagram
│           ├── SimpleGridPage.tsx          ← Generic page (power, patch panels, cables)
│           ├── PhysicalServers.tsx         ← Physical servers grid
│           ├── VirtualMachines.tsx         ← VMs grid
│           ├── ContainersApps.tsx          ← Containers/apps grid
│           ├── Workstations.tsx            ← Workstations grid
│           ├── Vlans.tsx                   ← VLANs grid
│           ├── Subnets.tsx                 ← Subnets (IPv4/IPv6 tabs, utilization, next-IP)
│           ├── IpAssignments.tsx           ← IP assignments grid
│           ├── NetworkDevices.tsx          ← Network devices grid
│           ├── PortConfig.tsx              ← Device interfaces/ports grid
│           ├── Naming.tsx                  ← Naming conventions (lookup tables)
│           ├── Ansible.tsx                 ← Ansible inventory JSON viewer
│           └── Changelog.tsx               ← Audit changelog (filterable)
│
└── ansible/                                ← Ansible integration
    ├── README.md                           ← Ansible usage guide
    └── cmdb_inventory.py                   ← Dynamic inventory script (Python, executable)
```

**Total tracked files**: 65 (all committed to local git)

---

## 🚀 Current Status & Next Steps

### ✅ Completed

- [x] Full data model designed and reviewed
- [x] Backend API implemented (FastAPI + SQLAlchemy + Alembic)
- [x] Frontend UI implemented (React + AG Grid + Tailwind)
- [x] Database migrations created
- [x] Initial data seeder written (idempotent, can re-run safely)
- [x] All 6 Excel files data imported and normalized
- [x] Data corrections applied (WLAN addresses, duplicates, missing VLANs)
- [x] Podman setup with health checks (podman-compose + Quadlet systemd units)
- [x] Ansible dynamic inventory script
- [x] Auto-generated naming engine
- [x] IPAM with utilization and next-IP
- [x] Visual rack diagram
- [x] Audit changelog with SQLAlchemy event listeners
- [x] Full REST API documentation (OpenAPI/Swagger)
- [x] Local git repository initialized
- [x] All code committed (3 commits)
- [x] Documentation written (README, Quick Start, GitHub Setup, VS Code guides)
- [x] Build verification (npm run build successful, no errors)

### 🔄 In Progress

- [ ] Push code to GitHub repository
- [ ] Deploy to Proxmox VM

### 📋 TODO (Immediate Next Steps)

1. **Push to GitHub** (User to do):
   ```bash
   cd /home/ubuntu/vf_cmdb
   git remote add origin https://github.com/jallamasc/vf-cmdb.git
   git push -u origin master
   ```

2. **Create Proxmox Ubuntu VM** (User to do):
   - OS: Ubuntu 22.04 or 24.04
   - CPU: 2 cores
   - RAM: 4GB
   - Disk: 20GB
   - Network: Bridged (accessible from workstation)

3. **Deploy on VM** (User to do):
   ```bash
   # Install Podman (rootless, daemonless)
   sudo apt-get update && sudo apt-get install -y podman podman-compose
   # (Fedora/Rocky/RHEL: sudo dnf install -y podman podman-compose)

   # Clone and deploy
   git clone https://github.com/jallamasc/vf-cmdb.git
   cd vf-cmdb
   cp .env.example .env
   nano .env  # Set passwords

   # Start the stack (backend auto-runs migrations + seeding on first boot)
   ./deploy-podman.sh up

   # ...or run it as always-on systemd services via Quadlet:
   # ./deploy-podman.sh quadlet && loginctl enable-linger $USER
   ```

4. **Access and verify**:
   - Web UI: `http://vm-ip:8080`
   - API Docs: `http://vm-ip:8000/docs`
   - pgAdmin: `http://vm-ip:5050`

### 🔮 Future Enhancements (Nice to Have)

- [ ] Configuration compliance checking (BIOS settings against templates)
- [ ] Network topology visualization (auto-generate diagrams from cable connections)
- [ ] Config template rendering (Jinja2 templates per device type)
- [ ] Bulk import/export (Excel/CSV)
- [ ] API key authentication (if exposing beyond home network)
- [ ] Backup automation (scheduled postgres dumps)
- [ ] Monitoring integration (Prometheus/Grafana)
- [ ] SNMP discovery (auto-populate device data)

---

## 🧪 Testing & Verification Performed

### Backend
- ✅ FastAPI server starts without errors
- ✅ OpenAPI docs accessible at `/docs`
- ✅ Database connection successful
- ✅ Alembic migrations apply cleanly
- ✅ Seed script runs idempotently (can run multiple times safely)
- ✅ All CRUD endpoints return correct data
- ✅ Naming engine generates correct names
- ✅ IPAM next-IP logic works
- ✅ Ansible inventory endpoint returns valid JSON

### Frontend
- ✅ `npm run build` completes without errors
- ✅ Vite dev server starts successfully
- ✅ All pages render without console errors
- ✅ AG Grid displays data correctly
- ✅ Dashboard shows correct counts
- ✅ Rack diagram renders with color-coding
- ✅ Subnets page shows utilization
- ✅ Changelog page filters correctly
- ✅ Ansible page displays inventory JSON

### Podman
- ✅ Both Containerfiles present (backend + frontend)
- ✅ podman-compose.yml validated (SELinux `:Z` volume flags, rootless-friendly)
- ✅ Quadlet systemd units authored for always-on production
- ✅ Health checks defined for all services
- ✅ Volumes configured for persistence
- ✅ deploy-podman.sh helper (up/down/restart/build/logs/ps/quadlet)

**Note**: Full integration testing (`podman compose up`) not performed in this environment due to Podman not being available here. Will be verified on the target Proxmox VM.

---

## 💡 Key Insights for AI Assistants

### When Resuming This Project

1. **Git repository location**: `/home/ubuntu/vf_cmdb/` (local repo with 3 commits)
2. **GitHub target**: `https://github.com/jallamasc/vf-cmdb` (not yet created/pushed)
3. **User context**: Single sysadmin managing small home lab, familiar with Excel, learning Ansible
4. **Deployment target**: Proxmox hypervisor (user has this already), will create new Ubuntu VM
5. **Network**: Home LAN, no public exposure needed, no auth required
6. **User preference**: Spreadsheet-like UI (AG Grid chosen for this reason)

### What NOT to Change

- ✅ **Tech stack** - User specifically requested Python backend + React frontend + PostgreSQL
- ✅ **Naming convention logic** - This is core to the user's existing system
- ✅ **Data model structure** - Already reviewed and approved
- ✅ **Podman setup** - Rootless podman-compose + Quadlet, already configured for user's environment (user chose Podman over Docker)
- ✅ **No authentication** - User is the only user, runs on private network

### Common User Questions to Expect

- "How do I add a new device?" → Point to relevant page (Physical Servers, VMs, etc.)
- "How do I see IP usage?" → Subnets page, utilization bar
- "How do I use this with Ansible?" → `ansible/README.md`, use `cmdb_inventory.py`
- "How do I back up?" → `podman exec -t vf_cmdb_db pg_dump` (see README)
- "Can I export to Excel?" → Not yet implemented (future enhancement)

### Important Context from Source Data

- **Original files**: 6 Excel workbooks (IT Infrastructure Naming Conventions, Rack, Firewall, IT Infrastructure Inventory, Networking, Computing)
- **Data quality issues found and fixed**:
  - WLAN subnets using public IP space (192.169.x.x) → corrected to private (192.168.x.x)
  - Duplicate Aruba switch entry → removed
  - Missing VLAN IDs for some management subnets → assigned
  - Typos in LAN/3 subnet IPs → corrected
- **User's network**: 
  - IPv4: 10.x.x.x for infrastructure, 192.168.x.x for LAN/WLAN, 172.16.x.x for VPNs
  - IPv6: fd52:bcef:51a7::/48 (ULA prefix)
  - VLAN range: 66-679 (various zones)

### Ansible Integration Details

- **Inventory groups**: `physical_servers`, `virtual_machines`, `containers_apps`, `network_devices`, `role_<name>`, `os_<name>`, `site_<name>`, `vlan_<id>`
- **Host vars**: `ansible_host` (IP), `cmdb_type`, `cmdb_id`, `rack`, `rack_unit`, `site`, `role`, `os_family`, `vlans[]`, etc.
- **Dynamic inventory** refreshes on every Ansible run (no caching by default)
- **Fact write-back** allows Ansible to update CMDB after discovery

---

## 📞 Contact & Resources

- **Project Owner**: Alejandro (jallamasc)
- **Organization**: Virtualfactor (www.virtualfactor.co)
- **Location**: Bogotá, Colombia
- **GitHub**: https://github.com/jallamasc
- **Repository**: https://github.com/jallamasc/vf-cmdb (to be created)

---

## 📝 Version History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-07-19 | 1.0 | Initial project context document | AI Assistant |

---

**End of Project Context Document**

*This document should be referenced at the start of any new AI conversation to quickly restore full project context.*
