# Implementation Plan: phase-4-ux-graphical-views

## Overview

Four sub-phases, each ending in a checkpoint. Backend/schema work lands before
the frontend that depends on it. Sub-phase C shares two frontend utility
modules (`lib/anchors.ts`, `lib/connections.ts`) across four graphical views,
so those utilities are built once before the views that consume them.

## Tasks

### Sub-phase A — Global UX Polish

- [x] 1. Dashboard navigation
  - [x] 1.1 Add `ROUTE_FOR_COUNT` map + `tableToRoute()` resolver in `frontend/src/pages/Dashboard.tsx`; wrap count cards and recent-change rows in `<Link>`
    - _Requirements: 1.1, 1.2, 1.3_
  - [x]* 1.2 Vitest for the resolver covering every key `/dashboard/summary` returns
    - _Requirements: 1.1, 1.3_

- [x] 2. Dashboard summary depth
  - [x] 2.1 Extend `dashboard_summary` in `backend/app/routers/special.py` to return a `breakdowns` dict (devices by role/type, avg subnet utilization, changes in last 24h)
    - _Requirements: 2.1_
  - [x] 2.2 Render breakdowns as compact sub-lists on each Dashboard card
    - _Requirements: 2.2_
  - [x]* 2.3 pytest asserting breakdown shape/values against seeded data

- [x] 3. Reorder left navigation
  - [x] 3.1 Move the "Reference" group to index 0 of `NAV` in `frontend/src/components/Layout.tsx`
    - _Requirements: 3.1_

- [x] 4. Bigger, animated dropdown chevron
  - [x] 4.1 Increase `.vf-dd-caret` size and add a hover/focus transition in `frontend/src/index.css`
    - _Requirements: 4.1, 4.2_

- [x] 5. Single-click fuzzy dropdown editing
  - [x] 5.1 Create `frontend/src/lib/fuzzy.ts` (score/match utility)
    - _Requirements: 5.2_
  - [x]* 5.2 Vitest for `fuzzy.ts` (ranking, no-match, empty-query cases)
  - [x] 5.3 Create `frontend/src/components/FuzzySelectEditor.tsx` (custom AG Grid cell editor)
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 5.4 Wire `singleClickEdit` into `EntityGrid.tsx`; switch `fkCol`/`selectCol` in `lib/columns.tsx` to use `FuzzySelectEditor`
    - _Requirements: 5.1_
  - [x]* 5.5 Vitest: type a fuzzy/typo'd query in the editor, select, assert commit

- [x] 6. Per-section fuzzy search
  - [x] 6.1 Add a toolbar search `<input>` to `EntityGrid.tsx` wired to a `doesExternalFilterPass` using `fuzzy.ts`
    - _Requirements: 6.1, 6.2, 6.3_
  - [x]* 6.2 Vitest: query narrows grid to expected subset; empty query shows all

- [x] 7. IPAM description-first
  - [x] 7.1 Move the Description column to index 0 in both tables of `frontend/src/pages/IPAM.tsx` and `frontend/src/pages/Subnets.tsx`; verify `IPV4_COLS`/`IPV6_COLS` colspans still match
    - _Requirements: 7.1_

- [x] 8. Checkpoint A — verify build + tests, then pause only if the user wants to browser-test before continuing; otherwise proceed.

### Sub-phase B — Reference-Data Correctness

- [x] 9. Region cleanup
  - [x] 9.1 Replace the `Region` seed list in `backend/app/seed.py` with Colombia + well-known Americas regions only
    - _Requirements: 8.1_
  - [x] 9.2 Create `backend/alembic/versions/0007_region_cleanup.py`: guarded delete of non-approved, unreferenced rows (idempotent, following the 0005/0006 guard style)
    - _Requirements: 8.2, 8.3_
  - [x]* 9.3 pytest: referenced non-approved row survives; unreferenced non-approved row is deleted; approved rows untouched
    - _Requirements: 8.2, 8.3_
  - [x] 9.4 Confirm `ReferenceData.tsx` manual-add still works against the pruned list (no code change expected; verification only)
    - _Requirements: 8.4_

