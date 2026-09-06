# Requirements Document

## Introduction

Phase 5 extends the Virtualfactor IT CMDB (post Phase 4, HEAD `2174619`)
across six sequential sub-phases: (A) critical bug fixes and CRUD gaps
surfaced by real usage, (B) navigation defaults and a visual identity system,
(C) a reference-data-driven generic entity framework so new asset types can
be defined without code changes, (D) depth features built on that framework
(location hierarchy, computed-field control, inline stencils, stricter
validation), (E) per-device IP assignment and Bitwarden-backed credential
storage, and (F) an Ansible Semaphore deployment with a three-way sync
between devices, stored credentials, and automation inventory.

## Glossary

- **Entity_Type_Def**: an admin-defined record describing a kind of managed
  asset (built-in or user-created) — its label, icon, and enabled
  Capabilities.
- **Capability**: a toggleable integration an Entity_Type_Def may opt into:
  `rack_placement`, `power_ports`, `network_ports`, `ip_assignment`,
  `ansible_managed`, `cabling`, `photo`, `stencil_diagram`, `blueprint`.
- **Entity_Field_Def**: an admin-defined field belonging to an Entity_Type_Def
  — key, label, Field_Type_Def reference, required flag, sort order.
- **Field_Type_Def**: a named field type backed by one of a fixed set of
  storage kinds (text, number, boolean, date, reference, file). Built-in kinds
  are seeded; administrators may define additional named types atop the same
  storage kinds.
- **Generic_Entity**: a data row for a given Entity_Type_Def, storing its
  custom field values in a JSONB `attributes` column plus the relational hooks
  needed by its enabled Capabilities (e.g. `rack_id`/`rack_unit`).
- **Field_Visibility_Override**: an admin-managed record hiding or showing a
  specific field/column on a hardcoded (non-generic) entity's grid.
- **Naming_Mode**: a per-record `auto`/`manual` flag controlling whether a
  naming-engine-computed field is recomputed on save (`auto`) or preserved as
  freely typed (`manual`).
- **Secrets_Client**: the backend wrapper around Bitwarden's Secrets Manager
  SDK, scoped to one Project holding vf-cmdb-managed credentials.
- **Automation_Client**: the backend wrapper around the Ansible Semaphore REST
  API (projects, inventories, environments, templates, tasks).
- **Lifecycle_Sync_Service**: the crud.py hook that keeps a device/Generic_Entity
  with the `ansible_managed` Capability, its Secrets_Client credential, and its
  Automation_Client inventory host entry consistent on create/update/delete.

## Requirements

### Requirement 1: Grid Edit Integrity

**User Story:** As an operator, I want a value I'm typing into one cell to
survive an unrelated save elsewhere on the same row, so that editing a Patch
Panel/Power Device row doesn't silently lose my input.

#### Acceptance Criteria

1. WHEN a cell edit is saved successfully, THE Entity_Grid SHALL update only
   that row's cached data rather than replacing the entire grid's row data.
2. WHILE another cell on the same row is actively being edited, THE Entity_Grid
   SHALL NOT discard that in-progress edit as a side effect of an unrelated
   cell's save completing.

### Requirement 2: Patch Panel / Power Device Auto-Naming

**User Story:** As an operator, I want a Patch Panel or Power Device to get a
real identifier when I create it, so that the field isn't permanently blank.

#### Acceptance Criteria

1. WHEN a Patch_Panel is created, THE Naming_Engine SHALL populate its
   identifier field with a generated value.
2. WHEN a Power_Device is created, THE Naming_Engine SHALL populate its
   identifier field with a generated value.

### Requirement 3: Subnets CRUD

**User Story:** As an operator, I want to add, edit, and delete subnets from
the Subnets page, so that it isn't a read-only dead end.

#### Acceptance Criteria

1. THE Subnets_View SHALL render its IPv4 and IPv6 tables using the
   Entity_Grid CRUD pattern.
2. WHEN the operator adds, edits, or deletes a subnet row, THE Subnets_View
   SHALL persist that change through the existing subnet CRUD endpoints.

### Requirement 4: Strict-Privacy Browser Compatibility

**User Story:** As an operator using a hardened browser configuration, I want
the app to function normally, so that stricter privacy settings don't break
core workflows.

#### Acceptance Criteria

1. THE Backend SHALL set explicit, correct `SameSite` and CORS credential
   headers on every response.
2. WHEN the operator confirms behavior in their own hardened browser profile,
   IF an issue remains, THEN the Backend/Frontend SHALL be adjusted based on
   that concrete report.

