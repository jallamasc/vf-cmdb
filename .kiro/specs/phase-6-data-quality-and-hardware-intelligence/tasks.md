# Implementation Plan: phase-6-data-quality-and-hardware-intelligence

## Overview

Twelve sub-phases, each ending in a checkpoint. Sub-phase C's icon/design
system and Sub-phase G's stencil dev-workflow fix are load-bearing for later
sub-phases that reuse them.

## Tasks

### Sub-phase A — Quick Independent Fixes

- [x] 1. VLANs site visibility
  - [x] 1.1 Site column + site filter on `frontend/src/pages/Vlans.tsx`
    - _Requirements: 1.1, 1.2_
  - [x]* 1.2 Vitest for the filter narrowing rows

- [x] 2. `notes` → `description` rename
  - [x] 2.1 Migration renaming the column on every `LookupMixin` table,
        `SiteAddress`, `FieldTypeDef` (also `EntityTypeDef`, same registry
        rationale); relabel every frontend reference
    - _Requirements: 2.1, 2.2_
  - [x]* 2.2 pytest round-trip on renamed tables; Vitest for relabeled columns

- [x] 3. Checkpoint A — build + test verification.

### Sub-phase B — Uniqueness Validation

- [x] 4. Reusable uniqueness validator
  - [x] 4.1 A generic per-parent-scoped, case-insensitive duplicate check in
        `crud.py`, returning a 409 with a "already exists — try a different
        value" style message
    - _Requirements: 3.1, 3.4_
  - [x]* 4.2 pytest against a representative model

- [x] 5. Apply to no-parent tables (every `LookupMixin` table, `RackType`,
      `EntityTypeDef.label`, `FieldTypeDef.label`) — table-wide scope
  - [x] 5.1 Wire each into `_validate_model` via the `UNIQUE_NAME_FIELDS` map
    - _Requirements: 3.1, 3.3_
  - [x]* 5.2 pytest duplicate-rejected/case-insensitive per table

- [x] 6. Apply to parent-scoped tables (Datacenter within Site, Floor within
      Datacenter, Room within Floor, Section within Room — Rack excluded,
      see design notes: no plain manual name field and three alternate
      parents)
  - [x] 6.1 Wire each into `_validate_model` via the same map
    - _Requirements: 3.1, 3.2_
  - [x]* 6.2 pytest same name allowed under different parents, rejected under
        the same parent
  - [x] 6.3 Fix "+ Add row" placeholder defaults that were fixed strings
        (Naming.tsx lookups, rack-types, field-type-defs, entity-type-defs) —
        randomize so a second click doesn't immediately 409 itself

- [x] 7. Frontend duplicate-name error surfacing
  - [x] 7.1 Already covered by `EntityGrid`'s existing `friendlyError`
        fallback (strips the "409: " prefix, backend message is already the
        suggest-a-change sentence) — no code change needed, added tests
    - _Requirements: 3.4_
  - [x]* 7.2 Vitest simulating both 409 message shapes

- [x] 8. Checkpoint B — build + test verification.

### Sub-phase C — Icons & Visual Design System

- [x] 9. Icon column migration
  - [x] 9.1 Add `icon` to every lookup table lacking one (also `rack_types`
        and `field_type_defs`)
    - _Requirements: 4.1_
  - [x]* 9.2 pytest column round-trip

- [x] 10. IconPicker component
  - [x] 10.1 Fuzzy-searchable, preview-showing Lucide icon picker
        (`frontend/src/components/IconPickerEditor.tsx`, catalogue in
        `frontend/src/lib/iconLibrary.ts`) + `iconCol()` helper; wired into
        every lookup grid, including the 4 device-type lookups (their old
        narrower allow-list is now a subset, `resolveDeviceTypeIcon`
        delegates to the wider catalogue so nothing regresses)
    - _Requirements: 4.2, 4.3_
  - [x]* 10.2 Vitest search-narrows/select-commits/live-preview

