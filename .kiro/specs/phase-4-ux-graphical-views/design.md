# Design Document

## Architecture

Phase 4 extends the existing generic-CRUD + SVG-diagram architecture rather
than introducing new frameworks. Four coordinated sub-phases:

```
Sub-phase A (UX polish)        -> frontend-only, no schema changes
Sub-phase B (reference data)   -> one data migration + frontend cell editors
Sub-phase C (graphical views)  -> stencil_anchors table + 4 SVG view components
Sub-phase D (automation)       -> crud.py sync hook + facts columns/JSONB
```

All writes continue through `crud.create_item` / `update_item` / `delete_item`
(or the generic router built on them) so changelog + naming stay authoritative.
Graphical views are read-heavy overlays that call the same CRUD endpoints for
mutations — there is no parallel write path.

### Anchor + connection rendering pipeline (Sub-phase C core)

```
Admin: StencilField "Edit anchors" -> click stencil -> POST stencil-anchors
                                                          |
                                                          v
                                              stencil_anchors table (DB)
                                                          |
        GET /stencils/{slug}/anchors  <-----------------/
                 |
                 v
   lib/anchors.ts: resolveAnchor(ownerType, ownerId, face, portKey)
                 |
        anchor found? --yes--> normalized (x,y) -> pixel position
                 |no
                 v
        Convention_Layout (grid/linear fallback, per view type)
                 |
                 v
        <ConnectionDot> at resolved position
                 |
   lib/connections.ts: resolveConnection(port, cables[]) -> connected | open
                 |
        connected -> filled ring, click -> ConnectionInfoPanel (edit/remove/jump)
        open      -> hollow dot,  click -> ConnectPanel (create) [existing]
```

Anchors are stored as **normalized 0-1 fractions** of the stencil's rendered
box, so one anchor map works at any render scale. `lib/anchors.ts` and
`lib/connections.ts` are shared by all four graphical view components
(`RackDiagramSVG`, and new `PatchPanelDiagramSVG`, `PowerDiagramSVG`,
`PortConfigDiagramSVG`), so there is one anchor-resolution and one
connection-resolution implementation, not four.

## Data Models

### Sub-phase B

- **Region cleanup**: data-only migration `0007_region_cleanup.py`. No column
  changes. Guarded: for each existing `Region` row not in the approved
  Colombia+Americas list, delete only if `SELECT count(*) FROM sites WHERE
  region_id = :id` is 0.
- **`network_devices`**: add `theme_name VARCHAR(120)`, `theme_category
  VARCHAR(40)` (mirrors `sites`/`datacenter_floors`/`rooms` from FEAT-3).
  `alternative_name` (existing column) becomes the display "Simple Name" and
  is written by the theme picker or typed manually — no rename, to avoid
  touching every existing reference to `alternative_name`.

### Sub-phase C

- **New table `stencil_anchors`**:
  ```
  id                 PK
  owner_resource     VARCHAR(40)   -- kebab slug, e.g. "network-device-types"
  owner_id           INTEGER       -- the device-type lookup row id
  face               VARCHAR(10)   -- "front" | "back"
  port_key           VARCHAR(80)   -- port identifier (e.g. "24", "nic4")
  x                  FLOAT         -- 0..1 normalized
  y                  FLOAT         -- 0..1 normalized
  label              VARCHAR(120)  -- optional operator-facing label
  UNIQUE (owner_resource, owner_id, face, port_key)
  ```
  Registered in `ENTITY_REGISTRY` as `stencil-anchors` for generic CRUD reuse
  by the admin editor.
- **Device-type stencil back face**: add `stencil_url_back VARCHAR(500)` to
  `NetworkDeviceType`, `ComputeDeviceType`, `StorageDeviceType`, and the new
  `PowerDeviceType`.
- **New table `power_device_types`** (mirrors `LookupMixin` + `stencil_url` +
  `stencil_url_back` pattern of the other three device-type lookups).
  `PowerDevice` gains `device_type_id -> power_device_types.id` (nullable,
  additive; existing free-text `brand`/`model` stay as-is for override/notes).
