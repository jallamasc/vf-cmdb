# Phase 1 Preparation Document
**Project:** Virtualfactor IT CMDB  
**Repository:** https://github.com/jallamasc/vf-cmdb  
**Date:** 2026-07-22  
**User:** Alejandro (jallamasc), Virtualfactor, Bogotá, Colombia

---

## Current Project State (Pre-Phase 1)

### Git Status
- **Branch:** `master`
- **Latest commit:** `54c3cc2` - Dynamic columns, reference data separation, improved naming UI
- **Repository:** Clean, all changes committed and pushed to GitHub
- **Deployment:** User successfully deployed locally with Podman (some minor adjustments made by user)

### Current Architecture
- **Backend:** FastAPI + SQLAlchemy (async) + Alembic migrations + PostgreSQL 16
- **Frontend:** React 18 + TypeScript + Vite + AG Grid Enterprise + Tailwind CSS
- **Deployment:** Podman Compose (dev) + Quadlet systemd units (production)
- **Database:** 38 tables including naming conventions, reference data, physical/virtual infrastructure

### Recent Major Changes (Already Implemented)
1. **Data Architecture Reorganization:**
   - Separated `site_addresses` from `naming_conventions`
   - Added `REFERENCE_SLUGS` list distinct from `LOOKUP_SLUGS`
   - Sites now have `site_address_id` FK and `custom_fields` JSONB column

2. **Dynamic Columns (Sites page):**
   - `ColumnManager` component for add/edit/remove columns
   - `useCustomColumns` hook with localStorage persistence
   - Columns can link to reference tables for dropdown population
   - Values stored in `custom_fields` JSONB

3. **Naming Conventions UI Improvement:**
   - Grouped into 6 categories with accordion navigator
   - Search/filter functionality
   - Entry counts per category/lookup

4. **Dropdown Display Format:**
   - `lookupLabel()` function ensures "Full Name - abbreviation" display
   - Applied across all FK columns and dropdowns

---

## Phase 1 Detailed Scope

### Objective
Provide UI/UX for managing the data values within naming conventions and reference tables, making these values immediately reusable across the application.

### User Story
"As a CMDB administrator, I need to easily add/edit/remove types and subtypes in naming conventions (e.g., add a new device type 'Firewall - fw') AND in reference tables (e.g., add a new site address), so that these values immediately appear in dropdowns throughout the app without needing to dig into database tables."

### What Phase 1 Delivers

#### 1. Add Types/Subtypes UI for Naming Conventions (HIGH PRIORITY)
**Goal:** Make it trivial to add new naming convention values (like a new device type, OS family, etc.)

**Requirements:**
- Each naming convention table already has CRUD via `EntityGrid` on the Naming page
- **ISSUE:** Current Naming page shows grouped categories in accordion, but user must drill into specific lookup to add values
- **IMPROVEMENT NEEDED:**
  - Add a prominent "Quick Add" button/form at the top of Naming page
  - Allow user to select category + lookup type from dropdowns
  - Fill in `full_name`, `abbreviation`, `max_length` (optional), `notes` (optional)
  - Submit → immediately adds to the selected lookup table
  - Success toast → value now available in all dropdowns

**Technical Approach:**
- Add `<QuickAddNamingValue />` component above the accordion navigator
- Component uses same API endpoints: `POST /api/v1/{lookup_slug}`
- On success, invalidate React Query cache for that lookup slug
- Form validation: `abbreviation` must be unique per lookup

**Files to Modify:**
- `frontend/src/pages/Naming.tsx` - add QuickAddNamingValue component
- `frontend/src/components/QuickAddNamingValue.tsx` - NEW component

#### 2. Add Types/Subtypes UI for Reference Data (HIGH PRIORITY)
**Goal:** Same quick-add experience for reference tables like site addresses

**Requirements:**
- Reference Data page (`ReferenceData.tsx`) currently only shows `site_addresses`
- **IMPROVEMENT NEEDED:**
  - Add "Quick Add Address" button/form at top
  - Fill in `label`, `street`, `city`, `state_region`, `postal_code`, `country`, `notes`
  - Submit → adds to `site_addresses` table
  - Value immediately available in Sites page Address column dropdown

**Technical Approach:**
- Add `<QuickAddReferenceValue />` component to Reference Data page
- Component uses: `POST /api/v1/site-addresses`
- On success, invalidate React Query cache
- Form validation: `label` is required

