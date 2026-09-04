# Virtualfactor IT CMDB - Memory Bank
## Complete Project Rebuild Specification for LLM Agents

**Purpose**: This document provides complete, authoritative context for rebuilding the Virtualfactor IT CMDB from ground zero across session boundaries. It preserves architectural decisions, user preferences, data model rationale, and critical design patterns to prevent memory rot.

**Last Updated**: 2026-09-03  
**Project Owner**: Alejandro (jallamasc), Virtualfactor, Bogotá, Colombia  
**Repository**: https://github.com/jallamasc/vf-cmdb  
**Local Path**: `/home/ubuntu/vf_cmdb/`

---

## 🎯 Project Mission

Build a **self-hosted, production-grade Configuration Management Database (CMDB)** for managing Virtualfactor's complete IT infrastructure with:
- Auto-generated hierarchical naming conventions
- Comprehensive audit logging
- IPv4/IPv6 dual-stack IPAM with utilization tracking
- Visual rack diagrams
- Ansible dynamic inventory integration
- Bitwarden credential references (NO credential storage)
- Multi-site support (currently one site: "Home" in Bogotá)

---

## 🏗️ Architecture Stack (FIXED - DO NOT CHANGE)

### Core Technology Decisions

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Backend Framework** | FastAPI | Latest | Async Python, auto-docs, type hints |
| **ORM** | SQLAlchemy | 2.x (async) | Mature, supports PostgreSQL types |
| **Database** | PostgreSQL | 16 | INET/CIDR types, JSONB, robust |
| **Migrations** | Alembic | Latest | Industry standard with SQLAlchemy |
| **Frontend Framework** | React | 18+ | Component-based, modern |
| **Language** | TypeScript | Latest | Type safety for frontend |
| **Build Tool** | Vite | Latest | Fast, modern, dev experience |
| **UI Library** | Tailwind CSS | Latest | Utility-first styling |
| **Data Grid** | AG Grid Community | Latest | Excel-like editing experience |
| **HTTP Client** | Axios | Latest | Promise-based, interceptors |
| **State Management** | TanStack Query (React Query) | v4+ | Server state, caching |
| **Container Runtime** | **Podman** | Latest | **Rootless, daemonless, systemd integration** |
| **Orchestration** | podman-compose / Quadlet | Latest | Dev: compose, Prod: systemd units |
| **Deployment Target** | Proxmox Ubuntu VM | 22.04+ | Local datacenter, full control |

### ⚠️ CRITICAL: Container Technology

**DOCKER WAS COMPLETELY REPLACED BY PODMAN** in commit `212988c` (2026-09-03).

**Why Podman**:
- Rootless containers (better security)
- Daemonless architecture (no background daemon)
- Native systemd integration via Quadlet
- Drop-in Docker Compose compatibility
- User requirement / preference

**Files Changed**:
- `Dockerfile` → `Containerfile` (both backend and frontend)
- `docker-compose.yml` → `podman-compose.yml`
- Added `deploy/quadlet/*.{container,volume,network}` systemd units
- Added `deploy-podman.sh` helper script
- All documentation updated to reference Podman

**DO NOT**:
- Reintroduce Docker references
- Use `docker` commands in scripts or docs
- Create `Dockerfile` when `Containerfile` exists

---

## 📊 Data Model Foundation

### Hierarchical Naming Convention

**Format**: `{org}-{site}-{role}-{type_abbr}-{subtype_abbr}-{consecutive_number:03d}`

**Example**: `vf-home-prod-srv-db-001` (Virtualfactor, Home site, Production role, Server, Database subtype, number 001)

**Lookup Tables (17 total)**:
- `lk_organizations`: Organization identifiers (e.g., "vf")
- `lk_sites`: Site codes (e.g., "home", "bog1", "aws-us-east")
- `lk_device_roles`: Functional roles (prod, dev, test, mgmt, etc.)
- `lk_compute_device_types`: srv, vm, ct, wks
- `lk_compute_subtypes`: db, web, app, dc, etc.
- `lk_network_device_types`: sw, rt, fw, ap, etc.
- `lk_network_subtypes`: core, access, dist, etc.
- `lk_app_types`: app, web, api, db, proxy, etc.
- `lk_brands`: Vendor names (Dell, HP, Ubiquiti, Cisco, etc.)
- `lk_os_families`: linux, windows, bsd, vmware, etc.
- `lk_os_versions`: Specific OS versions
- `lk_cluster_types`: vsan, vcenter, k8s, docker, proxmox, etc.
- `lk_datacenter_zones`: Network zones (corp, dmz, mgmt, guest, etc.)
- `lk_port_modes`: access, trunk, hybrid
- `lk_admin_statuses`: up, down, testing
- `lk_device_interface_speeds`: 1G, 10G, 25G, 40G, 100G, etc.
- `lk_vlan_purposes`: management, servers, workstations, iot, guest, etc.