- [x] 10. In-cell airport search
  - [x] 10.1 Create `frontend/src/components/AirportCellEditor.tsx` (async search via `api.airportCode`)
    - _Requirements: 9.1, 9.2_
  - [x] 10.2 Add `airportCol()` to `lib/columns.tsx`; apply to the datacenter IATA column
    - _Requirements: 9.1, 9.2_
  - [x]* 10.3 Vitest: typing a city resolves and commits the right IATA code

- [x] 11. Networking theme + device simple name
  - [x] 11.1 Add a `NETWORKING` catalogue to `backend/app/themes.py`, register in `THEMES`/`CATEGORY_LABELS`
    - _Requirements: 10.1_
  - [x] 11.2 Create `backend/alembic/versions/0008_network_device_theme.py`: add `theme_name`/`theme_category` to `network_devices`
    - _Requirements: 10.3_
  - [x] 11.3 Wire `ThemeNamePicker` (category defaulted to `networking`) into the Alt Name column of `frontend/src/pages/NetworkDevices.tsx`, writing to `alternative_name`; keep manual text entry
    - _Requirements: 10.2, 10.3, 10.4_
  - [x]* 11.4 pytest for the new theme category's `search()`; Vitest for picker -> field write

- [x] 12. Checkpoint B — verify build + tests, then proceed.

### Sub-phase C — Graphical, Connection-Aware Views

- [x] 13. `stencil_anchors` table + API
  - [x] 13.1 Add `StencilAnchor` model to `backend/app/models.py`
    - _Requirements: 19.1_
  - [x] 13.2 Create `backend/alembic/versions/0009_stencil_anchors_and_power_types.py`: `stencil_anchors` table, `stencil_url_back` on the 3 existing device-type models, new `power_device_types` table, `PowerDevice.device_type_id`
    - _Requirements: 14.1, 17.2, 19.1_
  - [x] 13.3 Register `stencil-anchors` and `power-device-types` in `backend/app/registry.py`
    - _Requirements: 19.1_
  - [x] 13.4 Add `GET /stencils/{model_slug}/anchors` to `backend/app/routers/special.py`
    - _Requirements: 19.3, 19.4_
  - [x]* 13.5 pytest: anchor CRUD round-trip; fetch by owner+face; migration backfill/guard check

- [x] 14. Anchor editor UI
  - [x] 14.1 Create `frontend/src/components/AnchorEditor.tsx` (click-to-place, prompts for port identifier, lists/deletes anchors)
    - _Requirements: 19.2, 19.5_
  - [x] 14.2 Embed `AnchorEditor` as an "Edit anchors" expandable section in `frontend/src/components/StencilField.tsx`
    - _Requirements: 19.2, 19.5_
  - [x]* 14.3 Vitest: click records a normalized position; delete removes an anchor

- [x] 15. Shared anchor/connection utilities
  - [x] 15.1 Create `frontend/src/lib/anchors.ts`: `resolveAnchor()` + per-view Convention_Layout fallback generators
    - _Requirements: 19.3, 19.4_
  - [x] 15.2 Create `frontend/src/lib/connections.ts`: `resolveConnection(port, cables)` -> connected/open + far end
    - _Requirements: 15.1, 15.2_
  - [x]* 15.3 Vitest: anchor-found vs fallback cases; connected vs open resolution

- [x] 16. Rack view — breadcrumb + deep link
  - [x] 16.1 Create `frontend/src/components/BreadcrumbNav.tsx` (Site>DC>Floor>Rack, click narrows, accepts a `rackId` deep-link prop)
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 16.2 Integrate `BreadcrumbNav` into `frontend/src/pages/RackView.tsx`, replacing/augmenting the cascading dropdowns; support `?rackId=` query param
    - _Requirements: 11.1, 11.2, 11.3_
  - [x]* 16.3 Vitest: clicking a crumb narrows state; deep-link pre-selects full path

