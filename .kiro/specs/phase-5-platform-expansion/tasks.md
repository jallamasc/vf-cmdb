# Implementation Plan: phase-5-platform-expansion

## Overview

Six sub-phases, each ending in a checkpoint. Sub-phase C (the generic entity
framework) is the load-bearing change; D/E/F build on its upload/field/
capability patterns rather than reinventing them.

## Tasks

### Sub-phase A — Critical Bug Fixes & CRUD Gaps

- [x] 1. Repository housekeeping — commit the existing uncommitted Phase 4 +
      Sub-phase E stencil-library work (~85 files) to the current branch
      before starting Phase 5.

- [x] 2. Fix `EntityGrid` save-triggered refetch race
  - [x] 2.1 Replace full `invalidateQueries` on cell save with an in-place
        `setQueryData` patch of the changed row in `frontend/src/components/EntityGrid.tsx`
    - _Requirements: 1.1, 1.2_
  - [x]* 2.2 Vitest reproducing the original race (edit cell A, begin editing
        cell B on the same row before A's save resolves, assert B survives)

- [x] 3. Wire `PatchPanel`/`PowerDevice` into the naming engine
  - [x] 3.1 Add generators to `backend/app/naming.py`'s dispatch table; call
        from `crud.py`'s create path
    - _Requirements: 2.1, 2.2_
  - [x]* 3.2 pytest asserting generated identifiers on creation

- [x] 4. Subnets CRUD
  - [x] 4.1 Replace `frontend/src/pages/Subnets.tsx`'s hand-written tables
        with `SimpleGridPage`/`EntityGrid` wired to `subnets-ipv4`/`subnets-ipv6`
    - _Requirements: 3.1, 3.2_
  - [x]* 4.2 Vitest for the new grid config; pytest confirming delete doesn't
        orphan referencing IP addresses

- [x] 5. Strict-privacy browser compatibility audit
  - [x] 5.1 Audit/harden CORS + cookie `SameSite` handling in `backend/app/main.py`
        and fetch credentials handling in `frontend/src/api.ts`
    - _Requirements: 4.1_
  - [x]* 5.2 Automated header assertions; document manual verification steps
        for the user's own hardened browser profile
    - _Requirements: 4.2_

- [x] 6. Checkpoint A — build + test verification.

### Sub-phase B — Navigation Defaults & Visual System

- [x] 7. Require drill-down before graphical views render
  - [x] 7.1 Gate diagram rendering behind a selection check in
        `PowerDeviceView.tsx`/`PatchPanelView.tsx`/`PortConfigView.tsx`; show
        an empty-state prompt otherwise
    - _Requirements: 5.1, 5.2_
  - [x]* 7.2 Vitest asserting no diagrams render pre-selection

- [x] 8. Install Lucide + navigation icons
  - [x] 8.1 `npm install lucide-react`; per-entry icons in `Layout.tsx`'s `NAV`
    - _Requirements: 6.1_
  - [x]* 8.2 Vitest confirming icon rendering per nav entry

- [x] 9. Device-type icons + animated active-status glyph
  - [x] 9.1 Icon metadata on existing device-type lookups; CSS pulse
        animation class for active devices
    - _Requirements: 6.2, 7.1_
  - [x]* 9.2 Vitest for icon/animation resolution

- [x] 10. Rack/Power diagram visual overhaul
  - [x] 10.1 Revise `RackDiagramSVG.tsx`/`PowerDiagramSVG.tsx` styling
        (consistent scale, occupied/empty coloring, hover tooltips, label
        alignment)
    - _Requirements: 8.1, 8.2_
  - [x]* 10.2 Vitest asserting tooltip content and styling hooks

- [x] 11. Region map
  - [x] 11.1 `npm install react-simple-maps`; new `RegionMap.tsx` embedded in
        `ReferenceData.tsx`'s Regions panel, click-to-filter into the grid
    - _Requirements: 9.1, 9.2_
  - [x]* 11.2 Vitest for render + filter interaction

- [x] 12. Country/region flags
  - [x] 12.1 `npm install flag-icons`; `CountryFlag.tsx` helper applied
        wherever a country/region code is rendered
    - _Requirements: 10.1_
  - [x]* 12.2 Vitest for code-to-class mapping

- [x] 13. Checkpoint B — build + test verification, present visual changes
      for browser confirmation.

### Sub-phase C — Generic Entity Framework

- [x] 14. `field_type_defs` table + seed
  - [x] 14.1 Model + migration + seed of 6 builtin storage kinds; registry entry
    - _Requirements: 11.1_
  - [x]* 14.2 pytest for seed presence + uniqueness

- [x] 15. Field type admin UI
  - [x] 15.1 Reference Data panel for `field-type-defs` CRUD via `EntityGrid`
    - _Requirements: 11.2_
  - [x]* 15.2 Vitest for the grid

- [x] 16. `entity_type_defs` table + capability model
  - [x] 16.1 Model (`slug`, `label`, `icon`, `capabilities` JSONB) + migration
        + registry entry
    - _Requirements: 12.1, 12.2_
  - [x]* 16.2 pytest CRUD + capability round-trip

- [x] 17. `entity_field_defs` table
  - [x] 17.1 Model + migration + registry entry; ordering by `sort_order`
    - _Requirements: 13.1, 13.2_
  - [x]* 17.2 pytest CRUD + ordering

- [x] 18. `generic_entities` table
  - [x] 18.1 Model (`attributes` JSONB + GIN index + capability relational
        hooks) + migration + registry entry
    - _Requirements: 14.1, 14.2_
  - [x]* 18.2 pytest CRUD + attribute round-trip

- [x] 19. Entity Type Builder UI
  - [x] 19.1 `frontend/src/pages/EntityTypeBuilder.tsx` tying 14–18 together:
        create/edit type, toggle capabilities, manage fields
    - _Requirements: 15.1_
  - [x]* 19.2 Vitest for the create-type-with-fields flow

- [x] 20. Generic dynamic grid + form
  - [x] 20.1 `frontend/src/pages/GenericEntityView.tsx` + `lib/genericColumns.tsx`
        mapping `storage_kind` -> column/editor; route `/entities/:typeSlug`
    - _Requirements: 16.1, 16.2_
  - [x]* 20.2 Vitest against a synthetic type definition (columns, edit, save)

- [x] 21. Capability integration — rack/power/network ports + cabling
  - [x] 21.1 Extend `ports.py`'s polymorphic resolution with a
        `generic_entities` branch; wire `RackSlotEditor`/`ConnectionDot`
        candidate logic
    - _Requirements: 17.1, 17.2, 17.3_
  - [x]* 21.2 pytest: a generic entity with rack_placement+network_ports
        capabilities places and cables exactly like a hardcoded device type

- [x] 22. Capability integration — photo + stencil diagram
  - [x] 22.1 New `PhotoField.tsx` + generic photo upload endpoint; reuse
        `StencilField.tsx`/`AnchorEditor.tsx` for `stencil_diagram`
    - _Requirements: 18.1, 18.2_
  - [x]* 22.2 pytest upload round-trip; Vitest for `PhotoField`

- [x] 23. Photo/graphic on existing hardcoded device types
  - [x] 23.1 Add `photo_url` to PhysicalServer/NetworkDevice/Workstation/
        PowerDevice/PatchPanel; reuse `PhotoField.tsx` in their pages
    - _Requirements: 19.1_
  - [x]* 23.2 pytest column + upload; Vitest field usage

- [x] 24. Registry-driven field visibility
  - [x] 24.1 `field_visibility_overrides` table + Reference Data panel;
        hardcoded grids consult overrides when building `ColDef[]`
    - _Requirements: 20.1, 20.2_
  - [x]* 24.2 pytest CRUD; Vitest confirming a hidden override removes a
        column live (e.g. NetworkDevices)

- [x] 25. Checkpoint C — full build + test verification, present for browser
      testing (highest-risk sub-phase).

### Sub-phase D — Depth Features

- [x] 26. Room hierarchy level + blueprint upload
  - [x] 26.1 `Room` model/migration/registry entry (nullable `room_id` on
        Rack); `blueprint_url` on Floor + Room; "Blueprint" tab rendering the
        uploaded image
    - _Requirements: 21.1, 21.2, 21.3_
  - [x]* 26.2 pytest for Room CRUD + nullable placement; Vitest for blueprint
        upload/display

- [x] 27. Section hierarchy level + blueprint upload
  - [x] 27.1 `Section` model/migration/registry entry (`room_id` required on
        Section; nullable `section_id` on Rack); `blueprint_url` on Section
    - _Requirements: 22.1, 22.2, 22.3_
  - [x]* 27.2 pytest for Section CRUD + exactly-one-parent enforcement

- [x] 28. Code Mode toggle for naming-engine fields
  - [x] 28.1 `naming_mode` column (auto/manual, default auto) on every
        naming-engine-backed table; `crud.py`'s naming dispatch only
        overwrites when `auto`; frontend toggle control
    - _Requirements: 23.1, 23.2, 23.3_
  - [x]* 28.2 pytest: manual mode preserves a hand-typed value across an
        unrelated update

- [x] 29. Fold stencils into device lists
  - [x] 29.1 Inline expandable stencil row-detail (reusing `StencilField.tsx`)
        in each device type's own grid; remove the standalone stencil page
    - _Requirements: 24.1, 24.2_
  - [x]* 29.2 Vitest for the expand-row stencil editing flow

- [x] 30. Hard city/airport validation
  - [x] 30.1 Extend `CityAirportField.tsx`/`AirportCellEditor.tsx`: require
        Country first, filter by country, block non-matching city unless an
        explicit override checkbox is checked
    - _Requirements: 25.1, 25.2, 25.3_
  - [x]* 30.2 Vitest: country filters suggestions; non-match blocked; override
        allows it through

- [x] 31. Checkpoint D — build + test verification.

### Sub-phase E — IP Assignment & Bitwarden

- [ ] 32. Dual IP assignment (usage + management)
  - [ ] 32.1 `management_ip_id` FK alongside the existing IP link; extend the
        device/Generic_Entity create flow to require both when
        `ip_assignment` is enabled
    - _Requirements: 26.1, 26.2_
  - [ ]* 32.2 pytest: creation without both IPs is rejected; both link
        correctly

- [ ] 33. Bitwarden Secrets Manager client
  - [ ] 33.1 `backend/app/bitwarden_client.py` wrapping `bitwarden-sdk`;
        config via `BW_ORGANIZATION_ID`/`BW_ACCESS_TOKEN`/`BW_PROJECT_ID`;
        `create_secret`/`get_secret`/`regenerate_secret` (no automatic delete)
    - _Requirements: 27.1, 27.2_
  - [ ]* 33.2 pytest against a mocked SDK client

- [ ] 34. Default admin credential per device
  - [ ] 34.1 Create-hook generating a password via `bitwarden_client.py`;
        store only `admin_username`/`bw_secret_id` on the record; reveal/
        regenerate endpoints; masked UI with reveal/regenerate actions
    - _Requirements: 28.1, 28.2, 28.3_
  - [ ]* 34.2 pytest for the create-hook and reveal/regenerate endpoints
        (mocked client)

- [ ] 35. Checkpoint E — build + test verification; flag that live Bitwarden
      verification needs the user's real Organization ID/Project ID/Access
      Token before it can be exercised end-to-end.

### Sub-phase F — Ansible Semaphore Deployment & Automation Module

- [ ] 36. Deploy Ansible Semaphore via Podman
  - [ ] 36.1 Add a `semaphore` service to `podman-compose.yml`
        (`semaphoreui/semaphore:latest`, SQLite backend, generated —
        not hardcoded — admin bootstrap env vars)
    - _Requirements: 29.1_
  - [ ]* 36.2 Live verification: container starts, UI reachable, API token
        can be generated

- [ ] 37. Semaphore API client
  - [ ] 37.1 `backend/app/semaphore_client.py` wrapping projects/inventories/
        environments/templates/tasks; config via `SEMAPHORE_URL`/
        `SEMAPHORE_API_TOKEN`
    - _Requirements: 29.2_
  - [ ]* 37.2 pytest against a mocked HTTP client

- [ ] 38. Three-way sync — device ↔ Bitwarden secret ↔ Semaphore inventory
  - [ ] 38.1 Extend the create/update/delete hooks (same insertion points as
        the Phase 4 cable-auto-sync and Task 34's credential hook) to
        upsert/remove a Semaphore inventory host, gated on `ansible_managed`
    - _Requirements: 30.1, 30.2, 30.3_
  - [ ]* 38.2 pytest with both clients mocked: create/update/delete produce
        the expected calls; a non-`ansible_managed` type produces none

- [ ] 39. Automation tab per device
  - [ ] 39.1 `frontend/src/components/AutomationTab.tsx` (sync status, launch
        job template, inline output/history, deep link to Semaphore); backend
        proxy endpoints for task-launch/task-output
    - _Requirements: 31.1, 31.2, 31.3_
  - [ ]* 39.2 pytest for the proxy endpoints (mocked); Vitest for the tab

- [ ] 40. Checkpoint F — final full build + test verification of the entire
      Phase 5 scope; present for browser testing.

## Notes

- Tasks marked `*` are optional (test-writing) and are still executed in this
  workflow, matching the Phase 4 precedent of always verifying against a live
  Postgres container.
- Every migration follows the guarded/idempotent style established in Phase 4.
- Sub-phase C is the highest-risk, highest-value sub-phase; its checkpoint
  (Task 25) is the natural point to pause for a deeper browser review if
  needed, though the default is to proceed straight through per the user's
  standing instruction.
- Sub-phase F's live behavior (Tasks 36–39) depends on a real Semaphore
  instance being reachable (Task 36) and, for full end-to-end credential
  flow, the user's real Bitwarden Organization/Project/Access Token (Task 33)
  — both are flagged at their respective checkpoints rather than assumed.