**Files to Modify:**
- `frontend/src/pages/ReferenceData.tsx` - add QuickAddReferenceValue component
- `frontend/src/components/QuickAddReferenceValue.tsx` - NEW component (or make one generic component for both)

#### 3. Rack View Upgrade: Hierarchy + Visual Racks (HIGHEST VALUE)

**Current State:**
- `RackView.tsx` shows basic front-elevation diagrams
- Can filter "All racks" or specific rack
- Uses colored boxes for device types
- Lacks hierarchy (no Datacenter/Floor concepts)
- Lacks realistic rack visualization

**Requirements:**

**A. Add Datacenter & Floor Hierarchy:**
- **New DB tables:**
  - `datacenters` table: `id`, `name`, `code` (abbreviation), `description`, `site_id` (FK to sites)
  - `datacenter_floors` table: `id`, `name`, `code`, `floor_number`, `datacenter_id` (FK)
  - Modify `racks` table: add `datacenter_floor_id` (FK, nullable for backward compat)

- **Migration:**
  - Alembic migration to create tables
  - Seed with default: "Home Datacenter" → "Ground Floor" → existing racks assigned there

**B. Hierarchy Filter UI:**
- Three cascading dropdowns at top of Rack View:
  1. **Datacenter** (all datacenters + "All Datacenters")
  2. **Floor** (floors for selected DC + "All Floors")
  3. **Rack** (racks for selected floor + "All Racks")
- Selection updates the view below

**C. Multi-Rack Layout:**
- When "All Racks" or multiple racks in scope:
  - Display side-by-side in a responsive grid (2-3 columns on desktop)
  - Each rack labeled with Datacenter/Floor/Rack name above it
  - Scroll horizontally/vertically as needed

**D. Realistic SVG Rack Diagrams:**
- Replace colored boxes with proper rack elevation diagrams
- **SVG-based visualization** (scalable, clean, Visio-like)
- Show rack as vertical rectangle with:
  - Numbered U positions (1U = ~1.75 inches / 44.45mm standard)
  - Rails on sides
  - Devices as colored rectangles spanning their U height
  - Device labels inside rectangles (truncate if needed)
  - Empty U slots shown as gray/light background
  - Color-code by device type (keep existing `TYPE_COLORS` mapping)

**Visual Design Reference:**
- Look similar to Microsoft Visio rack stencils
- Each U position clearly numbered (1 at bottom, ascending upward)
- Professional, print-quality appearance
- Could use a library like `react-svg-rack` or build custom SVG

**Technical Approach:**

**Backend:**
- New models: `Datacenter`, `DatacenterFloor`
- Update `Rack` model: add `datacenter_floor_id`
- Register in `ENTITY_REGISTRY`
- API endpoints auto-generated for CRUD
- Alembic migration: `0003_datacenter_hierarchy.py`

**Frontend:**
- Update `RackView.tsx`:
  - Add datacenter/floor/rack filter dropdowns
  - Fetch datacenters, floors, racks with hierarchy
  - Display multiple racks side-by-side when applicable
  - Replace `RackDiagram` with `RackDiagramSVG` component

- New component: `RackDiagramSVG.tsx`
  - Props: `rack`, `units`, `height` (16U, 32U, 42U, etc.)
  - Render SVG with proper dimensions
  - Calculate U positions from bottom to top
  - Draw device rectangles with colors and labels
  - Add rack frame/rails
  - Scale based on container width

**Files to Modify:**
- `backend/app/models.py` - add Datacenter, DatacenterFloor models
- `backend/app/registry.py` - register new entities
- `backend/app/seed.py` - seed default datacenter/floor
- `backend/alembic/versions/0003_datacenter_hierarchy.py` - NEW migration
- `frontend/src/pages/RackView.tsx` - hierarchy filters + multi-rack layout + use RackDiagramSVG
- `frontend/src/components/RackDiagramSVG.tsx` - NEW component for realistic SVG racks
- `frontend/src/components/Layout.tsx` - possibly add Datacenters/Floors to nav under Infrastructure

**Rack Standard Heights:**
- Common sizes: 16U, 32U, 42U, 48U
- Store `u_height` in `racks` table (already exists? Check model)

---

## Technical Architecture Decisions for Phase 1

### Database Schema Additions

