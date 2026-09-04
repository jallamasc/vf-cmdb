# Virtualfactor IT CMDB — Phase 3 Plan
## Captured from user feedback after Phase 2 QA session (2026-09-04)

---

## 🐛 Bugs (Fix First — Blocking UX)

### BUG-A: VLANs page shows 404 / fails to load
**Root cause (likely)**: The uvicorn `--reload` watcher was restarting the backend mid-session while the coding subtask was editing files. Requests during restart appear as connection errors that the React `api.ts` `handle()` displays as HTTP errors. Additionally, `Vlan.site_id` is `NOT NULL` — when the user tries to **create** a new VLAN from the EntityGrid without a site_id, the backend returns 422, which surfaces as an error in the grid.

**Fix**:
1. Add `fkCol("site_id", "Site", ...)` to the Vlans EntityGrid column set (Vlans.tsx) so site is selectable when creating a VLAN.
2. In production, run uvicorn without `--reload` flag to avoid mid-request restarts.

### BUG-B: IPAM page shows no subnets
**Root cause**: IPAM.tsx filters subnets by `s.site_id === effectiveSite`. Subnets seeded with `site_id = NULL` (before migration 0004) are silently excluded. Additionally, the "effectiveSite" defaults to `sites[0].id` — if the user has a second test site (id=2, empty) from the QA session, it might default to site 2 which has zero subnets.

**Fix**:
1. Change the IPAM filter to also show subnets with `site_id = NULL` (treat null as "all sites") OR ensure all seeded subnets have site_id = 1.
2. Delete the test artifact site (id=2) from the DB.
3. Make the IPAM site dropdown default to the site with the most subnets, not just `sites[0]`.

### BUG-C: "Add row" errors on most views
**Root cause**: The generic EntityGrid `POST /api/v1/{resource}` sends only the fields visible in the grid. Models with `nullable=False` FK fields that are NOT in the grid (e.g., `Vlan.site_id`, `SubnetIpv4.site_id`) cause PostgreSQL NOT NULL constraint errors → 422/500 response surfaced as a JS alert.

**Fix**:
1. Audit every model for `nullable=False` FK fields and ensure they are represented as editable `fkCol` columns in their respective EntityGrid pages.
2. Add a user-friendly error toast in EntityGrid that shows the specific missing field name instead of a raw exception message.
3. Consider making `site_id` on VLANs/Subnets default to the first site on the backend if not provided (as a convenience default).

### BUG-D: IPAM subnet columns incomplete
**Root cause**: The IPAM.tsx page only shows `network_cidr, gateway, vlan_id, utilization, description`. Missing model fields: `range_from, range_to, expansion_ceiling, reserved_count, reservation_anchor`. The Subnets.tsx page similarly shows a limited view without the Excel-imported columns.

**Fix**: Add missing columns to both Subnets.tsx and the IPAM SegmentsTab display. Add `range_from`, `range_to`, `expansion_ceiling`, `reserved_count`, `reservation_anchor` as viewable/editable fields.

---

## 🎨 UX Improvements (Medium Effort)

### UX-1: All cells show full content — no truncation
**Request**: Content should never be stripped. User scrolls right to see the full value.

**Fix**:
- Set `suppressSizeToFit: true` on AG Grid and remove any `maxWidth` / `width` overrides that truncate text.
- Set `wrapText: false` + `autoHeight: false` in defaultColDef (no text wrap, just scroll right).
- Add an "Auto-fit columns" toolbar button (`gridRef.current?.api.autoSizeAllColumns()`) for convenience.

### UX-2: Dropdown arrow indicator on FK / select cells
**Request**: All cells that accept a selection from a list must show a ▼ indicator so users know they're editable dropdowns.

**Fix**:
- Set `cellRendererParams: { suppressMenu: false }` and use a custom `cellRenderer` that appends a `▼` or a small ChevronDown SVG to FK/select cells when the cell is not in edit mode.
- OR use AG Grid's built-in `showDisabledCheckboxes` + custom cell style.
- Cleanest approach: wrap `fkCol` and `selectCol` helpers to always add a `cellRenderer` showing the value + a grey `▼` badge.

### UX-3: Simple Name / Short Name / Long Name on all listing views
**Request**: The auto-generated name fields (`simple_name`, `vf_short_name`, `vf_long_name`) should appear in every entity list, not just on Sites.

