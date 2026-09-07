# Requirements Document

## Introduction

Phase 6 addresses 16 gaps surfaced by real browser testing of Phase 5 (post
HEAD `86e1ab1`), across twelve sequential sub-phases: (A) two quick
independent fixes, (B) a uniqueness-validation framework, (C) a global icon
system plus a documented visual design pass, (D) Floor/Section auto-naming,
(E) region geo-markers, (F) Site theme+code coexistence, (G) a stencil
pipeline overhaul (containerized dev workflow + curated vendor ZIP browsing),
(H) a universal per-record stencil override plus diagram fallback icons, (I)
external data seeding for OS/hardware lookups, (J) hardware spec detail pages
enriched via Icecat/Brave Search/Ansible, (K) automatic IP-to-device sync into
IP Assignments, and (L) a final checkpoint.

## Glossary

- **Lookup_Mixin_Table**: any reference/registry table backed by the shared
  `LookupMixin` (organizations, clouds, regions, campuses, buildings,
  floor-sections, network/compute/storage/power device types, os-families,
  os-versions, brands, device-roles, cluster-types, app-types, etc.).
- **Uniqueness_Rule**: a case-insensitive duplicate check on a table's
  human-facing name field, scoped to its natural parent FK when one exists,
  else table-wide.
- **Icon_Picker**: a reusable fuzzy-search-with-preview control for choosing a
  Lucide icon, opened via a chevron button.
- **Code_Mode**: the existing per-field toggle (Phase 5 Task 28) that keeps a
  naming-engine-computed field read-only unless explicitly overridden.
- **Vendor_Stencil_Source**: a curated registry mapping a vendor + product
  line to a verified downloadable ZIP of Visio stencils, resolved and cached
  only when a user selects that specific entry (never bulk pre-fetched).
- **Stencil_Override**: an optional per-record `stencil_url`/`stencil_url_back`
  pair that takes precedence over the owning device-type's own stencil.
- **Hardware_Spec_Lookup**: the Icecat-then-Brave-Search fallback chain used to
  propose (never silently save) structured spec values for a device-type row.
- **Gather_Facts_Sync**: the separate mechanism that ingests real Ansible
  facts (via a Semaphore template) into specific fields of an SSH-reachable
  `ansible_managed` record.

## Requirements

### Requirement 1: VLAN Site Visibility

**User Story:** As an operator, I want to see which site's VLANs I'm looking
at, so that the VLANs view isn't ambiguous across multiple sites.

#### Acceptance Criteria

1. THE Vlans_View SHALL display each VLAN row's owning site.
2. THE Vlans_View SHALL let an operator filter the grid to one site at a time.

### Requirement 2: Description Replaces Notes

**User Story:** As an administrator, I want registries to have a
"Description" field instead of "Notes", so that terminology is consistent
and clearer.

#### Acceptance Criteria

1. THE system SHALL rename the `notes` column to `description` on every
   `Lookup_Mixin_Table`, `SiteAddress`, and `FieldTypeDef`.
2. THE frontend SHALL label the renamed column "Description" everywhere it
   appears.

### Requirement 3: Universal Name Uniqueness

**User Story:** As an administrator, I want the system to stop me from
creating a duplicate name, so that I don't end up with two "Virtualfactor"
Organizations by mistake.

#### Acceptance Criteria

1. WHEN a record's human-facing name field is created or updated, THE system
   SHALL reject a case-insensitive duplicate against existing records,
   regardless of whether the conflicting value was entered manually or
   produced by the Naming_Engine.
2. WHEN the record's table has a natural parent FK, THE Uniqueness_Rule SHALL
   be scoped to that parent (the same name may exist under a different
   parent).
3. WHEN the record's table has no natural parent, THE Uniqueness_Rule SHALL
   be scoped to the whole table.
4. WHEN a duplicate is rejected, THE system SHALL return a message that
   suggests changing the value, not just a bare conflict code.

### Requirement 4: Global Icon System

**User Story:** As an administrator, I want every registry to show an icon I
can pick, so that lists are visually scannable and consistent.

#### Acceptance Criteria

1. THE system SHALL add an `icon` column to every `Lookup_Mixin_Table` that
   doesn't already have one.
2. THE frontend SHALL offer an Icon_Picker (chevron-triggered, fuzzy-searchable,
   with a live preview of each candidate) on every registry grid's icon
   column.
3. THE Icon_Picker SHALL be backed by the existing bundled Lucide icon set
   (no new runtime dependency on an external icon service).

### Requirement 5: Consistent Grid Design

**User Story:** As an operator, I want every grid to order its columns the
same logical way and to visually recognize generated/locked fields at a
glance, so that I don't miss a control because it's in a random spot.

#### Acceptance Criteria

1. THE system SHALL define one column-ordering convention (identifier →
   primary generated/name fields → other identifiers → relational fields →
   description → audit timestamps) and apply it to every registry grid.
2. THE frontend SHALL give naming-engine-generated/read-only fields and the
   Code_Mode toggle a consistent, distinct visual treatment (color + typeface)
   applied the same way in every grid that has them.

### Requirement 6: Floor & Section Auto-Naming

**User Story:** As an operator, I want a Floor and Section to get a real
generated code when created, so that I don't have to invent "F1"/"S1" myself
and so it can't drift from the naming convention.

#### Acceptance Criteria

1. WHEN a DatacenterFloor is created, THE Naming_Engine SHALL generate a
   sequential `F{n}` code scoped to its parent Datacenter.
2. WHEN a Section is created, THE Naming_Engine SHALL generate a sequential
   `S{n}` code scoped to its parent Room.