**Naming Engine**: Backend auto-generates `short_name` and `long_name` on create/update based on these lookups.

### Entity Categories

**Physical Infrastructure**:
- `sites`: Physical locations with addresses
- `site_addresses`: **NEW** - Separated address data (street, city, postal, country)
- `racks`: 42U+ cabinets with front elevation tracking
- `rack_units`: Device-to-rack-U mappings
- `power_devices`: UPS, PDU tracking
- `patch_panels`: Structured cabling

**Compute Layer**:
- `physical_servers`: Bare metal hosts
- `virtual_machines`: VMs hosted on physical servers
- `containers_apps`: Containers/apps (can run on VM or physical)
- `workstations`: End-user devices

**Network Layer**:
- `network_devices`: Switches, routers, firewalls, APs
- `device_interfaces`: Port configurations (trunks, access, LAG)
- `vlans`: VLAN definitions with zone classification
- `cables`: Physical cable documentation

**IP Address Management**:
- `subnets_ipv4`: IPv4 networks with CIDR notation
- `subnets_ipv6`: IPv6 networks
- `ip_assignments`: IPs assigned to devices/interfaces

**Auditing**:
- `changelog`: Immutable audit log (SQLAlchemy event listeners)

### Database Design Patterns

**Foreign Keys**:
- All lookups: `{entity}_id` → `lk_{table}.id`
- Cross-entity: `site_id`, `rack_id`, `host_server_id`, etc.
- Nullable where optional, NOT NULL where required

**PostgreSQL-Specific Types**:
- `INET`: For IPv4/IPv6 addresses
- `CIDR`: For network ranges
- `JSONB`: For `custom_fields` (flexible, user-defined data)

**Custom Fields System**:
- `sites.custom_fields`: JSONB column
- Allows user-defined dropdowns/text/numbers via ColumnManager UI
- Persisted per-entity-type in localStorage + database
- See `frontend/src/lib/columns.tsx` → `customCol()` helper

---

## 🔌 API Design Patterns

### RESTful Endpoint Structure

**Base URL**: `http://localhost:8000/api/v1`

**Generic Entity Endpoints** (auto-generated from `ENTITY_REGISTRY`):
```
GET    /api/v1/{resource}           → List all
GET    /api/v1/{resource}/{id}      → Get one
POST   /api/v1/{resource}           → Create
PATCH  /api/v1/{resource}/{id}      → Update (partial)
DELETE /api/v1/{resource}/{id}      → Delete
```

**Special Endpoints**:
- `GET /api/v1/naming/{device_type}/{device_id}`: Get generated names
- `GET /api/v1/subnets-ipv4/{id}/utilization`: IP usage stats
- `GET /api/v1/subnets-ipv4/{id}/next-free-ip`: Get next available IP
- `GET /api/v1/ansible/inventory`: Dynamic inventory JSON
- `POST /api/v1/devices/{device_type}/{device_id}/facts`: Ansible fact write-back
- `GET /api/v1/changelog`: Audit log (limit 1000)

**Metadata**:
- `GET /api/v1/meta/entities`: Returns `{"lookup_tables": [...], "reference_tables": [...]}`

### Backend Registry System

**File**: `backend/app/registry.py`

**Purpose**: Central registration of all entities for generic CRUD routes

```python
ENTITY_REGISTRY = {
    "sites": models.Site,
    "racks": models.Rack,
    "physical-servers": models.PhysicalServer,
    # ... all entities
    "site-addresses": models.SiteAddress,  # Reference data
}

LOOKUP_SLUGS = [...]  # Naming convention lookups
REFERENCE_SLUGS = ["site-addresses"]  # General reference data
```

**Adding New Entities**:
1. Define model in `models.py`
2. Register in `ENTITY_REGISTRY` with kebab-case slug
3. Create Alembic migration
4. Add to `seed.py` if initial data needed
5. Frontend auto-discovers via `/meta/entities`

