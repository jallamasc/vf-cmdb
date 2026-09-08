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

- [x] 13. Naming generators
  - [x] 13.1 `generate_floor` (`{datacenter.code or DC{id}}-F{n}`, scoped to
        parent Datacenter) / `generate_section` (`S{n}`, scoped to parent
        Room) in `naming.py`'s dispatch; new `naming_mode` column (migration
        0027) on both tables since neither had one before
    - _Requirements: 6.1, 6.2_
  - [x]* 13.2 pytest generated + sequential-fallback codes + naming preview
        endpoint reports the real code

- [x] 14. Frontend Code Mode wiring
  - [x] 14.1 Neither table has an editable grid on Hierarchy.tsx (Quick Add
        forms only) — the equivalent Code_Mode control is a new
        "Auto-generate code (Code Mode)" checkbox on `FloorForm`/
        `SectionForm`, styled per Task 11's `vf-mode-toggle-cell`; unchecked
        reveals the manual `AbbrevField` + sends `naming_mode: "manual"`
    - _Requirements: 6.3_
  - [x]* 14.2 Vitest auto-omits-code / manual-reveals-field-and-sends-mode

- [x] 15. Breadcrumb combination
  - [x] 15.1 `RackView.tsx`'s breadcrumb now resolves Room too and appends
        the Floor+Section generated codes as one compact tag (e.g.
        "... / Room1 (DC1-F1 S1)")
    - _Requirements: 6.4_
  - [x]* 15.2 Vitest breadcrumb string (room-parented, section-parented,
        direct-floor no-regression, combined-code-tag)

- [x] 16. Checkpoint D — build + test verification.

### Sub-phase E — Region Geo-Markers

- [x] 17. Migration adding `latitude`/`longitude` to Region
    - _Requirements: 7.1_
  - [x]* pytest round-trip

- [x] 18. `RegionMap` markers
  - [x] 18.1 Render a `<Marker>` per region with coordinates set
    - _Requirements: 7.2_
  - [x]* 18.2 Vitest marker position

- [x] 19. Click-to-place
  - [x] 19.1 Projection-`invert()`-based click handler populating lat/lng
        (`ClickToPlaceLayer` using `useMapContext()`, wired via Naming.tsx's
        new "Set location on map" button for the selected Region row)
    - _Requirements: 7.3_
  - [x]* 19.2 Vitest simulated click (real projection math, mocked
        `getBoundingClientRect`)
  - [x] 19.3 Checkpoint E — build + test verification.

### Sub-phase F — Theme + Code Coexistence

- [x] 20. `SiteCodePanel` redesign
  - [x] 20.1 Show code input + theme picker simultaneously everywhere
        `ThemeNamePicker` appears
    - _Requirements: 8.1, 8.2, 8.3_
  - [x]* 20.2 Vitest both sections render/save independently

- [x] 21. Checkpoint F — build + test verification.

### Sub-phase G — Stencil Pipeline: Dev Workflow & Vendor ZIPs

- [x] 22. Containerized dev workflow
  - [x] 22.1 Documented volume-mounted, `--reload`-capable container dev loop
        so `vss2svg-conv` works locally
    - _Requirements: 9.1_
  - [x]* 22.2 Live verification: convert a real stencil through it

- [x] 23. Vendor stencil ZIP source
  - [x] 23.1 `VENDOR_STENCIL_SOURCES` registry + download/extract/cache-on-
        selection + list contained files into the existing convert pipeline
    - _Requirements: 9.2, 9.3_
  - [x]* 23.2 pytest against a mocked ZIP download

- [x] 24. Frontend vendor browsing UI
  - [x] 24.1 Extend `StencilLibraryPicker.tsx` with vendor/product-line →
        file-inside-zip → existing preview/apply flow
    - _Requirements: 9.2_
  - [x]* 24.2 Vitest for the new selector flow

- [x] 25. Checkpoint G — build + test verification (incl. live containerized
      stencil conversion).

### Sub-phase H — Universal Stencil Override & Fallback Icons