- [x] 17. Rack view — prominent front/back toggle
  - [x] 17.1 Restyle the toggle in `RackView.tsx` as a labeled, visually prominent segmented control with a short hint
    - _Requirements: 12.1_

- [x] 18. Rack view — add/edit/remove equipment
  - [x] 18.1 Create `frontend/src/components/RackSlotEditor.tsx` (empty-slot: create-new or assign-existing; occupied-slot: edit label/height or remove)
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  - [x] 18.2 Wire slot clicks in `RackDiagramSVG.tsx`/`RackView.tsx` to open `RackSlotEditor`; on confirm, update `rack_units` AND the device's own `rack_id`/`rack_unit` via existing generic CRUD calls
    - _Requirements: 13.2, 13.4_
  - [x]* 18.3 Vitest: add/move/remove flows call the expected CRUD payloads

- [x] 19. Rack view — back-face stencils
  - [x] 19.1 `RackView.tsx`: build `stencilHrefByType` for both faces from the 3 device-type resources' `stencil_url`/`stencil_url_back`; pass into `RackDiagramSVG`
    - _Requirements: 14.2_
  - [x] 19.2 `RackDiagramSVG.tsx`: render the back-face stencil `<image>` when present, else keep the dimmed rectangle; position ports via `lib/anchors.ts`
    - _Requirements: 14.2, 14.3, 19.3, 19.4_
  - [x]* 19.3 Vitest: back face renders `<image>` when a back stencil is configured; falls back otherwise

- [x] 20. Rack view — editable connections
  - [x] 20.1 Create `frontend/src/components/ConnectionDot.tsx` (shared dot rendering + click routing) and `frontend/src/components/ConnectionInfoPanel.tsx` (view/edit/remove/jump)
    - _Requirements: 15.1, 15.2, 15.3, 15.4_
  - [x] 20.2 Integrate `ConnectionDot`/`ConnectionInfoPanel` into `RackDiagramSVG.tsx`'s back face, replacing the plain circles; `ConnectPanel.tsx` gains an edit mode (delete+recreate)
    - _Requirements: 15.3, 15.4_
  - [x]* 20.3 Vitest: create/edit/remove flows; jump-to-far-end navigates correctly

- [x] 21. Patch panel graphical view
  - [x] 21.1 Create `frontend/src/components/PatchPanelDiagramSVG.tsx` (Convention_Layout grid of `PatchPanelPort` rows) using the shared `ConnectionDot`
    - _Requirements: 16.2, 16.3_
  - [x] 21.2 Create `frontend/src/pages/PatchPanelView.tsx` with `BreadcrumbNav` down to a selected patch panel; add route `/patch-panel-view` + nav entry
    - _Requirements: 16.1_
  - [x] 21.3 Backend: add `"patch_panel_port"` port kind to `backend/app/ports.py` (rack resolution via `PatchPanelPort.patch_panel_id -> PatchPanel.rack_id`)
    - _Requirements: 16.3_
  - [x]* 21.4 pytest: patch-panel-port candidates resolve correctly; Vitest for the view's connection interactions

- [x] 22. Power device types + stencils
  - [x] 22.1 Backend: extend `STENCIL_RESOURCES` in `special.py` to include `power-device-types`; confirm anchors/back-face reuse Task 13's table
    - _Requirements: 17.2_
  - [x] 22.2 Frontend: extend `Naming.tsx`'s stencil panel (or a new small admin page) to manage `power-device-types` rows + their stencils
    - _Requirements: 17.2_
  - [x]* 22.3 pytest: power-device-type stencil fetch works identically to the other three types