---

## 💾 Data Sources & Corrections

### Original Excel Files (6 files analyzed)

1. **VF_naming.xlsx**: Naming convention lookup data
2. **VF_Prod.xlsx**: Production servers inventory
3. **VF_Ntwk.xlsx**: Network devices, switches, APs
4. **VF_WorkStations.xlsx**: End-user devices
5. **VF_VMs.xlsx**: Virtual machines
6. **VF_IPAM.xlsx**: IP addressing scheme

### Critical Data Quality Issues Fixed

**WLAN Addressing Error** (USER CONFIRMED):
- **Original**: 192.169.0.0/24 (INVALID - public IP space)
- **Correction**: ⚠️ **PENDING USER DECISION** (see SESSION_STATE.md)
- **Context**: User raised this issue 2026-09-03, needs to choose valid range
- **Options presented**: 192.168.13.0/24 (next sequential), 192.168.20.0/24 (reserved block)

**Other Corrections Applied**:
- Removed duplicate entries (same device listed multiple times)
- Normalized brand names (e.g., "ubiquiti" → "Ubiquiti")
- Filled missing lookup abbreviations
- Corrected IPv6 formats
- Assigned default roles where missing

---

## 🔒 Security & Credentials

### Bitwarden Integration

**HARD RULE**: NO credentials stored in CMDB database.

**Pattern**:
- Store only `bitwarden_ref` field (string identifier)
- Example: `"VF-PROD-SRV-DB-001"` or `"Switch-Core-01-Admin"`
- User retrieves actual credentials from Bitwarden manually or via CLI
- Consider future: Bitwarden CLI integration (`bw get password {ref}`)

**Affected Tables**:
- `physical_servers.bitwarden_ref`
- `virtual_machines.bitwarden_ref`
- `network_devices.bitwarden_ref`
- `workstations.bitwarden_ref`
- `containers_apps.bitwarden_ref`

---

## 🌐 Network Architecture Decisions

### Current Site Structure

**Single Site**: "Home" (Bogotá, Colombia)
- Future expansion planned (multi-site support built in)
- All current infrastructure at home site

### IP Addressing Scheme

**Valid Private Ranges** (RFC 1918):
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16` ← **Current primary range**

**Current Allocations**:
- LANs: 192.168.1.0/24 through 192.168.12.0/24
- WLANs: ⚠️ **PENDING** - needs user decision on 192.169.x.x replacement
- Management: Various subnets
- Guest: Isolated network

**VLAN Zones**:
- `corp`: Corporate network
- `dmz`: Demilitarized zone
- `mgmt`: Management network
- `guest`: Guest WiFi
- `iot`: IoT devices
- `storage`: Storage network

### Dual-Stack Support

**IPv4**: Primary addressing with CIDR notation
**IPv6**: Full support with `inet` PostgreSQL type
- Both tracked in `ip_assignments` table
- Link to `subnets_ipv4` / `subnets_ipv6`

---

## 🎨 Frontend Architecture

### Component Hierarchy

**Layout Structure**:
```
App.tsx (Router)
└── Layout.tsx (Nav + Outlet)
    ├── Sites.tsx
    ├── PhysicalServers.tsx
    ├── VirtualMachines.tsx
    ├── NetworkDevices.tsx
    ├── Naming.tsx (Naming conventions manager)
    ├── ReferenceData.tsx (Site addresses, etc.)
    ├── Subnets.tsx (IPAM)
    ├── RackView.tsx (Visual diagrams)
    ├── Changelog.tsx (Audit log)
    └── Ansible.tsx (Inventory viewer)
```

### Shared Components

**EntityGrid.tsx**: Generic editable grid
- Props: `resource`, `columns`, `newRowDefaults`, `toolbarExtra`
- Handles: CRUD operations, loading states, error handling
- AG Grid wrapper with automatic API integration

**ColumnManager.tsx**: Dynamic column builder
- Allows users to add custom columns (text, number, dropdown)
- Integrates with `custom_fields` JSONB
- Persists to localStorage per entity type

### Data Fetching Patterns

**TanStack Query (React Query)**:
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ["sites"],
  queryFn: () => api.list("sites"),
});
```