- [x] 11. Design system pass
  - [x] 11.1 Documented the column-order convention (`lib/columns.tsx`
        comment block) and a consistent amber/monospace visual treatment
        (`vf-generated-cell`/`vf-mode-toggle-cell`) for generated fields +
        Code_Mode toggles via `generatedCol()`/`modeToggleCol()`/updated
        `namingComputedCol()`; applied across Sites/SimpleGridPage/
        Hierarchy/PhysicalServers/Workstations/ContainersApps/
        DeviceDashboard
    - _Requirements: 5.1, 5.2_
  - [x]* 11.2 Vitest order/style assertions on representative grids

- [x] 12. Checkpoint C — build + test verification.

### Sub-phase D — Floor & Section Auto-Naming

- [ ] 13. Naming generators
  - [ ] 13.1 `generate_floor`/`generate_section` in `naming.py`'s dispatch
    - _Requirements: 6.1, 6.2_
  - [ ]* 13.2 pytest generated + sequential-fallback codes

- [ ] 14. Frontend read-only wiring
  - [ ] 14.1 Floor/Section code columns → `roCol` + Code_Mode toggle, styled
        per Task 11
    - _Requirements: 6.3_
  - [ ]* 14.2 Vitest read-only-unless-Code-Mode

- [ ] 15. Breadcrumb combination
  - [ ] 15.1 Room/Rack breadcrumb shows Floor+Section combined
    - _Requirements: 6.4_
  - [ ]* 15.2 Vitest breadcrumb string

- [ ] 16. Checkpoint D — build + test verification.

### Sub-phase E — Region Geo-Markers

- [ ] 17. Migration adding `latitude`/`longitude` to Region
    - _Requirements: 7.1_
  - [ ]* pytest round-trip

- [ ] 18. `RegionMap` markers
  - [ ] 18.1 Render a `<Marker>` per region with coordinates set
    - _Requirements: 7.2_
  - [ ]* 18.2 Vitest marker position

- [ ] 19. Click-to-place
  - [ ] 19.1 Projection-`invert()`-based click handler populating lat/lng
    - _Requirements: 7.3_
  - [ ]* 19.2 Vitest simulated click
  - [ ] 19.3 Checkpoint E — build + test verification.

### Sub-phase F — Theme + Code Coexistence

- [ ] 20. `SiteCodePanel` redesign
  - [ ] 20.1 Show code input + theme picker simultaneously everywhere
        `ThemeNamePicker` appears
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]* 20.2 Vitest both sections render/save independently

- [ ] 21. Checkpoint F — build + test verification.

### Sub-phase G — Stencil Pipeline: Dev Workflow & Vendor ZIPs

- [ ] 22. Containerized dev workflow
  - [ ] 22.1 Documented volume-mounted, `--reload`-capable container dev loop
        so `vss2svg-conv` works locally
    - _Requirements: 9.1_
  - [ ]* 22.2 Live verification: convert a real stencil through it

- [ ] 23. Vendor stencil ZIP source
  - [ ] 23.1 `VENDOR_STENCIL_SOURCES` registry + download/extract/cache-on-
        selection + list contained files into the existing convert pipeline
    - _Requirements: 9.2, 9.3_
  - [ ]* 23.2 pytest against a mocked ZIP download

- [ ] 24. Frontend vendor browsing UI
  - [ ] 24.1 Extend `StencilLibraryPicker.tsx` with vendor/product-line →
        file-inside-zip → existing preview/apply flow
    - _Requirements: 9.2_
  - [ ]* 24.2 Vitest for the new selector flow

- [ ] 25. Checkpoint G — build + test verification (incl. live containerized
      stencil conversion).

### Sub-phase H — Universal Stencil Override & Fallback Icons

- [ ] 26. Migration adding `stencil_url`/`stencil_url_back` to every
      hardcoded device/entity table lacking them
    - _Requirements: 10.1_
  - [ ]* pytest round-trip

