# Virtualfactor IT CMDB - Session State
## Living Document - Read on Every Interaction

**Last Updated**: 2026-09-04 (Current session)  
**Project Phase**: Development — Fully Tested, Ready for Proxmox Deployment  
**Status**: ✅ Phase 2 complete + Full QA test run + 3 bugs fixed (commit `46b3164`)

---

## 🆕 FEAT-7 (2026-09-04): Device Detail Dashboard

New route **`/devices/:type/:id`** (`physical_servers`, `virtual_machines`,
`workstations`, `network_devices`) rendered by
`frontend/src/pages/DeviceDashboard.tsx`. The primary name column of all four
device listing grids is now a link into it.

**Tabs** — Overview · Interfaces · IP Assignments · VMs & Containers (hosts
only) · Cables · Changelog · Ansible Facts. The tab strip is built from the
`relations` array returned by the backend, so a device only ever sees tabs that
can apply to it, and the active tab lives in `?tab=` so it can be bookmarked.

**Overview** is a *form*, not a grid: `lib/deviceSchema.ts` maps every column of
each of the four models into labelled sections (Identity, Placement,
Classification, …) and `components/DeviceOverviewForm.tsx` edits them inline,
one field per PATCH, through the normal CRUD route so naming and audit logging
stay untouched. Generated names sit in a dark hero block at the top and the
site → datacenter → room → rack → U position is in the page header.

**Backend** — `backend/app/devices.py` (device-type resolver + relation loaders)
and two endpoints in `routers/special.py`:
- `GET /api/v1/devices/{type}/{id}` → record, display name, position/site
  context, the tab list and the API resource behind each tab
- `GET /api/v1/devices/{type}/{id}/related/{relation}` → rows filtered by
  device, plus `owned` / `fk_field` so the UI knows whether add + delete are
  legal on that tab

Both accept either the underscored route key or the existing kebab-case API
slug. Reads are the only new server code — every write still goes through the
generic CRUD routes.

**Things worth remembering**
- `Cable` and `ChangeLog` models already exist, so those two tabs are real
  grids, not placeholders.
- **No device table has a `tia606b_name` column** (only `sites` does), so the
  Overview hero explains where TIA-606-B labels live instead of showing an
  empty field.
- `device_interfaces.network_device_id` is NOT NULL, so only network devices
  *own* ports. On servers/VMs/workstations the Interfaces tab shows the reverse
  `connected_device_type` / `connected_device_id` match and is read-only.
- The polymorphic discriminators (`assigned_to_type`, `port_a_type`,
  `port_b_type`, `connected_device_type`) currently hold no data, so IP
  Assignments / Cables read empty until records are created. Adding a row from
  a tab pre-fills the discriminator correctly (verified round-trip).
- There is no raw Ansible facts blob column — the Facts tab shows the existing
  `POST /api/v1/devices/{slug}/{id}/facts` contract and the current values of
  the fact-backed columns.

**Verified**: `tsc -b` clean · `vite build` clean · backend endpoints curl-tested
against live PostgreSQL (both slug spellings, 404 paths, every relation) · all
seven tabs opened in the browser · IP-assignment add + delete round-trip.

---

## 🆕 Phase 2 QA Session (2026-09-04): Full-Stack Testing + Bug Fixes

### Test Environment (SuperComputer VM)
- PostgreSQL 16 running on port 5432 (DB: `cmdb`, user: `cmdb`)
- Backend: uvicorn on port 8000 (`--reload`)
- Frontend: built dist served by nginx on port 3000 (SPA + API proxy)
- Public URL tested: `https://33e3a5dc9.na113.preview.abacusai.app`