**Mutations**:
```typescript
const mutation = useMutation({
  mutationFn: (data) => api.create("sites", data),
  onSuccess: () => queryClient.invalidateQueries(["sites"]),
});
```

### Custom Column System

**Storage**: `localStorage` key pattern: `vf-cmdb:columns:{entity-slug}`

**Hook**: `useCustomColumns(storageKey)`
- Returns: `{ cols, addCol, updateCol, removeCol }`
- Auto-persists on changes

**Column Helpers** (`frontend/src/lib/columns.tsx`):
- `textCol()`: Basic text input
- `numCol()`: Number input
- `fkCol()`: Foreign key dropdown (shows "Full Name - abbreviation")
- `ipCol()`: IP address input
- `roCol()`: Read-only display
- `customCol()`: Custom field (JSONB backed)

**Dropdown Display Format**:
```typescript
lookupLabel(o) → "Full Name - abbreviation" (if both exist)
              → "Full Name" (fallback)
              → "label" / "simple_name" (other fallbacks)
```

---

## 🚀 Deployment Architecture

### Development Workflow (podman-compose)

**Start Stack**:
```bash
./deploy-podman.sh up
```

**Services**:
- Frontend: http://localhost:3001 (Nginx + React)
- Backend: http://localhost:8000 (FastAPI)
- Database: localhost:5433 (PostgreSQL)
- pgAdmin: http://localhost:5050

**Environment**: `.env` file (copy from `.env.example`)

### Production Workflow (Quadlet + systemd)

**Install Quadlet Units**:
```bash
./deploy-podman.sh quadlet
```

**Systemd Management**:
```bash
systemctl --user status vf-cmdb-backend
systemctl --user restart vf-cmdb-frontend
journalctl --user -u vf-cmdb-db -f
```

**Files**: `deploy/quadlet/*.{container,volume,network}`

**Features**:
- Auto-start on boot
- Automatic restarts on failure
- Proper dependency ordering
- Health checks
- Centralized logging via journald

### Volume Persistence

**Podman Volumes**:
- `vf-cmdb-pgdata`: PostgreSQL data (survives container removal)
- `vf-cmdb-pgadmin`: pgAdmin config

**SELinux Labels**: All bind mounts use `:Z` flag for rootless compatibility

---

## 🔧 Ansible Integration

### Dynamic Inventory

**Script**: `ansible/cmdb_inventory.py`
- Executable Python script (chmod +x)
- Fetches from `GET /api/v1/ansible/inventory`
- Standard library only (no dependencies)
- Environment variables: `CMDB_API_URL`, `CMDB_TIMEOUT`

**Usage**:
```bash
# Test inventory
./ansible/cmdb_inventory.py --list

# Use with playbooks
ansible-playbook -i ansible/cmdb_inventory.py site.yml

# Set as default in ansible.cfg
[defaults]
inventory = ./ansible/cmdb_inventory.py
```

**Groups Generated**:
- `physical_servers`, `virtual_machines`, `network_devices`, etc.
- `role_{role_abbr}`: e.g., `role_prod`, `role_dev`
- `os_{os_family}`: e.g., `os_linux`, `os_windows`
- `site_{site_code}`: e.g., `site_home`

**Host Variables**:
```json
{
  "ansible_host": "192.168.x.x",
  "cmdb_type": "physical_server",
  "cmdb_id": 123,
  "site": "home",
  "role": "prod",
  "os_family": "linux"
}
```

### Fact Write-Back

**Endpoint**: `POST /api/v1/devices/{device_type}/{device_id}/facts`

**Example Playbook Task**:
```yaml
- name: Update CMDB with discovered facts
  uri:
    url: "{{ cmdb_url }}/devices/physical-servers/{{ cmdb_id }}/facts"
    method: POST
    body_format: json
    body:
      os_version: "{{ ansible_distribution_version }}"
      serial_number: "{{ ansible_product_serial }}"
```

---

## 📋 Critical Implementation Patterns

### Backend: SQLAlchemy Event Listeners

**Audit Logging** (`backend/app/models.py`):
```python
@event.listens_for(Session, "before_flush")
def before_flush(session, flush_context, instances):
    # Capture old values before commit
    # Write to changelog table
```

**Automatic Naming** (on insert/update):
```python
@event.listens_for(PhysicalServer, "before_insert")
@event.listens_for(PhysicalServer, "before_update")
def generate_names(mapper, connection, target):
    # Call naming engine
    # Set short_name and long_name
```