**Fix**:
- For entities that have these fields (sites, datacenters, racks, physical servers, network devices, workstations, VMs): add read-only columns `roCol("simple_name", ...)`, `roCol("vf_short_name", ...)`, `roCol("vf_long_name", ...)` to their EntityGrid column definitions.
- Since these are `roCol` (read-only), no backend changes needed.

### UX-4: Physical Hierarchy — real-time name preview during creation
**Request**: When filling in the "Create Datacenter" form (or any named entity), show the conforming name as data is entered, before saving.

**Fix**:
- In the Hierarchy.tsx "quick add" dialogs (or wherever entity creation forms live), hook the FK selectors to call `GET /api/v1/naming/generate?...` in real time with the current field values.
- Display the generated `vf_long_name`, `vf_short_name`, `tia606b_name` as a live preview below the form inputs.
- Use a 300ms debounce on field changes to avoid excessive API calls.

---

## 🏗️ Major Features (New Development — Phase 3)

### FEAT-1: Sites — Redesign Simple Name Generation
**Current**: `simple_name` is a free-text field, often left null.  
**Requested**: Auto-conform from hierarchy data. Example: `vfhmcc1` = VF (org) + HM (home campus) + CC (central colombia region) + 1 (site sequence). This is a "regional code".

**Design**:
- Add a `site_code_type` field to Site: `"auto" | "custom" | "theme"`.
- `"auto"`: derive from `org.abbreviation + campus.abbreviation + region.abbreviation + sequence` → stored in `simple_name` on save/update.
- `"custom"`: user types their own code (validated for uniqueness).
- `"theme"`: user picks from a themed name (see FEAT-3).
- Backend: add a naming endpoint `GET /api/v1/naming/site-code?org_id=&campus_id=&region_id=` that returns the auto-conformed code preview.
- Frontend: Sites.tsx gets a tri-mode simple_name control: auto (read-only, generated), custom (editable text), theme (picker).

**Also fix**: `vf_short_name` is "excessively short" (e.g., "VF"). Review the short name generation algorithm — it should include enough context to be meaningful (e.g., `VFHM` → Home site, identifiable).

### FEAT-2: Sites — Separate Regional vs. Physical Location Hierarchy
**Current**: Sites table has `building_id`, `floor_section_id` — mixing regional (site = region) with physical (building, floor).

**Requested**: Sites = regions. Buildings, floors, sections = separate physical hierarchy attached to a site.