### QA Results Summary: 7 PASS / 1 PARTIAL / 1 FAIL → **All Fixed**
| Test Case | Result |
|-----------|--------|
| TC-01 Dashboard & App Load | ✅ PASS |
| TC-02 Sites, Hierarchy, SVG Rack View | ✅ PASS |
| TC-03 Network Devices & Naming | ✅ PASS |
| TC-04 Racks, Servers, Compute Pages | ✅ PASS |
| TC-05 IPAM Core (VLANs, Subnets, Utilization) | ✅ PASS |
| TC-06 IPAM Reservation CRUD & Next-IP | ⚠️ PARTIAL → **Fixed (BUG-01)** |
| TC-07 API Guard Rails (VLAN/CIDR/IP dup guards) | ✅ PASS |
| TC-08 Reference Data & `/meta/entities` | ❌ FAIL → **Fixed (BUG-02)** |
| TC-09 Navigation Resilience (21 SPA routes) | ✅ PASS |

### Bugs Found & Fixed (commit `46b3164`)
- **BUG-01** (Medium, Frontend): Reservation form pre-filled hardcoded `192.168.1.254` — fixed to call `/api/v1/ipam/subnets/{id}/next-reserved` dynamically
- **BUG-02** (Medium, Backend): `/api/v1/meta/entities` shadowed by catch-all `/{resource}/{item_id}` route → 422 — fixed by reordering router registration in `main.py`
- **BUG-03** (Low, Seed): Changelog showed `simple_name: "Korriban → None"` spurious entry — fixed in `seed.py`, stale DB row purged

### Validated API Endpoints (all ✅)
- `GET /api/v1/sites` → 2 sites (Korriban + test artifact)
- `GET /api/v1/vlans` → 43 VLANs
- `GET /api/v1/subnets-ipv4` → 46 subnets
- `GET /api/v1/ipam/subnets/3/next-ip` → `10.100.107.2`
- `GET /api/v1/ipam/subnets/3/next-reserved` → `10.100.107.253`
- `GET /api/v1/ipam/subnets/3/utilization` → 254 total / 3 used / 1.2%
- `GET /api/v1/meta/entities` → 3 entity types (was 422, now ✅)
- `GET /api/v1/ansible/inventory` → 12 groups ✅
- VLAN dup 409 ✅ | CIDR overlap 409 ✅ | IP dup 409 ✅ | out-of-range 422 ✅

### Current HEAD
`46b3164` — `fix: BUG-01 IPAM form IP prefill, BUG-02 meta/entities route shadowing, BUG-03 seed changelog artifact`

---

## 🆕 Phase 2 (2026-09-03): Rack View SVG upgrade + IPAM by Site

Branch `feature/phase-2-rack-ipam`. Full detail in `docs/PHASE_2_COMPLETION.md`.

**Stream A — Rack View SVG**
- New `frontend/src/components/RackDiagramSVG.tsx` — scalable SVG elevation
  (U-numbered from bottom, rails, device rects scaled by units×19px, type
  colours via shared `TYPE_HEX`, empty slots grey).
- `frontend/src/pages/RackView.tsx` rewritten — cascading Site→Datacenter→
  Floor→Rack filter, responsive multi-rack grid, type legend.

**Stream B — IPAM by Site + reserved pool**
- Migration `0004_ipam_by_site.py` (guarded/idempotent): `vlans.site_id` NOT
  NULL + composite `UNIQUE(site_id, vlan_id)` (kept global `UNIQUE(vlan_id)`);
  `site_id`/`reserved_count`/`reservation_anchor` on both subnet tables;
  `label`/`is_locked` on `subnet_role_assignments`; backfills.
- `models.py` updated to match.
- `crud.py`: 409 duplicate global VLAN (Q1); 409 overlapping/duplicate CIDR
  (Q2); auto-create locked `Gateway` reservation on subnet create (Q6). Wired
  into create/update.
- `special.py`: GET/POST/DELETE `/ipam/subnets/{id}/reservations` (family-aware,
  ceiling-enforced, locked-protected) + `next-reserved` (anchor + gap-aware);
  `utilization` reports reserved counts + anchor.
- `seed.py`: VLANs/subnets attached to Home site; reserved pool + locked
  gateway seeded.
- `frontend/src/pages/IPAM.tsx` (route `/ipam`, nav "IPAM by Site"): site
  selector, Segments tab (IPv4 primary + collapsible IPv6) with per-segment
  reservation manager + "Suggest next", VLANs tab with quick-add. `api.ts`
  extended with reservation helpers.