- **Patch-panel and power connections** reuse the existing `Cable` polymorphic
  `port_a_type`/`port_b_type` scheme. `ports.py` gains a third port kind,
  `"patch_panel_port"`, resolved via `PatchPanelPort.patch_panel_id ->
  PatchPanel.rack_id` (parallel to how `PowerOutlet.rack_id` already resolves
  today).

### Sub-phase D

- **`cables`**: add `auto_generated BOOLEAN NOT NULL DEFAULT false`.
- **Facts columns**, added to `PhysicalServer`, `VirtualMachine`, `Workstation`,
  `NetworkDevice`, `ContainerApp`:
  ```
  ansible_facts       JSONB
  cpu_cores           INTEGER
  memory_mb           INTEGER
  os_distribution     VARCHAR(80)
  last_fact_sync_at   TIMESTAMPTZ
  ```

## Components and Interfaces

### Sub-phase A (frontend-only)

| Component | Change |
| --- | --- |
| `Dashboard.tsx` | `ROUTE_FOR_COUNT: Record<string,string>` + `tableToRoute(tableName, recordId)`; wrap cards/rows in `<Link>`. |
| `special.py` `dashboard_summary` | add `breakdowns: dict` alongside `counts`. |
| `Layout.tsx` | reorder `NAV` array — "Reference" group moves to index 0. |
| `index.css` `.vf-dd-caret` | larger font-size + `transition`/keyframe animation on hover/focus. |
| `EntityGrid.tsx` | add `singleClickEdit` to `AgGridReact`; add a toolbar search `<input>` wired to a custom `doesExternalFilterPass`. |
| new `lib/fuzzy.ts` | small fuzzy-match/score utility (subsequence + normalized Levenshtein-lite), used by both the search box and the new editor. |
| new `components/FuzzySelectEditor.tsx` | custom AG Grid cell editor: text input + filtered/ranked option list, replaces `agSelectCellEditor` in `fkCol`/`selectCol`. |
| `IPAM.tsx`, `Subnets.tsx` | move the Description `<th>`/`<td>` to index 0 in both IPv4/IPv6 tables. |

### Sub-phase B

| Component | Change |
| --- | --- |
| `seed.py` | replace `Region` seed list with Colombia + well-known Americas only. |
| new migration `0007_region_cleanup.py` | guarded delete of unreferenced non-approved rows. |
| new `components/AirportCellEditor.tsx` + `lib/columns.tsx` `airportCol()` | async-search custom cell editor reusing `api.airportCode`. |
| `themes.py` | add `NETWORKING` catalogue + register in `THEMES`/`CATEGORY_LABELS`. |
| migration `0008_network_device_theme.py` | add `theme_name`/`theme_category` to `network_devices`. |
| `NetworkDevices.tsx` | replace the plain `textCol("alternative_name")` with a themed-picker column (reuses `ThemeNamePicker.tsx`, category defaulted to `networking`) + keep manual text entry. |

### Sub-phase C