- [ ] 27. Per-record override UI
  - [ ] 27.1 Reusable stencil-override control wired into `RackSlotEditor`'s
        click flow and each device page's selection panel
    - _Requirements: 10.2, 10.3, 10.4_
  - [ ]* 27.2 Vitest override-shown-and-falls-back-correctly

- [ ] 28. Diagram fallback icons
  - [ ] 28.1 Category-default Lucide icon fallback in Rack/Power/Patch-Panel
        diagrams when no stencil is set; `ConnectionDot` untouched
    - _Requirements: 11.1, 11.2_
  - [ ]* 28.2 Vitest fallback icon renders

- [ ] 29. Checkpoint H — build + test verification.

### Sub-phase I — External Data Seeding

- [ ] 30. `endoflife.date` sync
  - [ ] 30.1 Sync module fetching a defined product list, upserting
        OsFamily/OsVersion; seed-time + manual "Sync now" action
    - _Requirements: 12.1_
  - [ ]* 30.2 pytest against a mocked HTTP client

- [ ] 31. Curated hardware Brand seed list
  - [ ] 31.1 Research + seed ~25-30 well-known IT hardware vendors
    - _Requirements: 12.2_
  - [ ]* 31.2 pytest seed rows exist

- [ ] 32. Checkpoint I — build + test verification.

### Sub-phase J — Hardware Spec Detail Pages

- [ ] 33. Structured spec fields
  - [ ] 33.1 Category-appropriate spec columns (migration) on all 4
        device-type registries
    - _Requirements: 13.1_
  - [ ]* 33.2 pytest round-trip

- [ ] 34. Icecat client
  - [ ] 34.1 `backend/app/icecat_client.py` (brand+model lookup, `ICECAT_*`
        config, mirrors `bitwarden_client.py`'s shape)
    - _Requirements: 13.3_
  - [ ]* 34.2 pytest against a mocked HTTP client

- [ ] 35. Brave Search fallback client
  - [ ] 35.1 `backend/app/search_client.py` (`BRAVE_SEARCH_API_KEY` config)
    - _Requirements: 13.3_
  - [ ]* 35.2 pytest against a mocked HTTP client

- [ ] 36. Look-up-specs endpoint
  - [ ] 36.1 Icecat-then-Brave-Search proposed-values endpoint, per
        device-type row
    - _Requirements: 13.3_
  - [ ]* 36.2 pytest both paths

- [ ] 37. Frontend detail pages
  - [ ] 37.1 A detail page per device-type registry with spec fields + "Look
        up online" + confirm-before-save UI
    - _Requirements: 13.2, 13.3_
  - [ ]* 37.2 Vitest lookup-then-confirm flow

- [ ] 38. Ansible gather-facts wiring
  - [ ] 38.1 Semaphore template convention + ingestion endpoint updating
        specific fields for SSH-reachable `ansible_managed` records
    - _Requirements: 13.4_
  - [ ]* 38.2 pytest ingestion endpoint
  - [ ] 38.3 Checkpoint J — build + test verification.

### Sub-phase K — IP-to-Device Auto-Sync

- [ ] 39. IP auto-sync hook
  - [ ] 39.1 Enumerate IP-bearing fields per hardcoded device model; a
        `lifecycle_sync.py`-style hook upserting/removing a polymorphic
        IpAssignment row on create/update/delete
    - _Requirements: 14.1, 14.2_
  - [ ]* 39.2 pytest create/update/delete sync behavior

- [ ] 40. Checkpoint K — build + test verification.

### Sub-phase L — Final Checkpoint

- [ ] 41. Checkpoint L — final full build + test verification of the entire
      Phase 6 scope; present for browser testing.

## Notes

- Tasks marked `*` are optional (test-writing) and are still executed,
  matching every prior phase's precedent.
- Every migration follows the guarded/idempotent style established in
  Phase 4/5.
- External clients (endoflife.date, Icecat, Brave Search) must keep the app
  fully functional when unconfigured — same graceful-degradation bar as
  Bitwarden/Semaphore.
