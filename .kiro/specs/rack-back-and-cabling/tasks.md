# Implementation Plan: rack-back-and-cabling

## Overview

Implement FEAT-6 across three coordinated sprints (6A dual-face rack view, 6B stencil library, 6C port-to-port cabling), ordered so schema and backend foundations land before the frontend that consumes them. Cable writes stay on the generic CRUD path so changelog + naming come for free; the Cable_Label generator hooks into `naming.GENERATORS`; the Stencil_Service and port-candidate lookup are added as `special.py` endpoints registered before the generic catch-all. The plan follows the design's data-model changes, API contracts, component breakdown, and Testing Strategy.

## Tasks

- [-] 1. Schema foundation: models + Alembic migration 0006
  - [x] 1.1 Add new columns to `backend/app/models.py`
    - Add `stencil_url: Mapped[Optional[str]] = mapped_column(String(500))` to `NetworkDeviceType`, `ComputeDeviceType`, and `StorageDeviceType`
    - Add `label: Mapped[Optional[str]] = mapped_column(String(200))` to `Cable` (auto-generated Cable_Label; no rename of a/b fields)
    - Change `DeviceInterface.network_device_id` to `nullable=True` and add `owner_device_type: Mapped[Optional[str]] = mapped_column(String(40))` and `owner_device_id: Mapped[Optional[int]] = mapped_column(Integer)`
    - _Requirements: 3.1, 6.1, 6.2, 8.6, 9.3_
    - _Design: Data Model Changes (6B stencil_url, 6C polymorphic port ownership, Cable.label)_

  - [x] 1.2 Create `backend/alembic/versions/0006_ports_and_stencils.py`
    - Set `down_revision = "0005_site_redesign"`, follow the idempotent guarded style of `0005_site_redesign.py` (`inspect(...)`/column-existence checks)
    - Upgrade: add `stencil_url` to the three device-type tables (if absent); add `cables.label` (if absent); add `device_interfaces.owner_device_type` + `owner_device_id` (if absent); `alter_column` `device_interfaces.network_device_id` to nullable
    - Backfill: `UPDATE device_interfaces SET owner_device_type = 'network-devices', owner_device_id = network_device_id WHERE network_device_id IS NOT NULL AND owner_device_id IS NULL`
    - Downgrade: best-effort guarded drops of the new columns; restore `network_device_id` NOT NULL only if no NULLs exist
    - _Requirements: 6.3, 6.4_
    - _Design: Migration Plan — 0006_ports_and_stencils_

  - [ ]* 1.3 Write migration test for 0006 (`backend/tests/`)
    - Seed legacy `device_interfaces` rows with non-null `network_device_id`; apply migration; assert each row backfilled with `owner_device_type = "network-devices"` and `owner_device_id = network_device_id`
    - Assert `network_device_id` is now nullable and that re-running the migration is a no-op
    - _Requirements: 6.3, 6.4_
    - _Design: Testing Strategy — Migration test_

- [ ] 2. Cable_Label naming generator
  - [ ] 2.1 Implement and register `generate_cable` in `backend/app/naming.py`
    - Add `async def generate_cable(session, cable)` that sets `cable.label = f"{from_name}-{from_port}→{to_name}-{to_port}"`
    - Implement `_device_name` resolving a display name from the polymorphic (`port_*_type`, `port_*_id`) reference via `ENTITY_REGISTRY` (best of `vf_long_name` / `vf_short_name` / `name`)
    - Register `models.Cable: generate_cable` in the `GENERATORS` dispatch table so `crud.apply_naming` runs on create and update
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
    - _Design: Cable_Label Naming (naming.py)_

  - [ ]* 2.2 Write property test for Cable_Label formatting (`backend/tests/`)
    - **Property 4: Cable_Label formatting round-trip**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
    - ≥100 iterations; tag `Feature: rack-back-and-cabling, Property 4`

- [ ] 3. Stencil_Service backend
  - [ ] 3.1 Create `backend/app/stencils.py` helper
    - Ensure `backend/static/stencils/` exists on startup; validate `model_slug` against `^[a-z0-9]+(-[a-z0-9]+)*$` (path-traversal guard)
    - Cache path resolver `backend/static/stencils/{model_slug}.svg`; download-from-Visio_Cafe helper with short timeout that catches all connection errors (air-gap safe)
    - SVG validation helper (content type `image/svg+xml` or body beginning with `<svg` root)
    - _Requirements: 4.2, 4.4, 5.2_
    - _Design: Stencil_Cache layout; Error Handling_

  - [ ] 3.2 Add Stencil_Service endpoints to `backend/app/routers/special.py`
    - `GET /api/v1/stencils/{model_slug}`: cache-first (serve cached → else download via `stencil_url` if reachable → else 404); headers `Content-Type: image/svg+xml`, `Cache-Control: public, max-age=86400`
    - `POST /api/v1/stencils/{model_slug}`: `multipart/form-data` `file`; reject non-SVG with 400; store to cache overwriting; respond `{model_slug, stored, path}`
    - Ensure the router is registered before the generic catch-all in `main.py`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_
    - _Design: API Endpoint Contracts — 6B Stencil_Service_

  - [ ]* 3.3 Write endpoint tests for Stencil_Service (`backend/tests/`)
    - Cached hit serves file; cache miss + mocked reachable Visio_Cafe downloads/caches/serves; cache miss + mocked unreachable → 404; upload non-SVG → 400; upload then GET serves without outbound call (mock asserts none)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3_
    - _Design: Testing Strategy — Backend endpoint tests_

  - [ ]* 3.4 Write property test for stencil resolution (`backend/tests/`)
    - **Property 6: Stencil resolution is cache-first and air-gap safe**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.3**
    - ≥100 iterations; tag `Feature: rack-back-and-cabling, Property 6`