### Frontend: AG Grid Configuration

**Editable Cells**:
```typescript
{
  field: "field_name",
  editable: true,
  cellEditor: "agTextCellEditor", // or agNumberCellEditor, agSelectCellEditor
  onCellValueChanged: handleCellChange,
}
```

**Foreign Key Dropdowns**:
```typescript
fkCol("site_id", "Site", siteOptions) → {
  field: "site_id",
  cellEditor: "agSelectCellEditor",
  cellEditorParams: { values: siteOptions },
  valueFormatter: (params) => lookupLabel(siteMap[params.value]),
}
```

### Database Migration Pattern

**Create Migration**:
```bash
cd backend
alembic revision -m "description"
```

**Migration Template**:
```python
def upgrade() -> None:
    op.create_table(
        "table_name",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("field", sa.String(255), nullable=False),
    )

def downgrade() -> None:
    op.drop_table("table_name")
```

**Apply**:
```bash
alembic upgrade head
```

---

## 🚫 What NOT to Change (Critical Rules)

### DO NOT:

1. **Replace Podman with Docker** - User requirement, commit 212988c
2. **Store credentials in database** - Bitwarden references only
3. **Change primary key column names** - Always `id` (Integer, auto-increment)
4. **Remove audit logging** - Event listeners must stay
5. **Change kebab-case API slugs** - Frontend depends on exact strings
6. **Remove TypeScript types** - Type safety is critical
7. **Replace AG Grid** - Excel-like UX is core requirement
8. **Change naming convention hierarchy** - Established pattern in production
9. **Remove PostgreSQL-specific types** - INET/CIDR required for IPAM
10. **Alter ENTITY_REGISTRY pattern** - Generic CRUD depends on it

### User Preferences (Established):

- **Language**: English (conversation + code)
- **Location**: Bogotá, Colombia (UTC-5)
- **Naming**: Kebab-case for slugs, snake_case for DB, camelCase for frontend
- **Commit Style**: Conventional Commits (feat:, fix:, docs:, refactor:)
- **Documentation**: Comprehensive, markdown, always up-to-date
- **Error Handling**: Explicit, user-friendly messages
- **Testing**: Manual testing + validation after changes

---

## 📁 Project Structure Reference