```sql
-- New tables
CREATE TABLE datacenters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    code VARCHAR(16) NOT NULL,  -- abbreviation for naming
    description TEXT,
    site_id INTEGER REFERENCES sites(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE datacenter_floors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,  -- e.g., "Ground Floor", "1st Floor"
    code VARCHAR(16) NOT NULL,    -- e.g., "GF", "1F"
    floor_number INTEGER,         -- numeric order: 0, 1, 2...
    datacenter_id INTEGER NOT NULL REFERENCES datacenters(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modify existing racks table
ALTER TABLE racks ADD COLUMN datacenter_floor_id INTEGER REFERENCES datacenter_floors(id);
```

### API Endpoints (Auto-generated via Registry)

**New endpoints:**
- `GET/POST /api/v1/datacenters`
- `GET/PUT/DELETE /api/v1/datacenters/{id}`
- `GET/POST /api/v1/datacenter-floors`
- `GET/PUT/DELETE /api/v1/datacenter-floors/{id}`

**Existing endpoints used:**
- `GET /api/v1/racks` - now includes `datacenter_floor_id` in response
- `GET /api/v1/rack-units` - unchanged

### Frontend State Management

**React Query Keys:**
```typescript
["datacenters"]
["datacenter-floors"]
["racks"]  // existing
["rack-units"]  // existing
```

**New Queries:**
```typescript
const { data: datacenters } = useQuery({
  queryKey: ["datacenters"],
  queryFn: () => api.list("datacenters"),
});

const { data: floors } = useQuery({
  queryKey: ["datacenter-floors"],
  queryFn: () => api.list("datacenter-floors"),
  enabled: !!selectedDatacenter,
});
```

**Filter State (RackView):**
```typescript
const [selectedDatacenter, setSelectedDatacenter] = useState<number | "all">("all");
const [selectedFloor, setSelectedFloor] = useState<number | "all">("all");
const [selectedRack, setSelectedRack] = useState<number | "all">("all");
```

### Component Structure

```
RackView.tsx
├── HierarchyFilters (dropdowns for DC/Floor/Rack)
├── RackGrid (responsive grid container)
│   └── RackCard (one per rack, includes DC/Floor/Rack label)
│       └── RackDiagramSVG (the actual SVG visualization)
└── Legend (device type colors)
```

### SVG Rack Diagram Specifications

**SVG Dimensions:**
- Width: 300px (rack front width)
- Height: Dynamic based on U count (42U ≈ 800px, 1U ≈ 19px)
- ViewBox: `0 0 300 {height}`

**Elements:**
- Outer frame: Rectangle stroke
- Rails: Two vertical lines on sides
- U position labels: Text on left side, right-aligned, every 1U
- Device rectangles:
  - X: 50px (after rail)
  - Width: 200px
  - Y: Calculated from bottom up (U position)
  - Height: `device.units * 19px`
  - Fill: Color from TYPE_COLORS
  - Stroke: Darker shade of same color
- Device labels: Text centered in rectangle

**Color Scheme (keep existing):**
```typescript
const TYPE_COLORS: Record<string, string> = {
  networking: "bg-blue-300",
  compute: "bg-green-300",
  storage: "bg-purple-300",
  // ... etc
};
```

Convert to hex for SVG fills.

---

## Files Inventory for Phase 1

### Backend Files to Create/Modify

**NEW:**
- `backend/alembic/versions/0003_datacenter_hierarchy.py`
- `frontend/src/components/QuickAddNamingValue.tsx`
- `frontend/src/components/QuickAddReferenceValue.tsx`
- `frontend/src/components/RackDiagramSVG.tsx`

**MODIFY:**
- `backend/app/models.py` - add Datacenter, DatacenterFloor models, modify Rack
- `backend/app/registry.py` - register new entities
- `backend/app/seed.py` - add default datacenter/floor, link existing racks
- `frontend/src/pages/Naming.tsx` - add QuickAddNamingValue component
- `frontend/src/pages/ReferenceData.tsx` - add QuickAddReferenceValue component
- `frontend/src/pages/RackView.tsx` - complete rewrite with hierarchy + SVG
- `frontend/src/components/Layout.tsx` - add nav items for Datacenters/Floors

### Current File Locations
- Backend: `/home/ubuntu/vf_cmdb/backend/`
- Frontend: `/home/ubuntu/vf_cmdb/frontend/src/`
- Migrations: `/home/ubuntu/vf_cmdb/backend/alembic/versions/`

---

## Dependencies & Prerequisites

### Existing Dependencies (Already Installed)
- **Backend:** FastAPI, SQLAlchemy, Alembic, psycopg2, uvicorn
- **Frontend:** React, TypeScript, Vite, AG Grid Enterprise, TanStack Query, Tailwind CSS