- [ ] 4. Port candidates endpoint
  - [ ] 4.1 Add `GET /api/v1/ports/candidates` to `backend/app/routers/special.py`
    - Query params `source_type`, `source_id`, `source_port_kind` (`interface`|`outlet`), `source_port_id`
    - Resolve the source port's owning device (Ownership rule), its rack (resolution rule A: device `rack_id` else matching `rack_units` (`device_table`,`device_id`); `PowerOutlet` uses its own `rack_id`), and its datacenter (resolution rule B: `datacenter_floor_id`→dc, else `room_id`→floor→dc)
    - Return every `DeviceInterface` and `PowerOutlet` owned by devices in the same rack or same datacenter, excluding the source port; apply the candidate-scoping fallback (no datacenter → same `site_id`; no site → same rack only) so placed racks never spuriously 404
    - Return 404 only when the source port cannot be located to any rack; response shape per design (`source`, `candidates[]` with `same_rack`, `port_type`, owner fields)
    - _Requirements: 6.4, 6.5, 8.2, 8.3, 8.7_
    - _Design: API Endpoint Contracts — 6C Port candidates; Physical-location resolution (rules A & B + fallback)_

  - [ ]* 4.2 Write endpoint tests for port candidates (`backend/tests/`)
    - Same-rack and same-datacenter ports appear; other-datacenter ports excluded; source port excluded; unresolvable source → 404
    - _Requirements: 8.2, 8.3, 8.7_
    - _Design: Testing Strategy — Backend endpoint tests_

  - [ ]* 4.3 Write property tests for candidate scope and ownership (`backend/tests/`)
    - **Property 2: Connect candidates are scoped and exclude the source** — **Validates: Requirements 8.2, 8.3, 8.7**
    - **Property 3: Port ownership resolution is deterministic** — **Validates: Requirements 6.1, 6.2, 6.4, 6.5**
    - ≥100 iterations each; tag `Feature: rack-back-and-cabling, Property {2,3}`

- [ ] 5. Cable creation validation on the generic CRUD path
  - [ ] 5.1 Add cable-type + self-connect validation invoked from the cable create path
    - Enforce `cable_type` ∈ {copper, fiber, power, patchcord, structured} → `422` on violation (lightweight guard, no enum migration)
    - Reject source port == destination port → `400`
    - Ensure the guard is invoked from the `POST /api/v1/cables` create path in `backend/app/crud.py` (or a hook wired into `create_item`) so changelog + naming still apply
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 11.1_
    - _Design: API Endpoint Contracts — 6C Cable creation; Error Handling_

  - [ ]* 5.2 Write endpoint tests for cable creation (`backend/tests/`)
    - A/B mapping correct; invalid `cable_type` → 422; source==destination → 400; changelog rows written for create/update/delete
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 11.1, 11.2, 11.3_
    - _Design: Testing Strategy — Backend endpoint tests_

  - [ ]* 5.3 Write property tests for cable mapping and auditing (`backend/tests/`)
    - **Property 5: Cable end mapping preserves source and destination** — **Validates: Requirements 8.4, 8.5, 8.6**
    - **Property 7: Cable operations are audited** — **Validates: Requirements 11.1, 11.2, 11.3**
    - ≥100 iterations each; tag `Feature: rack-back-and-cabling, Property {5,7}`

- [ ] 6. Checkpoint — backend complete
  - Ensure all backend tests pass, ask the user if questions arise.

- [ ] 7. Frontend API client additions
  - [ ] 7.1 Extend the `api` client in `frontend/src/api.ts`
    - Add `stencilUrl(modelSlug)` returning the `<image>` href, `uploadStencil(modelSlug, file)` (multipart POST), and `portCandidates(source)` (GET `/ports/candidates`)
    - _Requirements: 4.1, 5.1, 8.2, 8.3_
    - _Design: api.ts additions_