- [x] 23. Power device graphical view
  - [x] 23.1 Create `frontend/src/components/PowerDiagramSVG.tsx` (stencil-based when the power device's type has one, else Convention_Layout grid of `PowerOutlet` rows) using shared `ConnectionDot`
    - _Requirements: 17.2, 17.3, 17.4_
  - [x] 23.2 Create `frontend/src/pages/PowerDeviceView.tsx` with `BreadcrumbNav`; add route + nav entry
    - _Requirements: 17.1_
  - [x]* 23.3 Vitest: stencil path vs fallback path both render outlets and connection interactions

- [x] 24. Port configuration graphical view
  - [x] 24.1 Create `frontend/src/components/PortConfigDiagramSVG.tsx` (anchor-aware via `lib/anchors.ts`, else Convention_Layout grid) using shared `ConnectionDot`; settings-click opens a side panel for port fields
    - _Requirements: 18.2, 18.3, 18.4_
  - [x] 24.2 Add a per-device drill-in to `frontend/src/pages/PortConfig.tsx` (or new `PortConfigView.tsx`) with `BreadcrumbNav` down to a network device, ahead of the existing flat grid
    - _Requirements: 18.1_
  - [x]* 24.3 Vitest: settings click vs connect click route to the correct panel

- [x] 25. Checkpoint C — full build + test verification of the graphical-views workstream, then proceed.

### Sub-phase D — Automation & Device Depth

- [x] 26. Cable auto-sync
  - [x] 26.1 Add `Cable.auto_generated` to `models.py`; migration `0010_cable_auto_generated.py`
    - _Requirements: 20.1, 20.3_
  - [x] 26.2 Implement `_sync_cable_for_interface()` in `backend/app/crud.py`, called from `create_item`/`update_item` at the `_autoreserve_gateway` insertion point, guarded by `type(obj) is models.DeviceInterface`
    - _Requirements: 20.1, 20.2, 20.3_
  - [x]* 26.3 pytest: create-on-set, update-on-change, clear-on-null, and a manually-created cable is never touched
    - _Requirements: 20.1, 20.2, 20.3_

- [x] 27. Ansible-depth facts
  - [x] 27.1 Add `ansible_facts` JSONB + `cpu_cores`/`memory_mb`/`os_distribution`/`last_fact_sync_at` to `PhysicalServer`, `VirtualMachine`, `Workstation`, `NetworkDevice`, `ContainerApp`; migration `0011_device_facts.py`
    - _Requirements: 21.1, 21.2, 21.3_
  - [x] 27.2 Extend `ingest_facts` in `special.py`: promote known keys to dedicated columns, merge the rest into `ansible_facts`, stamp `last_fact_sync_at`
    - _Requirements: 21.2, 21.3_
  - [x] 27.3 Replace the `AnsibleFactsTab` placeholder in `DeviceDashboard.tsx` with promoted fields + a collapsible JSON tree for `ansible_facts`
    - _Requirements: 21.4_
  - [x]* 27.4 pytest: promotion + JSONB merge; Vitest for the tab rendering both promoted fields and the JSON tree

- [x] 28. Checkpoint D — final full build + test verification of the entire Phase 4 scope; present to the user for browser testing.

### Sub-phase E — Stencil Library Import (backlog addition, not gated on Checkpoint D)

- [x] 29. Conversion engine
  - [x] 29.1 Add `libvisio2svg` build steps to `backend/Containerfile` (apt build deps incl. `gsfonts`; `git clone` + `cmake`/`make install` for `libemf2svg` and `libvisio2svg`)
    - _Requirements: 22.3_
  - [x] 29.2 Create `backend/app/stencil_library.py`: subprocess wrapper calling `vss2svg-conv -i <file> -o <tmpdir>`, parsing the resulting per-shape SVG filenames into `[{title, svg_path}]`
    - _Requirements: 22.3_
  - [x]* 29.3 pytest: conversion of a small sample `.vss` fixture produces the expected SVG files; skips cleanly (not a hard failure) when the CLI binary isn't present in the test environment

- [x] 30. Source catalogue + fetch endpoints
  - [x] 30.1 Create `backend/app/stencil_sources.py`: category -> file index — GitHub tree listing for `bhdicaire/visioStencils`'s `Stencils/` folder (live via the GitHub API) + a hand-maintained list of VisioCafe category/download entries
    - _Requirements: 22.1, 22.2_
  - [x] 30.2 Add `GET /stencil-library/categories` and `GET /stencil-library/categories/{cat}/files` to `special.py`
    - _Requirements: 22.1, 22.2_
  - [x] 30.3 Add `POST /stencil-library/fetch` to `special.py`: download the chosen file into `backend/static/stencil_cache/`, run `stencil_library.py`, return per-shape SVG preview URLs
    - _Requirements: 22.3, 22.5_
  - [x]* 30.4 pytest: catalogue listing shape; fetch-and-convert round trip against a small fixture file (network calls mocked); error path leaves no partial state

- [x] 31. Stencil library picker UI
  - [x] 31.1 Create `frontend/src/components/StencilLibraryPicker.tsx`: category select -> file select -> fetch/convert -> shape-thumbnail grid -> pick, then calls existing `api.uploadStencil(modelSlug, file, face)` with the chosen shape's SVG
    - _Requirements: 22.4_
  - [x] 31.2 Add a "Browse stencil library" entry point into `frontend/src/components/StencilField.tsx` alongside the existing manual upload control
    - _Requirements: 22.4_
  - [x]* 31.3 Vitest: category -> file -> shape selection flow calls `uploadStencil` with the expected payload; fetch/convert error surfaces without calling upload

- [x] 32. Checkpoint E — build + test verification of the stencil-library workstream; live-verify one real fetch+convert+apply round trip against each of the two sources before presenting for browser testing.

## Notes

- Tasks marked `*` are optional (test-writing) and are still executed in this
  workflow since they carry real verification value, matching the FEAT-6
  precedent of always verifying against a live Postgres container.
- Every migration follows the guarded/idempotent style of `0005`/`0006`.
- No task introduces a new frontend dependency; all graphical work extends
  the existing SVG components.
- Sub-phase E (29-32) is a backlog addition requested after Checkpoint C
  started; it introduces one new backend system dependency (`libvisio2svg`,
  built from source in the Containerfile) but no new frontend dependency and
  no new persistent table — a picked stencil shape is saved through the
  existing Task 14 upload endpoint. It does not block Sub-phase D or
  Checkpoint D and can land before or after them.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "4.1", "5.1", "7.1", "9.1", "11.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "5.3", "6.1", "9.2", "10.1", "11.2", "13.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "5.4", "6.2", "9.3", "9.4", "10.2", "11.3", "13.2"] },
    { "id": 3, "tasks": ["5.2", "5.5", "10.3", "11.4", "13.3", "13.4"] },
    { "id": 4, "tasks": ["8", "13.5", "14.1"] },
    { "id": 5, "tasks": ["12", "14.2", "15.1", "15.2"] },
    { "id": 6, "tasks": ["14.3", "15.3", "16.1", "22.1"] },
    { "id": 7, "tasks": ["16.2", "17.1", "22.2"] },
    { "id": 8, "tasks": ["16.3", "18.1", "19.1", "22.3"] },
    { "id": 9, "tasks": ["18.2", "19.2", "23.1", "24.1"] },
    { "id": 10, "tasks": ["18.3", "19.3", "20.1", "23.2", "24.2"] },
    { "id": 11, "tasks": ["20.2", "21.1", "23.3", "24.3"] },
    { "id": 12, "tasks": ["20.3", "21.2"] },
    { "id": 13, "tasks": ["21.3", "26.1"] },
    { "id": 14, "tasks": ["21.4", "25", "26.2"] },
    { "id": 15, "tasks": ["26.3", "27.1"] },
    { "id": 16, "tasks": ["27.2"] },
    { "id": 17, "tasks": ["27.3"] },
    { "id": 18, "tasks": ["27.4", "28"] },
    { "id": 19, "tasks": ["29.1"] },
    { "id": 20, "tasks": ["29.2", "30.1"] },
    { "id": 21, "tasks": ["29.3", "30.2"] },
    { "id": 22, "tasks": ["30.3"] },
    { "id": 23, "tasks": ["30.4", "31.1"] },
    { "id": 24, "tasks": ["31.2"] },
    { "id": 25, "tasks": ["31.3"] },
    { "id": 26, "tasks": ["32"] }
  ]
}
```