**Validated**: `npm run build` zero TS errors; `from app.main import app` OK
(all IPAM routes register); seed syntax OK. Live DB apply not run here (no
local Postgres; INET/CIDR types are Postgres-specific).

---
## (Prior session snapshot below)

---

## 📌 Current State Snapshot

### Repository Status
- **Location**: `/home/ubuntu/vf_cmdb/`
- **Remote**: `https://github.com/jallamasc/vf-cmdb`
- **Branch**: `master`
- **Last Push**: 2026-09-03 (commit `36c7f5f`)
- **Local HEAD**: `36c7f5f` - docs: add memory preservation system
- **Uncommitted Changes**: None (git clean)

### Deployment Status
- **Current Environment**: Development VM (Abacus AI Agent computer)
- **Target Environment**: Proxmox Ubuntu VM (to be created by user)
- **Deployment Method**: Podman + Quadlet (systemd)
- **Services Running Locally**: ❌ Not started (awaiting deployment)

### Quick Stats
- **Total Database Tables**: 38 (17 lookups, 1 reference, 20 entities)
- **Lines of Code (Python)**: ~2,500
- **Lines of Code (TypeScript/React)**: ~3,800
- **Docker → Podman Migration**: ✅ Complete (commit 212988c)
- **Data Seeded**: ✅ All 6 Excel files imported with corrections

---

## 🆕 This Session (2026-09-03/04): Codebase Indexing & WLAN Addressing

### Codebase Indexing & Vector Search

Added the **third pillar** of the memory system — a self-hosted semantic search
over the codebase — so agents recall code on demand and never rely on stale
context.

**What was built** (`tools/codebase_index/` + `./cbindex` wrapper):
- `indexer.py` — CLI: `build` (incremental), `build --full`, `search`, `stats`,
  `backends`. ChromaDB vector store + local `all-MiniLM-L6-v2` embeddings
  (offline, no API key); optional OpenAI backend.
- `mcp_server.py` — MCP server exposing `search_codebase`, `index_stats`,
  `rebuild_index` to MCP-native clients (works with mcp v1 `FastMCP` and v2
  `MCPServer`).
- `requirements.txt`, `README.md`, root `cbindex` wrapper (`setup/build/search/
  stats/backends/mcp`).
- `AGENT_ONBOARDING.md` — **the new "read me first" file** with bootstrap
  commands + a paste-ready bootstrap prompt for provisioning a fresh session.
- `.gitignore` updated: `.codebase_index/` (vector store) and tool `.venv/` are
  generated/ignored — never commit embeddings.

**Validated** (in the dev environment):
- Index built: 122 files → 421 chunks in ~15s.
- Semantic search returns correct files/line-ranges (naming engine, next-free-IP,
  quadlet units, changelog logic) with relevance scores.
- Incremental build verified: adding a file re-embeds only it; deleting purges
  its chunks (anti-rotten-memory guarantee holds).
- MCP tool functions verified against the same index.

**Note**: The vector store must be **rebuilt per machine** (`./cbindex build`) —
it is intentionally not committed. On the air-gapped Proxmox VM, cache the
embedding model during setup while internet is available.

### ✅ WLAN Addressing Decision (RESOLVED)

**User Decision** (2026-09-04): Start WLAN ranges at **192.168.100.0/24** and continue sequentially.

**Implementation**:
- WLAN / 1: `192.168.100.0/24`, expansion to `192.168.103.254` (4 × /24)
- WLAN / 2: `192.168.104.0/24`, expansion to `192.168.107.254` (4 × /24)
- WLAN / 3: `192.168.108.0/24`, expansion to `192.168.111.254` (4 × /24)
- WLAN / Reserved: `192.168.112.0/24`, expansion to `192.168.115.254` (4 × /24)

**Files Updated**:
- `backend/app/seed_subnets.json` — all WLAN IPv4 subnets and role assignments updated

**Old (INVALID) ranges** (replaced):
- ~~192.168.40-43~~ → 192.168.100-103
- ~~192.168.44-47~~ → 192.168.104-107
- ~~192.168.48-51~~ → 192.168.108-111
- ~~192.168.52-55~~ → 192.168.112-115