### Requirement 5: Graphical View Drill-Down Gating

**User Story:** As an operator, I want a graphical view to prompt me to
choose a location/device first, so that I'm not shown every device in the
organization at once.

#### Acceptance Criteria

1. WHEN a graphical view (Power_Device_View, Patch_Panel_View, Port_Config_View)
   is opened with no Breadcrumb_Nav selection at or below Rack level, THE view
   SHALL render a selection prompt instead of any diagram.
2. WHEN the operator narrows the Breadcrumb_Nav to a rack or device, THE view
   SHALL render the corresponding diagram(s).

### Requirement 6: Iconography

**User Story:** As an operator, I want icons in the navigation and lists, so
that the app is visually navigable, not all text.

#### Acceptance Criteria

1. THE Left_Navigation SHALL render an icon next to every entry.
2. THE Entity_Type_Def and hardcoded Device_Type_Lookup rows SHALL support an
   associated icon rendered in their respective grids/headers.

### Requirement 7: Device-Type Icons and Active Status Indicator

**User Story:** As an operator, I want a device's icon to subtly indicate
when it's active, so that status is visible at a glance.

#### Acceptance Criteria

1. WHEN a device row is flagged active, THE device icon SHALL render with an
   animated indicator distinguishing it from an inactive device's icon.

### Requirement 8: Rack/Power Diagram Visual Quality

**User Story:** As an operator, I want the rack and power diagrams to look
clean and readable, so that I can tell devices apart at a glance.

#### Acceptance Criteria

1. THE Rack_Diagram and Power_Diagram SHALL render occupied and empty slots
   with visually distinct, consistent styling.
2. WHEN the operator hovers a slot or outlet, THE diagram SHALL show the
   device/connection name in a tooltip.

### Requirement 9: Region Map

**User Story:** As an operator, I want a map of the seeded regions, so that I
can browse them geographically.

#### Acceptance Criteria

1. THE Reference_Data_View's Regions panel SHALL render a map highlighting
   the seeded region set.
2. WHEN the operator clicks a region on the map, THE Regions grid SHALL
   narrow to that region.

### Requirement 10: Country/Region Flags

**User Story:** As an operator, I want to see a country's flag next to its
code, so that countries are easier to recognize than a bare ISO code.

#### Acceptance Criteria

1. WHEREVER a country/region code is rendered in the UI, THE app SHALL render
   the corresponding flag alongside it.

### Requirement 11: Field Type Registry

**User Story:** As an administrator, I want to define new named field types,
so that Entity_Field_Defs aren't limited to a fixed built-in list.

#### Acceptance Criteria

1. THE Field_Type_Def store SHALL be seeded with built-in types covering
   text, number, boolean, date, reference, and file storage kinds.
2. THE Reference_Data_View SHALL let the administrator create a new
   Field_Type_Def naming one of the existing storage kinds.

### Requirement 12: Entity Type Definition and Capabilities