- [ ] 8. Dual-face rack diagram rendering
  - [ ] 8.1 Add face-aware rendering to `frontend/src/components/RackDiagramSVG.tsx`
    - New props `face: "front"|"back"`, `interfaces`, `outlets`, `stencilUrlByType?`, `onPortClick?`
    - `face="front"`: render rects, or `<image href={stencilHref}>` when the device type has a resolved stencil
    - `face="back"`: for each device resolved into the rack (resolution rule A), draw one Port_Connector_Dot per owned `DeviceInterface` and per `PowerOutlet`, colored copper→blue `#2563eb`, fiber→orange `#f97316`, power→yellow `#eab308`
    - Hover: `onMouseEnter` sets `hoveredPort` rendering an SVG `<title>`/floating text with the port label; `onMouseLeave` clears it; only while `face="back"`
    - Click a dot → `onPortClick(port)`
    - _Requirements: 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 6.6, 7.1, 7.2, 8.1_
    - _Design: Frontend Component Breakdown — 6A_

  - [ ] 8.2 Add Front/Back toggle and data fetching to `frontend/src/pages/RackView.tsx`
    - Add `const [face, setFace] = useState<"front"|"back">("front")` and a segmented Front/Back control above the diagram; toggle flips to the opposite value
    - Fetch `device-interfaces` and `power-outlets` via `api.list` alongside existing `racks`/`rack-units`; map each port to its owner (Ownership rule) then to a rack (resolution rule A) and index ports by `rack_id`
    - Pass `face`, `interfaces`, `outlets`, and `stencilUrlByType` into `RackDiagramSVG`; own Connect_Panel open state driven by `onPortClick`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1_
    - _Design: Frontend Component Breakdown — 6A; Port-to-Port Connect Flow_

- [ ] 9. StencilField admin component
  - [ ] 9.1 Create `frontend/src/components/StencilField.tsx`
    - URL input bound to `stencil_url`, persisted via `api.update("network-device-types", id, { stencil_url })` (and compute/storage variants)
    - SVG file picker that POSTs via `api.uploadStencil`; on success invalidate the relevant TanStack Query keys so the diagram re-fetches
    - Embed on the device-type detail/edit surface
    - _Requirements: 3.4, 5.1_
    - _Design: Frontend Component Breakdown — 6B StencilField_

- [ ] 10. ConnectPanel component
  - [ ] 10.1 Create `frontend/src/components/ConnectPanel.tsx`
    - Opened with the source port; call `api.portCandidates(source)`; render candidates grouped same-rack first then same-datacenter, each with owner name, port label, and Port_Type swatch
    - Select candidate + `cable_type` → `api.create("cables", body)` mapping source→A / destination→B with `label_a`/`label_b`; on success invalidate `["cables"]` and rack/port queries
    - Omit the source port from its own candidate list
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
    - _Design: Frontend Component Breakdown — 6C ConnectPanel_

- [ ] 11. CablesViewer page + navigation wiring
  - [ ] 11.1 Create `frontend/src/pages/CablesViewer.tsx` and wire route/nav
    - Render `EntityGrid` over `cables` with `from`/`to` columns derived from `label_a`/`label_b`
    - Rack filter and device filter dropdowns; a cable matches when either end's device is in the selected rack or matches the selected device; no filter → all cables
    - Add the route and navigation entry so the page is reachable
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
    - _Design: Frontend Component Breakdown — 6C CablesViewer_

- [ ]* 12. Frontend component tests (Vitest + Testing Library)
  - [ ]* 12.1 Test `RackView` and `RackDiagramSVG`
    - `RackView` renders a Front/Back toggle, defaults to front, flips on activation
    - `RackDiagramSVG` `face="back"` draws one dot per interface + outlet with correct color; `face="front"` draws no dots and uses `<image>` when a stencil is present, a rect otherwise; hovering a dot shows the label and moving away hides it
    - **Property 1: Back-face dot color matches port type** — **Validates: Requirements 2.3, 2.4, 2.5, 6.6**
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 6.6, 7.1, 7.2_
    - _Design: Testing Strategy — Frontend component tests_

  - [ ]* 12.2 Test `ConnectPanel` and `CablesViewer`
    - `ConnectPanel` lists candidates grouped by rack/datacenter and submits the correct A/B body
    - `CablesViewer` filters rows by rack and by device and shows all when unfiltered
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 10.1, 10.2, 10.3, 10.4_
    - _Design: Testing Strategy — Frontend component tests_

- [ ] 13. Final checkpoint — Ensure all tests pass
  - Ensure all backend and frontend tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (test-writing) and can be skipped for a faster MVP.
- Each task references specific requirement clauses and the design section it implements for traceability.
- Backend/schema foundations (waves 0–2) land before the frontend that depends on them (waves 3+).
- Property tests validate the design's seven Correctness Properties; unit/endpoint tests cover examples and edge cases.
- Cable writes stay on the generic CRUD route so changelog + naming apply automatically; only validation is added to the create path.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "3.1"] },
    { "id": 2, "tasks": ["1.3", "2.1", "3.2", "4.1"] },
    { "id": 3, "tasks": ["2.2", "3.3", "3.4", "4.2", "4.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "7.1"] },
    { "id": 5, "tasks": ["8.1", "9.1", "11.1"] },
    { "id": 6, "tasks": ["8.2", "10.1"] },
    { "id": 7, "tasks": ["12.1", "12.2"] }
  ]
}
```