### No New Dependencies Required
- SVG rendering: Native browser support (React JSX)
- Forms: Existing patterns (useState hooks)
- API client: Existing `api.ts` wrapper

---

## Testing Strategy for Phase 1

### Backend Testing
1. Run Alembic migration: `alembic upgrade head`
2. Verify tables created: `\dt` in psql
3. Test seed data: Check for default datacenter/floor
4. API endpoints: `curl` or browser DevTools for GET/POST

### Frontend Testing
1. **Quick Add Forms:**
   - Add new device type in Naming page
   - Check it appears in Network Devices dropdown immediately
   - Add new site address in Reference Data page
   - Check it appears in Sites Address column dropdown

2. **Rack View Hierarchy:**
   - Verify datacenter/floor/rack dropdowns cascade correctly
   - Select "All Racks" → see all racks side-by-side
   - Select specific rack → see only that rack
   - Check labels show DC/Floor/Rack info

3. **SVG Rack Diagrams:**
   - Visual check: U positions numbered correctly (1 at bottom)
   - Devices span correct U heights
   - Colors match device types
   - Labels readable
   - Empty U slots visible
   - Print/export test (SVG should scale cleanly)

### Build Validation
```bash
cd /home/ubuntu/vf_cmdb/frontend
npm run build
# Should complete without errors
```

---

## Known Constraints & Design Decisions

### Drag-and-Drop Deferred to Phase 2
- Phase 1: View-only SVG racks (no interaction beyond filtering)
- Phase 2: Implement drag-and-drop using a library like `react-dnd` or `@dnd-kit/core`

### Cloud Regions/AZs Deferred to Phase 3+
- Phase 1: Focus on physical datacenter hierarchy
- Later: Add cloud provider region/AZ tables and sync jobs

### Tag Printing Deferred to Phase 3+
- Phase 1: No tag printing functionality
- Later: Separate module for cable tag generation with templates

### Ansible Write Operations Deferred to Phase 4+
- Current: Read-only dynamic inventory
- Later: Full read-write API access with field-level permissions

---

## Migration Path & Backward Compatibility

### Existing Racks Without Floor Assignment
- Migration will create a default datacenter + floor
- All existing racks will be assigned to this default floor
- `datacenter_floor_id` is nullable for safety, but seed ensures all racks are assigned

### Naming Convention Lookups
- No breaking changes to existing lookup tables
- Quick Add UI is additive (alternative to using EntityGrid directly)

### Custom Columns (Sites)
- Already implemented and working
- Phase 1 only improves the data available in reference table dropdowns

---

## Success Criteria for Phase 1

✅ **Quick Add UI for Naming Conventions:**
- User can add new device type, OS, role, etc. from Naming page without drilling into EntityGrid
- New value immediately appears in all relevant dropdowns app-wide

✅ **Quick Add UI for Reference Data:**
- User can add new site address from Reference Data page
- New address immediately appears in Sites page Address column

✅ **Datacenter/Floor Hierarchy:**
- Database tables created and seeded
- API endpoints working
- Frontend shows cascading filter dropdowns

✅ **Realistic SVG Rack Diagrams:**
- Racks displayed with proper U numbering (1 at bottom)
- Devices shown as colored rectangles with labels
- Multi-rack side-by-side layout works
- Visually similar to professional Visio diagrams
- Scales cleanly (SVG advantages)

✅ **No Regressions:**
- All existing pages still work
- Build succeeds
- Podman deployment works

---

## Git Workflow for Phase 1

1. Start from clean `master` branch (current state)
2. Create feature branch: `git checkout -b feature/phase-1-quick-add-rack-hierarchy`
3. Implement changes incrementally:
   - Commit 1: Backend models + migration for datacenter/floor
   - Commit 2: Frontend QuickAdd components
   - Commit 3: RackView hierarchy filters
   - Commit 4: SVG rack diagram component
4. Test thoroughly
5. Merge to `master` and push to GitHub
6. Tag release: `git tag v0.2.0-phase1` (optional)

---

## Estimated Complexity

**Backend Work:** Medium
- 2 new models (straightforward)
- 1 migration (with seed data)
- Registry updates (trivial)

**Frontend Work:** High
- 2-3 new components (forms + SVG rack)
- RackView rewrite (complex filtering + layout)
- SVG rendering logic (moderate complexity)

**Total Estimated Lines of Code:** ~1,500-2,000 lines
- Backend: ~300 lines
- Frontend: ~1,200-1,700 lines

**Estimated Development Time:** 2-3 hours for AI assistant
**Estimated Testing Time:** 30-45 minutes