**Status**: ✅ Complete. Ready for fresh database seeding or migration.

---

## 🔄 Recent Changes (Last 3 Commits)

### Commit `212988c` - 2026-09-03
**Message**: `refactor: migrate container stack from Docker to Podman`

**Major Changes**:
- Renamed `Dockerfile` → `Containerfile` (backend & frontend)
- Replaced `docker-compose.yml` → `podman-compose.yml`
- Added 7 Quadlet systemd units in `deploy/quadlet/`
- Created `deploy-podman.sh` helper script
- Updated all documentation (README, QUICK_START, VSCODE_REMOTE_SETUP, PROJECT_CONTEXT)
- SELinux `:Z` volume flags for rootless compatibility
- Network alias `backend` for nginx proxy resolution

**Reason**: User requirement for Podman over Docker

### Commit `718430b` - 2026-09-02
**Message**: `docs: add comprehensive project context document for AI conversation continuity`

**Added**: `PROJECT_CONTEXT.md` (600+ lines)
- Complete architecture documentation
- Data model specifications
- API endpoint reference
- Frontend component hierarchy
- Deployment workflows

### Commit `2275915` - 2026-09-02
**Message**: `docs: add comprehensive quick start guide`

**Added**: `QUICK_START.md`
- Step-by-step deployment instructions
- Environment configuration guide
- Troubleshooting section

---

## ⚠️ Active Issues & Blockers

### 🔴 Phase 3 Bugs (Must Fix Before Deploying)

| ID | Severity | Component | Description |
|----|----------|-----------|-------------|
| BUG-A | Medium | Frontend/Backend | VLANs page add-row errors — `Vlan.site_id NOT NULL` but no site_id FK column in Vlans EntityGrid |
| BUG-B | Medium | Frontend | IPAM shows no subnets — filter by site_id excludes NULL-site subnets; may default to wrong site (test artifact id=2) |
| BUG-C | High | Frontend/Backend | "Add row" errors on most views — many models have NOT NULL FK fields not exposed as editable columns in the grid |
| BUG-D | Low | Frontend | IPAM subnet columns incomplete — missing `range_from`, `range_to`, `expansion_ceiling`, `reserved_count`, `reservation_anchor` |

**Full details and fixes**: `docs/PHASE_3_PLAN.md` → Bug section (BUG-A through BUG-D)

### 🟡 Phase 3 Features (User-Requested after QA)
Full detail in `docs/PHASE_3_PLAN.md`. Summary:
- **Sites**: Auto-conform simple_name from hierarchy; separate regions from buildings/floors; themed fun names (Star Wars etc.); VF Short Name is too short
- **Sites**: Add Colombian + international regions (seed change)  
- **All grids**: No cell content truncation; dropdown arrows on FK/select cells; name fields in all listings
- **Physical Hierarchy**: Real-time name preview while creating; datacenter = airport code of city
- **Rack View**: Dual-face (front + back); Visio Café stencils; port-to-port cable connections with labeled from/to
- **Device Dashboard**: Click device name → comprehensive tabbed detail page (specs, interfaces, IPs, VMs, cables, changelog, Ansible facts)

---

## 🎯 Immediate Next Steps

### For Agent (START of next session — do this first):
1. Read `docs/PHASE_3_PLAN.md` — full bug list and Phase 3 feature specs
2. Fix BUG-C first (most impactful): audit all models for NOT NULL FKs without grid columns
3. Fix BUG-A (VLANs EntityGrid missing site_id column)
4. Fix BUG-B (IPAM site filter excludes NULL-site subnets; also delete test site id=2)
5. Fix BUG-D (subnet columns incomplete)
6. Then proceed with Sprint 3A UX improvements (per `docs/PHASE_3_PLAN.md`)

### For User:
1. ⏳ **PENDING**: Proxmox VM deployment (after Phase 3 bugs fixed)
2. ✅ **DONE**: QA testing session completed
3. ✅ **DONE**: Phase 3 requirements documented

---

## 📊 Entity Status Overview