```
vf_cmdb/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + routes
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── registry.py          # Entity registration
│   │   ├── seed.py              # Initial data
│   │   └── __init__.py
│   ├── alembic/
│   │   ├── versions/
│   │   │   ├── 0001_initial.py
│   │   │   └── 0002_site_addresses.py
│   │   ├── env.py
│   │   └── alembic.ini
│   ├── Containerfile            # Backend container (was Dockerfile)
│   ├── requirements.txt
│   └── ruff.toml                # Linter config
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.tsx       # Navigation + layout
│   │   │   ├── EntityGrid.tsx   # Generic grid component
│   │   │   └── ColumnManager.tsx # Custom column UI
│   │   ├── pages/
│   │   │   ├── Sites.tsx
│   │   │   ├── PhysicalServers.tsx
│   │   │   ├── NetworkDevices.tsx
│   │   │   ├── Naming.tsx       # Naming conventions
│   │   │   ├── ReferenceData.tsx # Site addresses, etc.
│   │   │   ├── Subnets.tsx      # IPAM
│   │   │   ├── RackView.tsx     # Visual diagrams
│   │   │   ├── Changelog.tsx    # Audit log
│   │   │   └── Ansible.tsx      # Inventory
│   │   ├── lib/
│   │   │   ├── api.ts           # Axios client
│   │   │   ├── columns.tsx      # Column helpers
│   │   │   └── useCustomColumns.ts # Custom column hook
│   │   ├── App.tsx              # Router
│   │   └── main.tsx             # Entry point
│   ├── dist/                     # Build output (gitignored)
│   ├── Containerfile            # Frontend container (was Dockerfile)
│   ├── nginx.conf               # Nginx proxy config
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── ansible/
│   ├── cmdb_inventory.py        # Dynamic inventory script
│   └── README.md                # Integration guide
├── deploy/
│   ├── quadlet/                 # Systemd Quadlet units
│   │   ├── vf-cmdb.network
│   │   ├── vf-cmdb-pgdata.volume
│   │   ├── vf-cmdb-pgadmin.volume
│   │   ├── vf-cmdb-db.container
│   │   ├── vf-cmdb-backend.container
│   │   ├── vf-cmdb-frontend.container
│   │   └── vf-cmdb-pgadmin.container
│   ├── scripts/                 # Operational scripts
│   │   ├── bootstrap.sh
│   │   ├── vf-cmdb-backup.sh
│   │   ├── vf-cmdb-restore.sh
│   │   └── vf-cmdb-update.sh
│   ├── systemd/                 # Timer units
│   │   ├── vf-cmdb-backup.timer
│   │   ├── vf-cmdb-backup.service
│   │   ├── vf-cmdb-update.timer
│   │   └── vf-cmdb-update.service
│   ├── ansible/                 # Ansible deployment playbooks
│   │   ├── site.yml
│   │   ├── inventory.example.ini
│   │   ├── ansible.cfg
│   │   ├── requirements.yml
│   │   └── README.md
│   ├── cloud-init/              # VM provisioning
│   │   ├── user-data.yaml
│   │   └── README.md
│   └── ci-templates/            # GitHub Actions workflows
│       └── github-workflows/
│           ├── ci.yml
│           ├── codeql.yml
│           └── security-scan.yml
├── docs/
│   ├── DEPLOYMENT_MANUAL.md     # Step-by-step deployment
│   ├── OPERATIONS.md            # Day-to-day operations
│   └── DISASTER_RECOVERY.md     # Backup/restore procedures
├── podman-compose.yml           # Dev orchestration (was docker-compose.yml)
├── deploy-podman.sh             # Helper script for Podman operations
├── .env.example                 # Environment template
├── .gitignore
├── README.md                    # Primary documentation
├── QUICK_START.md               # Fast deployment guide
├── PROJECT_CONTEXT.md           # Detailed project context
├── VSCODE_REMOTE_SETUP.md       # Development setup
├── MEMORY_BANK.md               # THIS FILE - rebuild specification
└── SESSION_STATE.md             # Living document (read every session)
```

---

## 🔎 Codebase Indexing & Vector Search (Semantic Memory)

The project ships a **self-hosted semantic search** system so agents can recall
any code/doc on demand instead of loading the whole repo into context. It is the
third pillar of the memory system (prose memory = MEMORY_BANK + SESSION_STATE;
generated recall = this index).

**Location**: `tools/codebase_index/` + `./cbindex` wrapper at repo root.

**Stack (best-available, self-hostable, offline-first)**:
- **ChromaDB** — embedded persistent vector DB (no server process).
- **sentence-transformers `all-MiniLM-L6-v2`** — local CPU embeddings, no API
  key, works air-gapped once cached (384-dim, cosine).
- **OpenAI `text-embedding-3-small`** — optional higher-quality backend.
- **MCP server** (`mcp_server.py`) — exposes `search_codebase`, `index_stats`,
  `rebuild_index` to MCP-native clients (Claude Desktop, Cursor, Continue).

**Commands**:
```bash
./cbindex setup                       # one-time: venv + deps
./cbindex build                       # incremental build/refresh
./cbindex build --full                # rebuild from scratch
./cbindex search "question" --json    # semantic search (agent mode)
./cbindex search "q" --language tsx   # filter by language
./cbindex stats                       # index status
./cbindex mcp                         # start MCP server (stdio)
```

**Anti-rotten-memory design**: a SHA-256 manifest (`manifest.json`) tracks every
file; `build` re-embeds only changed files and purges vectors for deleted ones,
so the index never drifts from the code. The vector store (`.codebase_index/`)
and tool venv are **git-ignored and regenerated** — never commit embeddings.

**Rule**: after editing code, run `./cbindex build` so future searches are fresh.
Full usage in `tools/codebase_index/README.md`; session provisioning in
`AGENT_ONBOARDING.md`.

---

## 🧠 Agent Operating Instructions

### On Session Start:

1. **Read these files IN ORDER**:
   - `AGENT_ONBOARDING.md` (how to provision context + tools this session)
   - `SESSION_STATE.md` (current state, recent changes, blockers)
   - `MEMORY_BANK.md` (this file - full context)
   - Then use `./cbindex search "..."` to pull relevant source on demand

2. **Verify git status**: `cd /home/ubuntu/vf_cmdb && git status`