- [x] 26. Migration adding `stencil_url`/`stencil_url_back` to every
      hardcoded device/entity table lacking them
    - _Requirements: 10.1_
  - [x]* pytest round-trip

- [x] 27. Per-record override UI
  - [x] 27.1 Reusable stencil-override control wired into `RackSlotEditor`'s
        click flow and each device page's selection panel
    - _Requirements: 10.2, 10.3, 10.4_
  - [x]* 27.2 Vitest override-shown-and-falls-back-correctly

- [x] 28. Diagram fallback icons
  - [x] 28.1 Category-default Lucide icon fallback in Rack/Power/Patch-Panel
        diagrams when no stencil is set; `ConnectionDot` untouched
    - _Requirements: 11.1, 11.2_
  - [x]* 28.2 Vitest fallback icon renders

- [x] 29. Checkpoint H — build + test verification.

### Sub-phase I — External Data Seeding

- [x] 30. `endoflife.date` sync
  - [x] 30.1 Sync module fetching a defined product list, upserting
        OsFamily/OsVersion; seed-time + manual "Sync now" action
    - _Requirements: 12.1_
  - [x]* 30.2 pytest against a mocked HTTP client

- [x] 31. Curated hardware Brand seed list
  - [x] 31.1 Research + seed ~25-30 well-known IT hardware vendors
    - _Requirements: 12.2_
  - [x]* 31.2 pytest seed rows exist

- [x] 32. Checkpoint I — build + test verification.

### Sub-phase J — Hardware Spec Detail Pages

- [x] 33. Structured spec fields
  - [x] 33.1 Category-appropriate spec columns (migration) on all 4
        device-type registries
    - _Requirements: 13.1_
  - [x]* 33.2 pytest round-trip

- [x] 34. Icecat client
  - [x] 34.1 `backend/app/icecat_client.py` (brand+model lookup, `ICECAT_*`
        config, mirrors `bitwarden_client.py`'s shape)
    - _Requirements: 13.3_
  - [x]* 34.2 pytest against a mocked HTTP client

- [x] 35. Brave Search fallback client
  - [x] 35.1 `backend/app/search_client.py` (`BRAVE_SEARCH_API_KEY` config)
    - _Requirements: 13.3_
  - [x]* 35.2 pytest against a mocked HTTP client

- [x] 36. Look-up-specs endpoint
  - [x] 36.1 Icecat-then-Brave-Search proposed-values endpoint, per
        device-type row
    - _Requirements: 13.3_
  - [x]* 36.2 pytest both paths

- [x] 37. Frontend detail pages
  - [x] 37.1 A detail page per device-type registry with spec fields + "Look
        up online" + confirm-before-save UI
    - _Requirements: 13.2, 13.3_
  - [x]* 37.2 Vitest lookup-then-confirm flow

- [x] 38. Ansible gather-facts wiring
  - [x] 38.1 Semaphore template convention + ingestion endpoint updating
        specific fields for SSH-reachable `ansible_managed` records
    - _Requirements: 13.4_
  - [x]* 38.2 pytest ingestion endpoint
  - [x] 38.3 Checkpoint J — build + test verification.

### Sub-phase K — IP-to-Device Auto-Sync

- [x] 39. IP auto-sync hook
  - [x] 39.1 Enumerate IP-bearing fields per hardcoded device model; a
        `lifecycle_sync.py`-style hook upserting/removing a polymorphic
        IpAssignment row on create/update/delete
    - _Requirements: 14.1, 14.2_
  - [x]* 39.2 pytest create/update/delete sync behavior

- [x] 40. Checkpoint K — build + test verification.

### Sub-phase L — Final Checkpoint

- [x] 41. Checkpoint L — final full build + test verification of the entire
      Phase 6 scope; present for browser testing.

## Notes

- Tasks marked `*` are optional (test-writing) and are still executed,
  matching every prior phase's precedent.
- Every migration follows the guarded/idempotent style established in
  Phase 4/5.
- External clients (endoflife.date, Icecat, Brave Search) must keep the app
  fully functional when unconfigured — same graceful-degradation bar as
  Bitwarden/Semaphore.