### Physical Infrastructure
- ✅ Sites (1 site: "Home")
- ✅ Site Addresses (NEW - separated from sites)
- ✅ Racks (seeded from Excel)
- ✅ Rack Units (device mounting)
- ✅ Power Devices (UPS, PDU)
- ✅ Patch Panels

### Compute Layer
- ✅ Physical Servers (seeded from VF_Prod.xlsx)
- ✅ Virtual Machines (seeded from VF_VMs.xlsx)
- ✅ Containers/Apps
- ✅ Workstations (seeded from VF_WorkStations.xlsx)

### Network Layer
- ✅ Network Devices (seeded from VF_Ntwk.xlsx)
- ✅ Device Interfaces (port configs)
- ✅ VLANs (with zone classification)
- ✅ Cables

### IPAM
- ✅ Subnets IPv4 (WLAN ranges corrected to 192.168.100-115.x)
- ✅ Subnets IPv6
- ✅ IP Assignments

### Auditing & Integration
- ✅ Changelog (automatic via SQLAlchemy events)
- ✅ Ansible Dynamic Inventory (tested, working)

---

## 🔧 Technical Debt & Future Enhancements

### Technical Debt (None Critical)
- None identified currently

### Future Enhancements (User may request)
1. **Bitwarden CLI Integration**: Auto-fetch credentials using `bw` CLI
2. **Multi-site Expansion**: Add more sites beyond "Home"
3. **Custom Reports**: PDF/Excel export of inventory
4. **REST API Authentication**: JWT tokens, API keys
5. **Role-Based Access Control**: Read-only vs. admin users
6. **Network Topology Diagram**: Visual map of connections
7. **Alert System**: Email/Slack notifications for changes
8. **Backup Automation**: Scheduled database backups
9. **Import/Export**: Bulk CSV/Excel import/export

---

## 🧪 Testing Status

### Manual Testing ✅
- Backend API endpoints (CRUD operations)
- Frontend rendering and navigation
- Foreign key relationships
- Naming convention engine
- IPAM utilization calculations
- Ansible inventory endpoint
- Changelog tracking

### Automated Testing ❌
- Unit tests: Not implemented
- Integration tests: Not implemented
- E2E tests: Not implemented

**Note**: User preference has been manual testing to date.

---

## 🗂️ Files Modified This Session

### Session: 2026-09-03 (Current)

**Files Read**:
- `/home/ubuntu/vf_cmdb/` (full project review)
- System-generated file summaries (latest codebase state)

**Files Created**:
- `/home/ubuntu/vf_cmdb/MEMORY_BANK.md` (this session)
- `/home/ubuntu/vf_cmdb/SESSION_STATE.md` (this file)

**Files Modified**:
- None yet (git push only)

**Git Operations**:
- ✅ Configured git remote with authentication
- ✅ Pushed all 5 commits to `https://github.com/jallamasc/vf-cmdb`
- ✅ Cleaned authentication token from remote URL
- ✅ Repository now public and accessible

---

## 💬 Recent User Communications

### User Question (2026-09-03):
> "For network distribution is it ok to use on wireless networks 192.169.0.X/24 or should I use something different that comes after 192.168.12.XX/24 (the last LAN segment)"

**Agent Response Summary**:
- Confirmed 192.169.0.0/24 is INVALID (public IP space, not RFC 1918)
- Explained valid private ranges (10.x, 172.16-31.x, 192.168.x)
- Recommended options:
  - 192.168.13.0/24 (next sequential)
  - 192.168.20.0/24 (reserved for wireless)
  - User choice

**Status**: ✅ RESOLVED

### User Decision (2026-09-04):
> "We will start WLAN ranges on 192.168.100.X/24 and continue from there"

**Implementation**: Applied to `backend/app/seed_subnets.json` (4 WLAN subnets: 100-103, 104-107, 108-111, 112-115)

### User Request (Previous):
> "Please proceed to push the repo"

**Status**: ✅ Complete - all 5 commits pushed to GitHub

---

## 🔐 Environment Variables Checklist