**Design**:
- **Sites table**: keep `org_id, cloud_id, region_id, campus_id`. Remove `building_id`, `floor_section_id` from the sites form/view (they can remain as DB columns for migration compatibility but shouldn't be on the Sites UI page).
- **Physical Locations**: `Building → Floor → Section/Room` hierarchy is already in the DB (`buildings`, `datacenter_floors`, `rooms` tables via the Hierarchy/Datacenter structure). These should be shown in the **Hierarchy** page, not Sites.
- **Sites page**: Show site as "region" — `org, cloud, region, campus` + generated names. Clean, focused.
- **Hierarchy page**: Build → Floor → Room is where building/floor/section data lives.

### FEAT-3: Sites / Floors / Rooms — Themed "Fun Names" (Searchable)
**Requested**: A third name type where users pick a themed name (e.g., Star Wars planets, Greek gods, mountain peaks). Searchable and selectable. 3–4 topic categories. Applies to Sites, Floors, Rooms.

**Design**:
- Add `theme_name VARCHAR(120)` field to `sites`, `datacenter_floors`, `rooms` tables (migration).
- Add `theme_category VARCHAR(40)` field: `"star_wars" | "greek_mythology" | "mountain_peaks" | "space_missions"`.
- **Backend**: New endpoint `GET /api/v1/naming/theme-names?category=star_wars&q=tat` — fetches/searches themed name lists. For MVP, ship with built-in lists (100+ names per category); for production, optionally fetch from Wikipedia/web.
- **Built-in lists to include at launch**:
  - `star_wars`: Tatooine, Dagobah, Hoth, Coruscant, Endor, Naboo, Mustafar, Kamino, Alderaan, Jakku, Mandalore, Exegol, Bespin, Geonosis, Ryloth, Mon Calamari, Kashyyyk, Felucia, Utapau, Mygeeto, Cato Neimoidia, Dathomir, Teth, Christophsis ...
  - `greek_mythology`: Olympus, Ithaca, Crete, Delphi, Sparta, Troy, Elysium, Tartarus, Arcadia, Thessaly, Boeotia, Attica, Corinth, Phocis, Epirus, Lesbos, Rhodes, Delos, Samos, Lemnos ...
  - `mountain_peaks`: Everest, K2, Kangchenjunga, Lhotse, Makalu, Cho Oyu, Dhaulagiri, Manaslu, Nanga Parbat, Annapurna, Gasherbrum, Broad Peak, Shishapangma, Rakaposhi, Kamet ...
  - `space_missions`: Apollo, Gemini, Mercury, Voyager, Cassini, Pioneer, Viking, Magellan, Juno, Galileo, Ulysses, New Horizons, Dawn, Rosetta, Stardust, Genesis, Messenger ...
- **Frontend**: A `ThemeNamePicker` modal component — shows 4 category tabs, search box, grid of name cards. User clicks → name populated in `theme_name` field.
- The `theme_name` appears in the entity list alongside `simple_name`.

### FEAT-4: More Regions — Colombia + International
**Requested**: At least 4 Colombian regions and 10 international well-known regions.

**Add to seed (regions table)**:
- Colombia: Región Central (Bogotá/Cundinamarca), Región Caribe, Región Pacífica (Cali/Valle), Región Andina (Medellín/Antioquia), Región Orinoquía, Región Amazonía
- International: North America East (NAEAST), North America West (NAWEST), EMEA (Europe/Middle East/Africa), APAC (Asia-Pacific), LATAM South, UK/Ireland, Central Europe, Nordic, Southeast Asia, ANZ (Australia/New Zealand), Middle East, Africa Sub-Saharan, India Subcontinent, Japan

**Abbreviations needed for naming engine**: CO_CTR, CO_CAR, CO_PAC, CO_AND, CO_ORI, CO_AMZ, NA_E, NA_W, EMEA, APAC, LA_S, UK, C_EU, NORD, SEA, ANZ, ME, AFSS, IND, JPN.

### FEAT-5: Physical Hierarchy — Datacenter Name = Airport Code
**Requested**: Datacenter names should use the IATA airport code of the city (e.g., BOG for Bogotá, MDE for Medellín, CLO for Cali).

**Design**:
- Add `city` and `iata_code` fields to the `Datacenter` model (and `datacenter_floors`, `rooms` if needed).
- Backend: `GET /api/v1/naming/airport-code?city=Bogota` — looks up IATA code from a built-in list (top 200 world airports), returns `{"city": "Bogotá", "iata_code": "BOG", "alternatives": ["BOG"]}`.
- Naming engine: use `iata_code` as the city abbreviation component when generating `vf_long_name` for datacenters.
- Frontend: Hierarchy.tsx datacenter form gets a "City / IATA code" field with autocomplete.

**Built-in airport list** (subset needed): BOG, MDE, CLO, BAQ, CTG, BGA, PEI, ADZ, EYP, MIA, LAX, JFK, ORD, DFW, ATL, DEN, SEA, SFO, BOS, YYZ, GRU, EZE, SCL, LIM, LHR, CDG, FRA, AMS, MAD, BCN, FCO, ZRH, MUC, ARN, OSL, HEL, DXB, DOH, SIN, HKG, NRT, PEK, SYD, AKL ...

### FEAT-6: Rack View — Back of Rack + Cable Connections
**Requested**: 
- Show both front and back of rack
- Support for Visio Café stencils (custom per-model SVG graphics)
- Cable connections: click a port (NIC/power) on one device → select destination port on another device → creates a labeled cable entry with from/to

**Design** (multi-sprint):

**Sprint 6A — Dual-face rack view**:
- `RackDiagramSVG.tsx` gets a `face: "front" | "back"` prop.
- `RackView.tsx` adds a Front/Back toggle button above the SVG.
- Port connector dots drawn on the back face — colored by port type (copper=blue, fiber=orange, power=yellow).
- Data source: `DeviceInterface` table (already exists) for data ports; `PowerOutlet` for power connections.

**Sprint 6B — Stencil library**:
- Add `stencil_url` field to `NetworkDeviceType`, `ComputeDeviceType`, `StorageDeviceType` models.
- `GET /api/v1/stencils/{model_slug}` proxy endpoint downloads from Visio Café (or local cache).
- In SVG renderer: if `stencil_url` exists, embed `<image href="...">` at the device rect position instead of a colored rectangle.
- Admin UI: model detail page lets user set stencil URL (paste from Visio Café).
- Local caching: stencils stored in `backend/static/stencils/` after first download.

**Sprint 6C — Port-to-port cable connections**:
- In back-face view, hovering a port shows its label (e.g., `eth0`, `NIC1`, `PWR-A`).
- Clicking a source port opens "Connect to..." panel: list of all devices + their ports in the same rack (or across racks in the same datacenter).
- Selecting a destination creates a `Cable` record: `{from_device_type, from_device_id, from_port_id, to_device_type, to_device_id, to_port_id, cable_type, label}`.
- Cable label auto-generated: `{from_device_name}-{port}→{to_device_name}-{port}` (this IS the from/to tag for physical cable labeling).
- Cables viewer: shows all connections as a structured table with from/to columns, filterable by rack or device.
- Naming convention extension: cable label format (e.g., `KRB-SWE1-E0-→-KRB-SRV1-NIC1`) added to the naming engine.

### FEAT-7: Device Detail Dashboard
**Requested**: Clicking on any device name in a listing → opens a full, editable detail page with all related information (specs, interfaces, VMs, IP assignments, cables, changelog).

**Design**:
- New route: `/devices/:type/:id` (e.g., `/devices/physical-servers/1`).
- Component: `DeviceDashboard.tsx` — tabbed layout:
  - **Overview**: all model fields, editable inline (replaces raw AG Grid editing for this device)
  - **Interfaces**: list of `DeviceInterface` records for this device (add/edit/delete)
  - **IP Assignments**: list of `IpAssignment` records
  - **VMs / Containers**: (for physical servers) list of hosted VMs/containers
  - **Cables**: from/to cable connections (once FEAT-6C is built)
  - **Changelog**: all audit log entries for this device
  - **Facts** (Ansible): last known facts collected by Ansible (from `POST /devices/{type}/{id}/facts`)
- In all listing grids: make the `name` column (`vf_long_name` or `simple_name`) a clickable link that navigates to `/devices/:type/:id`.
- Same applies to physical servers, VMs, workstations, network devices.

---

## 📍 Prioritization for Next Session

### Immediate (fix bugs before anything else):
1. BUG-A: VLANs page — add `site_id` FK column to Vlans EntityGrid
2. BUG-B: IPAM empty — fix site filter / ensure all subnets have site_id
3. BUG-C: Add row errors — audit all models for NOT NULL FKs without UI columns
4. BUG-D: IPAM columns — add `range_from`, `range_to`, `expansion_ceiling`, `reserved_count`, `reservation_anchor` to subnet views

### Sprint 3A (UX polish, 1-2 days):
- UX-1: Full cell content (no truncation)
- UX-2: Dropdown arrow indicator
- UX-3: Name fields in all listings
- UX-4: Real-time name preview
- FEAT-4: More regions (Colombia + international) — seed-only change

### Sprint 3B (Site redesign, 2-3 days):
- FEAT-1: Sites — auto-conform simple_name
- FEAT-2: Sites — separate regional vs. physical hierarchy in UI
- FEAT-3: Themed fun names (Star Wars planets etc.)
- FEAT-5: Airport code for datacenters

### Sprint 3C (Device dashboard, 2-3 days):
- FEAT-7: Device detail dashboard (click-through pages)

### Sprint 3D (Rack back + cables, 3-5 days):
- FEAT-6A: Dual-face rack view (front/back toggle)
- FEAT-6B: Stencil library (Visio Café)
- FEAT-6C: Port-to-port cable connections

---

## 🔐 Constraints (unchanged from previous phases)
- Podman only (no Docker)
- No credentials in DB
- Global unique VLAN IDs
- Hard-reject overlapping CIDRs
- Gateway IP always auto-reserved on subnet creation
- IPv4 primary, IPv6 schema-complete