3. THE generated Floor/Section code fields SHALL be read-only unless
   Code_Mode is explicitly enabled for that field, matching every other
   naming-engine field.
4. THE Room/Rack breadcrumb SHALL display the Floor and Section codes
   combined (e.g. "F1 S1").

### Requirement 7: Region Geo-Markers

**User Story:** As an administrator, I want to see each Region plotted at its
real approximate location on the map, and to set that location by clicking,
so that the map is actually useful for finding a region.

#### Acceptance Criteria

1. THE Region model SHALL store an optional `latitude`/`longitude` pair.
2. THE Region_Map SHALL render a marker at each Region's coordinates when set.
3. WHEN creating or editing a Region, THE system SHALL let an operator click a
   point on the map to populate its `latitude`/`longitude`.

### Requirement 8: Theme + Code Coexistence

**User Story:** As an administrator, I want to set both a normal code and a
theme-based name on a Site at the same time, so that I'm not forced to choose
one.

#### Acceptance Criteria

1. THE Site_Code_Panel SHALL display the code input and the theme-name picker
   simultaneously, not as mutually exclusive modes.
2. THE system SHALL persist and display both values together regardless of
   which was most recently changed.
3. Any other view offering theme-based naming SHALL apply the same
   simultaneous, non-exclusive presentation.

### Requirement 9: Stencil Pipeline — Local Dev & Vendor Browsing

**User Story:** As a developer, I want stencil conversion to work in local
testing, and as an administrator, I want to pull a vendor's real stencils on
demand, so that the stencil library isn't limited to one hand-picked GitHub
repo and an empty VisioCafe stub.

#### Acceptance Criteria

1. THE documented local development workflow SHALL run the backend inside
   the container image that has `vss2svg-conv` built, so stencil conversion
   works during local testing without a 503.
2. THE system SHALL offer a Vendor_Stencil_Source: selecting a vendor +
   product line SHALL download and cache only that entry's ZIP, extract it,
   and list its `.vss`/`.vssx` files for the existing preview/convert flow.
3. THE system SHALL NOT bulk pre-fetch any vendor's full catalogue ahead of an
   explicit selection.

### Requirement 10: Universal Per-Record Stencil Override

**User Story:** As an operator, I want to pick a different stencil for one
specific device than its type's default, so that an unusual unit looks right
in diagrams without changing every device of that type.

#### Acceptance Criteria

1. THE system SHALL add an optional stencil override (front + back) to every
   hardcoded device/entity table that can be stored in the CMDB.
2. WHEN a Stencil_Override is set on a record, diagrams SHALL render it in
   place of the owning device-type's stencil.
3. THE Rack_View SHALL let an operator open the stencil picker for a specific
   device instance directly from clicking it in the diagram.
4. Each device's own page SHALL also expose the same per-record stencil
   override control.

### Requirement 11: Diagram Fallback Icons

**User Story:** As an operator, I want diagrams to show a meaningful icon
instead of a plain colored rectangle when no stencil is configured, so that
racks and power/patch-panel views look like real equipment.

#### Acceptance Criteria

1. WHEN neither a Stencil_Override nor a device-type stencil is available,
   Rack/Power/Patch-Panel diagrams SHALL render a category-appropriate default
   icon instead of a bare rectangle.
2. THE existing connection-dot positioning mechanism SHALL be unaffected by
   this change.

### Requirement 12: External Data Seeding — OS & Hardware

**User Story:** As an administrator, I don't want to hand-type OS versions or
hardware brands, so that this reference data stays accurate without manual
upkeep.

#### Acceptance Criteria

1. THE system SHALL populate OsFamily/OsVersion rows from `endoflife.date`'s
   public API for a defined set of products, at seed time and via a manual
   "Sync now" action.
2. THE system SHALL populate Brand rows from a curated, hand-verified list of
   well-known IT hardware vendors.

### Requirement 13: Hardware Spec Detail Pages

**User Story:** As an operator, I want a device-type's page to show its real
specs (e.g. a UPS's max capacity and output count), so that I don't have to
look them up elsewhere.

#### Acceptance Criteria

1. THE system SHALL add category-appropriate structured spec fields to all
   four device-type registries (network, compute, storage, power).
2. THE system SHALL provide a detail page per device-type row showing those
   fields.
3. WHEN an operator requests a lookup by brand + model, THE Hardware_Spec_Lookup
   SHALL query Icecat first, fall back to a Brave Search result (links and
   snippets, not auto-parsed values) when Icecat has no or incomplete data,
   and SHALL always require operator confirmation before saving any proposed
   value.
4. For device types reachable over SSH under the `ansible_managed`
   Capability, THE Gather_Facts_Sync SHALL separately populate real runtime
   fields from Ansible facts, independent of the Icecat/Brave path.

### Requirement 14: IP-to-Device Auto-Sync

**User Story:** As an operator, I want an IP I set directly on a device to
show up in IP Assignments automatically, so that the two views never
disagree.

#### Acceptance Criteria

1. WHEN any IP-bearing field on a device record is set, changed, or cleared,
   THE system SHALL create, update, or remove a matching polymorphic
   IpAssignment row accordingly.
2. THIS SHALL apply to every IP-bearing field on every hardcoded device model.

## Non-Functional Notes

- Every migration follows the existing guarded/idempotent style.
- Every new external-data client (endoflife.date, Icecat, Brave Search)
  follows the established `*_client.py` shape: a `*NotConfigured` exception,
  an injectable HTTP client for tests, and an `lru_cache` singleton getter.
- No feature in this phase may regress graceful degradation: the app must
  keep working with any/all of these external integrations unconfigured.