**User Story:** As an administrator, I want to define a new kind of managed
asset and choose which built-in integrations it participates in, so that not
every asset type needs every capability (e.g. a monitor isn't Ansible-managed).

#### Acceptance Criteria

1. THE administrator SHALL be able to create an Entity_Type_Def with a label,
   icon, and an explicit set of enabled Capabilities.
2. THE administrator SHALL be able to enable or disable any Capability on an
   Entity_Type_Def independently of the others.

### Requirement 13: Entity Field Definitions

**User Story:** As an administrator, I want to define the custom fields an
Entity_Type_Def has, so that each asset type captures the data relevant to it.

#### Acceptance Criteria

1. THE administrator SHALL be able to add, reorder, and remove
   Entity_Field_Defs on an Entity_Type_Def, each referencing a Field_Type_Def.
2. THE administrator SHALL be able to mark an Entity_Field_Def required.

### Requirement 14: Generic Entity Records

**User Story:** As an operator, I want to create, edit, and delete records of
an admin-defined Entity_Type_Def, so that custom asset types are fully
manageable, not just definable.

#### Acceptance Criteria

1. THE Generic_Entity store SHALL persist one row per record with its custom
   field values in an `attributes` JSONB column.
2. WHEN a Generic_Entity's Entity_Type_Def enables `rack_placement`, THE
   Generic_Entity row SHALL support a rack/unit assignment via the same
   relational hooks the hardcoded device types use.

### Requirement 15: Entity Type Builder UI

**User Story:** As an administrator, I want one screen to define an
Entity_Type_Def, its Capabilities, and its fields, so that I don't need
multiple disconnected admin screens.

#### Acceptance Criteria

1. THE Entity_Type_Builder SHALL let the administrator create/edit an
   Entity_Type_Def, toggle its Capabilities, and manage its Entity_Field_Defs
   in one workflow.

### Requirement 16: Generic Entity Grid and Form

**User Story:** As an operator, I want to manage records of any admin-defined
type through a normal grid, so that custom types feel like first-class
sections of the app.

#### Acceptance Criteria

1. FOR ANY Entity_Type_Def, THE Generic_Entity_View SHALL render a grid whose
   columns and cell editors are derived entirely from that type's
   Entity_Field_Defs.
2. WHEN the operator adds, edits, or deletes a Generic_Entity row, THE
   Generic_Entity_View SHALL persist that change through the generic CRUD
   endpoints.

### Requirement 17: Capability Integration — Placement, Ports, Cabling

**User Story:** As an operator, I want a custom asset type with rack/power/
network capabilities to behave exactly like a built-in device type in the
rack, power, and cabling views, so that custom types aren't second-class.

#### Acceptance Criteria

1. WHEN a Generic_Entity's Entity_Type_Def enables `rack_placement`, THE
   Rack_Diagram SHALL render that Generic_Entity the same way it renders a
   hardcoded device.
2. WHEN a Generic_Entity's Entity_Type_Def enables `power_ports` or
   `network_ports`, THE corresponding graphical view SHALL render its ports as
   Connection_Dots.
3. WHEN a Generic_Entity's Entity_Type_Def enables `cabling`, THE operator
   SHALL be able to create/edit/remove Cable connections on its ports.

### Requirement 18: Capability Integration — Photo and Stencil

**User Story:** As an operator, I want a custom asset type with photo/stencil
capabilities to support the same upload and anchor workflows as built-in
device types.

#### Acceptance Criteria

1. WHEN a Generic_Entity's Entity_Type_Def enables `photo`, THE operator SHALL
   be able to upload and view a photo on that Generic_Entity.
2. WHEN a Generic_Entity's Entity_Type_Def enables `stencil_diagram`, THE
   operator SHALL be able to manage its stencil and anchors using the existing
   Stencil_Field/Anchor_Editor components.

### Requirement 19: Photo on Hardcoded Device Types

**User Story:** As an operator, I want to attach a photo to any physical
device, including the built-in types, so that hardware is visually
identifiable.

#### Acceptance Criteria

1. THE PhysicalServer, NetworkDevice, Workstation, PowerDevice, and PatchPanel
   records SHALL support an uploaded photo.

### Requirement 20: Registry-Driven Field Visibility

**User Story:** As an administrator, I want to control which fields/columns
appear on a hardcoded entity's grid from Reference Data, so that I'm not
dependent on a code change to hide/show a field.

#### Acceptance Criteria

1. THE administrator SHALL be able to create a Field_Visibility_Override
   hiding or showing a named field on a named hardcoded entity's grid.
2. WHEN a Field_Visibility_Override hides a field, THE corresponding grid
   SHALL NOT render that field's column.

### Requirement 21: Room Hierarchy Level

**User Story:** As an operator, I want an optional Room level between Floor
and Rack, so that I can organize racks below the floor level when needed.

#### Acceptance Criteria

1. THE Location_Hierarchy SHALL support an optional Room belonging to a
   Floor.
2. A Rack SHALL be assignable to a Floor directly or to a Room, but not both.
3. THE Floor and Room records SHALL support an uploaded blueprint image.

### Requirement 22: Section Hierarchy Level

**User Story:** As an operator, I want an optional Section level within a
Room, so that I can subdivide a room further when needed.

#### Acceptance Criteria

1. THE Location_Hierarchy SHALL support an optional Section belonging to a
   Room.
2. A Rack SHALL be assignable to a Floor, a Room, or a Section, but only one
   of the three.
3. THE Section record SHALL support an uploaded blueprint image.

### Requirement 23: Naming Code Mode

**User Story:** As an operator, I want to switch a computed naming field to
manual entry when needed, so that I'm not forced to accept the generated
value.

#### Acceptance Criteria

1. EVERY naming-engine-computed field SHALL expose a Naming_Mode of `auto` or
   `manual`, defaulting to `auto`.
2. WHILE a record's Naming_Mode is `manual`, THE Naming_Engine SHALL NOT
   overwrite that field's value on save.
3. WHILE a record's Naming_Mode is `auto`, THE Naming_Engine SHALL continue
   recomputing that field's value on save.

### Requirement 24: Inline Stencil Management

**User Story:** As an operator, I want to manage a device type's stencil from
within its own list, so that I don't need a separate stencil-only page.

#### Acceptance Criteria

1. THE device-type grids SHALL offer an inline, expandable stencil management
   control per row.
2. THE standalone stencil-only admin page SHALL be removed once its
   functionality is available inline.

### Requirement 25: City/Airport Validation

**User Story:** As an operator, I want city entry constrained to real
locations, so that I can't accidentally record a city that doesn't exist.

#### Acceptance Criteria

1. WHEN the operator has not selected a Country, THE City field SHALL NOT
   accept a value.
2. WHEN the operator types a city not present in the Country-filtered
   catalogue, THE City field SHALL reject the value UNLESS the operator has
   checked an explicit "not listed" override.
3. WHEN the override is checked, THE City field SHALL accept a freely typed
   value.

### Requirement 26: Dual IP Assignment

**User Story:** As an operator, I want every IP-capable device to require a
usage IP and a management IP, so that operational and management access are
always distinguishable.

#### Acceptance Criteria

1. WHEN a device or Generic_Entity with the `ip_assignment` Capability is
   created, THE creation flow SHALL require both a usage IP and a management
   IP assignment.
2. THE device/Generic_Entity record SHALL store the usage and management IP
   assignments distinguishably.

### Requirement 27: Bitwarden Secrets Manager Integration

**User Story:** As an administrator, I want vf-cmdb-managed credentials
stored in my existing Bitwarden vault's Secrets Manager, so that no plaintext
credential lives in the CMDB's own database.

#### Acceptance Criteria

1. THE Secrets_Client SHALL authenticate against the administrator's existing
   Bitwarden Organization using an Organization ID, Project ID, and machine
   account Access Token supplied via configuration.
2. THE Secrets_Client SHALL support creating, retrieving, and regenerating a
   secret, and SHALL NOT delete a secret as a side effect of an unrelated
   operation.

### Requirement 28: Default Admin Credential Management

**User Story:** As an operator, I want a device's default admin credential
generated and stored securely, so that I never see or manage a plaintext
password in the CMDB.

#### Acceptance Criteria

1. WHEN a device/Generic_Entity with a credential-bearing Capability is
   created, THE Backend SHALL generate a password and store it via the
   Secrets_Client, recording only the credential's Secrets_Client reference
   and username on the device row.
2. THE device/Generic_Entity's detail view SHALL show the username and a
   masked credential indicator with reveal and regenerate actions.
3. THE reveal action SHALL fetch the credential on demand and SHALL NOT
   persist it client-side.

### Requirement 29: Ansible Semaphore Deployment

**User Story:** As an administrator, I want an Ansible automation engine
running alongside the CMDB, so that device automation has somewhere to
execute.

#### Acceptance Criteria

1. THE deployment SHALL run Ansible Semaphore as a Podman-managed service on
   the current host.
2. THE Automation_Client SHALL authenticate against that Semaphore instance
   using a configured URL and API token.

### Requirement 30: Device Automation Lifecycle Sync

**User Story:** As an operator, I want an Ansible-managed device's record,
credential, and automation inventory entry to stay in sync automatically, so
that I don't maintain three systems by hand.

#### Acceptance Criteria

1. WHEN a device/Generic_Entity with the `ansible_managed` Capability is
   created or updated, THE Lifecycle_Sync_Service SHALL upsert a
   corresponding Automation_Client inventory host referencing its management
   IP and Secrets_Client credential.
2. WHEN such a device/Generic_Entity is deleted, THE Lifecycle_Sync_Service
   SHALL remove its Automation_Client inventory host entry and SHALL NOT
   delete its Secrets_Client credential automatically.
3. THE Lifecycle_Sync_Service SHALL take no action for a device/Generic_Entity
   whose Entity_Type_Def does not enable `ansible_managed`.

### Requirement 31: Automation Tab

**User Story:** As an operator, I want to run and monitor Ansible jobs
directly from a device's dashboard, so that I don't need to leave the CMDB to
manage its lifecycle.

#### Acceptance Criteria

1. THE Automation_Tab SHALL show the device's sync status (linked inventory
   host / credential).
2. THE Automation_Tab SHALL let the operator launch a job template and view
   its live output and history inline.
3. THE Automation_Tab SHALL provide a link to open the same job/host directly
   in Semaphore.