### Critical Settings (in `.env` file)
- ✅ `POSTGRES_PASSWORD` - ⚠️ User must change from default
- ✅ `PGADMIN_DEFAULT_EMAIL` - User email for pgAdmin
- ✅ `PGADMIN_DEFAULT_PASSWORD` - ⚠️ User must set
- ✅ `CORS_ORIGINS` - Set to `*` for dev, specific URL for prod
- ✅ Port mappings (FRONTEND_PORT, BACKEND_PORT, DB_PORT, PGADMIN_PORT)

### Optional Settings
- `CMDB_API_URL` - For Ansible inventory (defaults to localhost:8000)
- `CMDB_TIMEOUT` - API timeout in seconds (default: 10)

---

## 📈 Progress Tracking

### Phase 1: Requirements & Design ✅
- [x] Analyze Excel files
- [x] Define data model
- [x] Choose technology stack
- [x] Design API structure

### Phase 2: Backend Development ✅
- [x] FastAPI setup
- [x] SQLAlchemy models (38 tables)
- [x] Alembic migrations
- [x] Seed data from Excel
- [x] Naming convention engine
- [x] Audit changelog
- [x] IPAM endpoints
- [x] Ansible integration

### Phase 3: Frontend Development ✅
- [x] React + TypeScript + Vite setup
- [x] Layout and navigation
- [x] EntityGrid component
- [x] All entity management pages (15+)
- [x] Custom column system (ColumnManager)
- [x] Reference data management
- [x] IPAM visualization
- [x] Rack view diagrams
- [x] Changelog viewer
- [x] Ansible inventory viewer

### Phase 4: Containerization ✅
- [x] ~~Docker setup~~ (replaced)
- [x] Podman migration
- [x] podman-compose.yml
- [x] Quadlet systemd units
- [x] Helper scripts

### Phase 5: Documentation ✅
- [x] README.md
- [x] QUICK_START.md
- [x] PROJECT_CONTEXT.md
- [x] VSCODE_REMOTE_SETUP.md
- [x] GITHUB_SETUP.md
- [x] MEMORY_BANK.md
- [x] SESSION_STATE.md (this file)
- [x] Ansible integration docs
- [x] Deployment manuals
- [x] Operations guides

### Phase 6: Deployment 🔄
- [ ] Create Proxmox VM
- [ ] Install Podman
- [ ] Clone repository
- [ ] Configure .env
- [ ] Start services
- [ ] Verify functionality
- [ ] Setup backups
- [ ] Configure monitoring

### Phase 7: Production Hardening ⏳
- [ ] Change default passwords
- [ ] Configure firewall rules
- [ ] Setup SSL/TLS (reverse proxy)
- [ ] Implement authentication
- [ ] Schedule automated backups
- [ ] Configure log rotation
- [ ] Performance tuning

---

## 🎓 Learning & Evolution Notes

### Design Patterns Established
1. **Generic CRUD via Registry**: All entities follow same API pattern
2. **Custom Fields JSONB**: Flexible schema without migrations
3. **Event-Driven Audit**: SQLAlchemy listeners capture all changes
4. **Foreign Key Display**: "Full Name - abbreviation" format
5. **Podman-First**: Rootless, daemonless, systemd-native

### Architectural Decisions Log

**2026-09-03**: Migrated Docker → Podman
- **Reason**: User preference, better security (rootless), systemd integration
- **Impact**: All container files renamed, new Quadlet units, docs updated
- **Trade-off**: Slightly less community documentation than Docker

**2026-09-02**: Separated Site Addresses into Reference Table
- **Reason**: Normalize data, enable address reuse, support custom dropdowns
- **Impact**: New `site_addresses` table, `sites.site_address_id` FK, migration 0002
- **Trade-off**: Additional join for address data

**2026-08-30** (estimated): Chose FastAPI over Flask/Django
- **Reason**: Async support, auto-docs, type hints, modern
- **Impact**: Better performance for IPAM calculations, cleaner code

**2026-08-30** (estimated): Chose AG Grid over Tanstack Table
- **Reason**: Excel-like editing UX requirement, built-in cell editors
- **Impact**: Richer UX, larger bundle size (acceptable trade-off)