| Component | Location | Responsibility |
| --- | --- | --- |
| `StencilAnchor` model | `models.py` | anchor row |
| migration `0009_stencil_anchors_and_power_types.py` | `alembic/versions/` | new table + back-face columns + `power_device_types` + `PowerDevice.device_type_id` |
| `GET /stencils/{model_slug}/anchors` | `special.py` | list anchors for a stencil owner |
| `stencil-anchors` CRUD | `registry.py` | generic create/delete for the anchor editor |
| `lib/anchors.ts` | frontend | `resolveAnchor()` + fallback grid generators (`rackPortFallback`, `patchPanelFallback`, `powerOutletFallback`, `portConfigFallback`) |
| `lib/connections.ts` | frontend | `resolveConnection(port, cables)` -> `{connected, cable, farEnd}` |
| `components/AnchorEditor.tsx` | frontend | click-to-place UI, embedded in `StencilField.tsx` |
| `components/BreadcrumbNav.tsx` | frontend | shared Site>DC>Floor>Rack(>device) breadcrumb, replaces ad hoc dropdown chain in `RackView.tsx`; accepts a deep-link `rackId` |
| `components/ConnectionDot.tsx` | frontend | shared dot rendering + click routing (open ConnectPanel vs ConnectionInfoPanel) |
| `components/ConnectionInfoPanel.tsx` | frontend | view far end / edit (delete+recreate) / remove / jump-to-far-end |
| `components/RackSlotEditor.tsx` | frontend | add/move/remove equipment from a rack U slot |
| `RackDiagramSVG.tsx` | frontend | extended: back-face stencil `<image>`, anchor-aware dot placement, `ConnectionDot` states |
| `pages/PatchPanelView.tsx` + `components/PatchPanelDiagramSVG.tsx` | frontend | new graphical view |
| `pages/PowerDeviceView.tsx` + `components/PowerDiagramSVG.tsx` | frontend | new graphical view |
| `pages/PortConfigView.tsx` (extends `PortConfig.tsx`) + `components/PortConfigDiagramSVG.tsx` | frontend | new per-device graphical drill-in ahead of the existing flat grid |

### Sub-phase D

| Component | Change |
| --- | --- |
| `crud.py` | `_sync_cable_for_interface(session, obj)` — called from `create_item`/`update_item` when `type(obj) is models.DeviceInterface`, mirroring the `_autoreserve_gateway` insertion point (after flush, before final commit). |
| `models.py` `Cable` | `auto_generated` column. |
| `special.py` `ingest_facts` | pre-process payload: pull `cpu_cores`/`memory_mb`/`os_distribution` into dedicated columns, merge remaining keys into `ansible_facts`, stamp `last_fact_sync_at`. |
| `DeviceDashboard.tsx` `AnsibleFactsTab` | replace placeholder with promoted fields + collapsible JSON tree (no new dependency — recursive `<details>`). |

### Sub-phase E — Stencil Library Import (backlog addition)

**Conversion engine decision**: `.vss`/`.vssx` stencils store each shape's
geometry in Visio's native XML vector format (or embedded EMF/WMF blobs), not
plain SVG — there is no such thing as "unzip and read the SVG" for these
files. Two real options were evaluated:

- **LibreOffice headless** (`soffice --headless --convert-to svg`) — free,
  but built for whole-document/page export; extracting individual shape
  masters cleanly is unreliable and it drags in the entire LibreOffice suite
  as a dependency.
- **`libvisio2svg`** (`vss2svg-conv` / `vsd2svg-conv`) — a small C++ tool
  built directly on `librevenge`/`libvisio` (the same import engine
  LibreOffice itself uses for Visio formats), purpose-built to convert VSS/VSD
  **stencils** into one SVG file per shape, named after the shape's title. It
  also converts embedded EMF/WMF blobs into real SVG via its companion
  `libemf2svg`/`libwmf`, rather than leaving them as opaque embedded images.
  Its own README lists VisioCafe stencils as a target use case. GPLv2
  licensed; used as an out-of-process CLI (subprocess), not linked into the
  backend, so no license obligation propagates to the app's own code — the
  same pattern as shelling out to `ffmpeg`/`pandoc`.

**Decision: use `libvisio2svg`**, built from source in `backend/Containerfile`
(no Debian package exists for it — confirmed via search; only build-from-source
and an Arch AUR package exist). Build recipe (documented and known-working):
apt packages `build-essential cmake libpng-dev libfontconfig1-dev
libfreetype6-dev libxml2-dev libwmf-dev libtool automake librevenge-dev
libvisio-dev libcppunit-dev gsfonts`, then `git clone` + `cmake`/`make
install` for `libemf2svg` and `libvisio2svg` itself (`librevenge`/`libvisio`
are available as Debian `-dev` packages directly, so only the two
smaller/unpackaged libraries need building). The `gsfonts` package is
required at runtime — its absence is a documented failure mode
(`libwmf: failed to load *any* font!`).