3. **Check for uncommitted changes** (user may have edited in UI)

4. **Review last 3 commits**: `git log --oneline -3`

### For Code Changes:

1. **Understand the full stack** - changes often span backend + frontend + docs
2. **Follow established patterns** - don't introduce new paradigms
3. **Update documentation** - README, QUICK_START, PROJECT_CONTEXT, SESSION_STATE
4. **Test thoroughly** - syntax validation, runtime testing where possible
5. **Commit atomically** - one logical change per commit with conventional message
6. **Update SESSION_STATE.md** - reflect current state and next steps

### For New Features:

1. **Check if infrastructure exists** - e.g., custom_fields JSONB, registry pattern
2. **Follow the entity addition pattern**:
   - Model → Registry → Migration → Seed → Frontend page
3. **Consider audit requirements** - should changes be logged?
4. **Think multi-site** - even though only "Home" exists now

### For Debugging:

1. **Check both backend and frontend** - errors often cross boundaries
2. **Use browser console** - React Query devtools show API calls
3. **Check PostgreSQL logs** - constraint violations, type errors
4. **Verify foreign key relationships** - common source of errors
5. **Test with curl/httpie** - isolate frontend vs backend issues

### Memory Preservation:

- **Never lose user decisions** - update MEMORY_BANK.md if preferences change
- **Document architectural changes** - update both MEMORY_BANK and SESSION_STATE
- **Track unresolved issues** - SESSION_STATE.md "Known Issues" section
- **Preserve data model rationale** - why choices were made matters

---

## 🔍 Quick Reference: Common Tasks

### Add New Entity Type

```bash
# 1. Define model in backend/app/models.py
# 2. Register in backend/app/registry.py
# 3. Create migration
cd backend && alembic revision -m "add entity_name table"
# Edit migration file
alembic upgrade head

# 4. Add seed data in backend/app/seed.py
# 5. Create frontend page in frontend/src/pages/EntityName.tsx
# 6. Add route in frontend/src/App.tsx
# 7. Add nav link in frontend/src/components/Layout.tsx
# 8. Commit with conventional message
git add -A
git commit -m "feat: add entity_name management"
```

### Add Custom Field to Entity

```typescript
// Frontend only - uses existing custom_fields JSONB column
// User adds via ColumnManager UI
// No migration needed if custom_fields column already exists
```

### Update Naming Convention

```bash
# Edit backend/app/seed.py (lookup tables)
# OR: Update via frontend Naming page UI (runtime changes)
# Naming engine automatically picks up changes
```

### Deploy to Production

```bash
# On Proxmox VM (Ubuntu 22.04+)
sudo apt install podman
git clone https://github.com/jallamasc/vf-cmdb.git
cd vf-cmdb
cp .env.example .env
# Edit .env with production values
./deploy-podman.sh quadlet
# Services start automatically via systemd
```

---

## 📚 External Documentation References

**FastAPI**: https://fastapi.tiangolo.com/  
**SQLAlchemy 2.0**: https://docs.sqlalchemy.org/en/20/  
**Alembic**: https://alembic.sqlalchemy.org/  
**React**: https://react.dev/  
**TanStack Query**: https://tanstack.com/query/latest  
**AG Grid**: https://www.ag-grid.com/react-data-grid/  
**Podman**: https://docs.podman.io/  
**Quadlet**: https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html  

---

## ✅ Validation Checklist (Before Claiming Complete)

- [ ] Backend starts without errors (`podman logs vf-cmdb-backend`)
- [ ] Frontend builds successfully (`cd frontend && npm run build`)
- [ ] Database migrations apply cleanly (`alembic upgrade head`)
- [ ] All API endpoints return 200/201 (test with curl)
- [ ] Frontend loads and renders data
- [ ] CRUD operations work (create, read, update, delete)
- [ ] Foreign key dropdowns populate correctly
- [ ] Naming engine generates correct names
- [ ] IPAM utilization calculates accurately
- [ ] Ansible inventory endpoint returns valid JSON
- [ ] Changelog records changes
- [ ] Documentation reflects all changes
- [ ] Git status clean (all changes committed)
- [ ] SESSION_STATE.md updated with current state

---

**This document is the authoritative source of truth for rebuilding the Virtualfactor IT CMDB. When in doubt, refer to this specification. When user decisions override documented patterns, update this file immediately to prevent memory rot.**