### User Feedback Integration
- User prefers comprehensive documentation (always update)
- User wants Podman over Docker (migrated)
- User wants no credentials in database (Bitwarden refs only)
- User expects multi-site support (built in, even with only one site now)

---

## 🔮 Anticipated Questions / Scenarios

### "How do I add a new device type?"
→ See MEMORY_BANK.md section "Add New Entity Type"
→ Follow: Model → Registry → Migration → Seed → Frontend page

### "How do I backup the database?"
→ Use provided script: `/home/ubuntu/vf_cmdb/deploy/scripts/vf-cmdb-backup.sh`
→ Or manual: `podman exec vf-cmdb-db pg_dump -U cmdb cmdb > backup.sql`

### "Can I add custom fields without changing code?"
→ Yes! Use ColumnManager UI (⚙ Columns button) on any entity page
→ Stored in JSONB `custom_fields` column, persisted to localStorage

### "How do I integrate with Ansible Tower/AWX?"
→ Point inventory source to: `http://{cmdb-host}:8000/api/v1/ansible/inventory`
→ Or use `cmdb_inventory.py` script as custom inventory

### "Can I import more devices from Excel?"
→ Not directly via UI yet (future enhancement)
→ Currently: Edit `backend/app/seed.py` and run migrations, or use API

### "How do I change the naming convention?"
→ Edit via frontend: Naming page (collapsible categories)
→ Or edit `backend/app/seed.py` lookup tables
→ Naming engine auto-applies changes on next device create/update

---

## 🛠️ Quick Command Reference

### Git Operations
```bash
cd /home/ubuntu/vf_cmdb
git status                          # Check for changes
git diff                            # See what changed
git log --oneline -5                # Last 5 commits
git add -A                          # Stage all changes
git commit -m "type: description"   # Commit with conventional message
git push                            # Push to GitHub
```

### Podman Operations (via helper script)
```bash
./deploy-podman.sh up               # Start all services
./deploy-podman.sh down             # Stop all services
./deploy-podman.sh restart          # Restart all services
./deploy-podman.sh build            # Rebuild containers
./deploy-podman.sh logs backend     # View backend logs
./deploy-podman.sh ps               # List running containers
./deploy-podman.sh quadlet          # Install systemd units
```

### Database Operations
```bash
# Access PostgreSQL
podman exec -it vf-cmdb-db psql -U cmdb cmdb

# Backup
podman exec vf-cmdb-db pg_dump -U cmdb cmdb > backup_$(date +%F).sql

# Restore
podman exec -i vf-cmdb-db psql -U cmdb cmdb < backup.sql

# Run migrations
cd backend && alembic upgrade head
```

### Frontend Development
```bash
cd frontend
npm run dev                         # Vite dev server (hot reload)
npm run build                       # Production build
npm run preview                     # Preview production build
```

### Backend Development
```bash
cd backend
source .venv/bin/activate           # Activate virtual environment
uvicorn app.main:app --reload       # Run with hot reload
alembic revision -m "description"   # Create migration
alembic upgrade head                # Apply migrations
```

---

## 📝 Update Protocol for This File

**When to Update SESSION_STATE.md**:
- ✅ After every git commit
- ✅ When user makes decisions (update Active Issues)
- ✅ When deployment status changes
- ✅ When new blockers emerge
- ✅ After completing major tasks (update Progress Tracking)
- ✅ When user asks questions (log in Recent User Communications)

**What to Update**:
- "Last Updated" timestamp
- "Recent Changes" section (keep last 3-5 commits)
- "Active Issues & Blockers" (add/remove/resolve)
- "Immediate Next Steps" (current priorities)
- "Files Modified This Session" (track changes)
- "Recent User Communications" (conversation log)
- "Progress Tracking" (check off completed tasks)

**Keep Concise**: This is a living, high-churn document. Archive old info to MEMORY_BANK.md if it becomes foundational context.

---

**✨ This document represents the CURRENT STATE of the project. Read this FIRST on every new session to understand where we are, what's changed, and what needs attention next.**