---

## Open Questions for User (to clarify in Phase 1 conversation)

1. **Rack Hierarchy Naming:**
   - Should we call it "Datacenter" or "Data Center" (two words)?
   - Floor naming convention: "Ground Floor", "1st Floor" or "Floor 0", "Floor 1"?

2. **Default Seeding:**
   - Create "Home Datacenter" → "Ground Floor" and assign all existing racks there?
   - Or prompt user to configure on first use?

3. **Quick Add Forms:**
   - Modal dialog or inline collapsible form?
   - Position at top of page or floating button?

4. **Rack U Height:**
   - Does `racks` table already have `u_height` column? (Need to verify)
   - If not, should we add it in this migration?

5. **SVG Rack Width:**
   - Fixed 300px or make responsive/configurable?
   - Show both front and rear elevations? (Defer to Phase 2?)

---

## Quick Reference: Current DB Schema (Relevant Tables)

### Sites
```sql
id, code, name, site_type, description, 
site_address_id (FK), custom_fields (JSONB)
```

### SiteAddresses (Reference Table)
```sql
id, label, street, city, state_region, postal_code, country, notes
```

### Racks (Current)
```sql
id, site_id, name, location, u_height, notes
```

### RackUnits (Devices in Racks)
```sql
id, rack_id, device_type, device_id, start_unit, units, notes
```

### Naming Convention Tables (Examples)
```sql
net_device_types: id, full_name, abbreviation, max_length, notes
compute_device_types: id, full_name, abbreviation, max_length, notes
os_families: id, full_name, abbreviation, max_length, notes
# ... 17 total naming convention tables
```

---

## Phase 1 Deliverables Summary

At the end of Phase 1 conversation, the following will be delivered:

### Code Artifacts
1. Backend migration + models for datacenter hierarchy
2. Seed data for default datacenter/floor
3. QuickAdd form components (2-3 files)
4. RackDiagramSVG component
5. Updated RackView page with filters + multi-rack layout
6. Updated navigation (if adding DC/Floor pages)

### Documentation Updates
- README.md: Add section on datacenter hierarchy
- OPERATIONS.md or QUICK_START.md: How to add datacenters/floors
- Possibly: PHASE_1_COMPLETION_NOTES.md with testing results

### Testing Evidence
- Screenshots of new UI components
- Build success confirmation
- API endpoint test results

### Git Commits
- 3-5 focused commits with clear messages
- Pushed to GitHub
- All files surfaced in code editor

---

## Communication Protocol for Phase 1 Conversation

**Start of Phase 1 Conversation:**
User will say: "Let's proceed with Phase 1" (or similar)

**Assistant should:**
1. Acknowledge and quickly summarize Phase 1 scope
2. Ask the 5 Open Questions listed above (in one message)
3. Wait for user responses or "go ahead with defaults"
4. Start implementation immediately

**During Implementation:**
- No need for play-by-play narration
- Report progress at logical milestones (e.g., "Backend complete, starting frontend")
- Flag any blockers/issues immediately

**End of Phase 1 Conversation:**
- Show code artifact (code editor)
- Verify build success
- Create Phase 2 preparation doc if needed
- Ask user if ready to move to Phase 2 or if adjustments needed

---

## Next Phase Preview

**Phase 2 Scope (for separate conversation):**
- Drag-and-drop rack units (within rack, between racks, between floors/DCs)
- Backend: Update API to handle unit moves
- Frontend: Implement drag-and-drop using `@dnd-kit/core` or similar
- Validation: Check for U position conflicts
- Audit log: Track move history

---

## Repository & Environment Info

- **GitHub URL:** https://github.com/jallamasc/vf-cmdb
- **Local Path:** `/home/ubuntu/vf_cmdb/`
- **Branch:** `master` (main development branch)
- **Deployment:** Podman-based (user has working local deployment)
- **Database:** PostgreSQL 16
- **Python Version:** 3.11+
- **Node Version:** 20+ (with npm)

---

## End of Phase 1 Preparation Document

**Status:** Ready for Phase 1 implementation  
**Next Action:** User creates new conversation and says "Let's proceed with Phase 1"  
**This Document Location:** `/home/ubuntu/vf_cmdb/PHASE_1_PREPARATION.md`

---

**Note to AI Assistant in Next Conversation:**
Read this entire document at the start of Phase 1. It contains all context, decisions, and technical specifications needed. Follow the Communication Protocol section. Be direct and efficient. The user wants results, not narration.