```
Admin: StencilField "Browse stencil library" -> pick category -> pick file
                 |
                 v
   POST /stencil-library/fetch {source, category, file}
                 |
                 v
   backend: download .vss/.vssx (cached under backend/static/stencil_cache/)
                 |
                 v
   Stencil_Conversion_Service: subprocess `vss2svg-conv -i <file> -o <tmpdir>`
                 |
                 v
   one SVG per shape master (filename = shape title) -> served as previews
                 |
                 v
   Admin picks one preview -> existing POST /stencils/{slug}?face=... (Task 14)
```

No new persistent table is required — a picked shape becomes a stencil
through the *existing* upload endpoint, so it's indistinguishable from a
manually-uploaded SVG once saved (same cache-first, offline-safe serving
Task 14 already built). The category index itself (which categories/files
exist per source) is a small curated/static mapping in
`backend/app/stencil_sources.py` rather than a live scrape of VisioCafe (which
has no structured API) — the GitHub source's `Stencils/` folder tree can be
listed via the GitHub API at request time; VisioCafe entries are a
hand-maintained list of known category pages/download links, refreshed
manually as needed.

| Component | Location | Responsibility |
| --- | --- | --- |
| `stencil_library.py` | `backend/app/` | subprocess wrapper around `vss2svg-conv`: runs the conversion in a temp dir, returns `[{title, svg_path}]` |
| `stencil_sources.py` | `backend/app/` | curated category -> source-file index (GitHub tree listing + hand-maintained VisioCafe entries) |
| `GET /stencil-library/categories` | `special.py` | list categories from both sources |
| `GET /stencil-library/categories/{cat}/files` | `special.py` | list `.vss`/`.vssx` files in a category |
| `POST /stencil-library/fetch` | `special.py` | download + convert a chosen file; returns per-shape SVG previews (served from a short-lived temp cache, not the permanent stencil cache) |
| `components/StencilLibraryPicker.tsx` | frontend | category -> file -> shape-thumbnail-grid -> pick, then calls existing `api.uploadStencil()` |
| `StencilField.tsx` | frontend | gains a "Browse stencil library" entry point alongside the existing manual upload control |

**Error handling**: a failed fetch/convert (network error, unsupported file,
`vss2svg-conv` non-zero exit) surfaces the CLI's stderr as a clear message and
never calls the upload endpoint — the existing stencil (if any) is left
untouched until the admin explicitly picks a working shape.

## Error Handling

- Region cleanup migration: never deletes a referenced row (checked via COUNT
  before DELETE); safe to re-run (idempotent — a row already deleted or never
  present is simply skipped).
- Cable sync: guarded by `auto_generated` so a manually created cable is never
  touched; clearing connected-* fields only deletes a Cable if
  `auto_generated is true`.
- Anchor resolution always has a fallback (Convention_Layout), so a
  mis-mapped or missing anchor never breaks rendering — worst case is a less
  precise dot position.
- Fuzzy cell editors: an empty query shows all options (no false negative);
  no match shows an explicit "no matches" row rather than a blank dropdown.

## Testing Strategy

- Backend: pytest against the live Postgres container (same pattern as
  FEAT-6's `backend/tests/`) for: region cleanup guard, stencil-anchors CRUD +
  fetch, cable sync create/update/clear + manual-cable protection, facts
  promotion + JSONB merge, patch-panel-port candidate resolution.
- Frontend: Vitest for `lib/fuzzy.ts`, `lib/anchors.ts`, `lib/connections.ts`
  (pure logic, highest value), `FuzzySelectEditor`, `AirportCellEditor`,
  `ConnectionDot`/`ConnectionInfoPanel` interaction flows, `BreadcrumbNav`
  navigation/deep-link behavior.
- Full-stack: `npm run build` (tsc -b + vite) and backend import checks after
  every sub-phase, exactly as done for FEAT-6.
- Manual/browser: reserved for genuine visual judgment (stencil placement
  quality, animation feel, overall graphical-view usability) — not used as a
  substitute for automated verification of correctness.
