# Requirements Document

## Introduction

Phase 4 extends the Virtualfactor IT CMDB (post FEAT-6/FEAT-7, HEAD `df712cd`)
across four locked sub-phases: (A) global UX polish, (B) reference-data
correctness, (C) graphical, connection-aware views for racks/patch
panels/power/port-config with a DB-backed stencil anchor system, and (D)
cable auto-population + Ansible-depth device facts. Architecture decisions are
pre-approved: extend the existing SVG approach (no new diagram library), a
hybrid anchor model (convention-based fallback + DB-backed precise anchors),
and a CRUD-level sync hook for cable automation.

## Glossary

- **Anchor**: a normalized (0-1 fractional) x/y coordinate mapped to a port
  identifier on a specific stencil face, stored in the Stencil_Anchor_Store.
- **Stencil_Anchor_Store**: the new database table holding Anchor rows.
- **Convention_Layout**: the computed fallback port layout used when no Anchor
  exists for a port (grid/linear layout, as RackDiagramSVG already does).
- **Connection_Dot**: the rendered port marker in a graphical view; visually
  distinct when a Cable exists for that port (connected) vs not (unconnected).
- **Breadcrumb_Nav**: the Site > Datacenter > Floor > Rack (> device)
  navigation control shared by every graphical view.
- **Cable_Sync_Service**: the crud.py hook that creates/updates/clears a Cable
  row from a DeviceInterface's connected-* fields.
- **Facts_Store**: the `ansible_facts` JSONB column plus the promoted columns
  (cpu_cores, memory_mb, os_distribution, last_fact_sync_at) on device tables.
- **Device_Type_Lookup**: a lookup table (NetworkDeviceType, ComputeDeviceType,
  StorageDeviceType, and the new PowerDeviceType) that a stencil attaches to.
- **Stencil_Library**: a curated index of external Visio stencil sources
  (GitHub repos, VisioCafe) organized by category, from which a `.vss`/`.vssx`
  file can be fetched on demand.
- **Stencil_Conversion_Service**: the backend module that converts a fetched
  `.vss`/`.vssx` stencil file into one standalone SVG per shape master.

## Requirements

### Requirement 1: Dashboard Navigation

**User Story:** As an operator, I want to click a dashboard count or recent
change, so that I land directly on the relevant section or record.

#### Acceptance Criteria

1. WHEN the operator clicks a Dashboard count card, THE Dashboard SHALL
   navigate to the listing route for that entity type.
2. WHEN the operator clicks a recent-change row, THE Dashboard SHALL navigate
   to the affected record's listing or detail route.
3. IF a count card's entity type has no known route, THEN THE Dashboard SHALL
   render that card as non-interactive rather than navigate to an invalid URL.

### Requirement 2: Dashboard Summary Depth

**User Story:** As an operator, I want richer per-type information on the
dashboard, so that I get a useful summary without opening each section.

#### Acceptance Criteria

1. THE Dashboard_Summary_Endpoint SHALL return a breakdown object per
   summarized entity type in addition to its total count.
2. THE Dashboard SHALL render each count card with its breakdown as a compact
   sub-list.

### Requirement 3: Reference Navigation Placement

**User Story:** As an operator, I want reference sections at the top of the
left navigation, so that I reach them without scrolling past everything else.

#### Acceptance Criteria

1. THE Left_Navigation SHALL render the Reference section group first, before
   every other navigation group.

### Requirement 4: Dropdown Cell Affordance

**User Story:** As an operator, I want dropdown cells to be obviously
interactive, so that I don't miss that a cell is editable via a picker.

#### Acceptance Criteria

1. THE Dropdown_Cell_Renderer SHALL render a chevron indicator at least as
   large as the cell's text content font size.
2. WHEN the operator hovers or focuses a dropdown cell, THE Dropdown_Cell_Renderer
   SHALL animate the chevron indicator.

### Requirement 5: Single-Click Fuzzy Dropdown Editing

**User Story:** As an operator, I want to open a dropdown cell with one click
and fuzzy-search its options, so that editing large lookup sets is fast.

#### Acceptance Criteria

1. WHEN the operator clicks a dropdown-backed cell once, THE Entity_Grid SHALL
   enter edit mode for that cell.
2. WHILE a dropdown cell is in edit mode, THE Fuzzy_Select_Editor SHALL filter
   its option list by fuzzy match against the operator's typed input.
3. WHEN the operator selects a filtered option, THE Fuzzy_Select_Editor SHALL
   commit that option's value to the cell.

### Requirement 6: Per-Section Fuzzy Search

**User Story:** As an operator, I want a fuzzy search box on every table, so
that I can find rows in large lists without exact substring matches.

#### Acceptance Criteria

1. THE Entity_Grid SHALL render a search input in its toolbar.
2. WHEN the operator types a query into the search input, THE Entity_Grid
   SHALL display only rows with at least one column value fuzzy-matching the
   query.
3. WHEN the search input is empty, THE Entity_Grid SHALL display every row.

### Requirement 7: IPAM Column Order

**User Story:** As an operator, I want the Description column first in IPAM
tables, so that the most identifying context is immediately visible.

#### Acceptance Criteria

1. THE IPAM_View and THE Subnets_View SHALL render the Description column as
   the first column in both the IPv4 and IPv6 tables.

### Requirement 8: Region List Correctness

**User Story:** As an operator, I want the Regions reference list restricted
to Colombia and well-known Americas regions, so that the dropdown is not
cluttered with irrelevant entries.

#### Acceptance Criteria

1. THE Region_Seed_List SHALL contain only Colombia regions and well-known
   Americas regions.
2. WHEN a Region_Cleanup_Migration runs, IF a pre-existing Region row is not in
   the approved list AND is not referenced by any Site, THEN THE
   Region_Cleanup_Migration SHALL delete that row.
3. IF a pre-existing Region row is not in the approved list AND is referenced
   by at least one Site, THEN THE Region_Cleanup_Migration SHALL leave that row
   in place.
4. THE Reference_Data_View SHALL continue to allow the operator to manually add
   a Region row.

### Requirement 9: In-Cell Airport Search

**User Story:** As an operator, I want to search and select an airport IATA
code directly in the grid cell, so that I don't need to recall codes from
memory.

#### Acceptance Criteria

1. WHEN the operator opens the IATA code cell, THE Airport_Cell_Editor SHALL
   query matching airports as the operator types a city or code.
2. WHEN the operator selects a matching airport, THE Airport_Cell_Editor SHALL
   commit that airport's IATA code to the cell.

### Requirement 10: Themed Network Device Simple Name

**User Story:** As an operator, I want network devices to carry a themed,
networking-flavored simple name, so that devices are easy to recognize and
discuss informally.

#### Acceptance Criteria

1. THE Theme_Catalogue SHALL include a networking-themed category.
2. WHEN the operator opens the theme picker on a Network_Device row, THE
   Network_Devices_View SHALL offer names from the networking-themed category.
3. WHEN the operator selects a themed name, THE Network_Devices_View SHALL
   write that name into the device's simple-name field.
4. THE Network_Devices_View SHALL also allow the operator to type a manual
   simple-name value without using the theme picker.

### Requirement 11: Rack View Breadcrumb Navigation

**User Story:** As an operator, I want breadcrumb navigation in the rack view,
so that I can drill from datacenter to a specific rack and be deep-linked
there from elsewhere.

#### Acceptance Criteria

1. THE Rack_View SHALL render a Breadcrumb_Nav showing Site, Datacenter,
   Floor, and Rack.
2. WHEN the operator clicks a Breadcrumb_Nav level, THE Rack_View SHALL narrow
   the displayed racks to that level and clear more specific selections.
3. WHEN the Rack_View is opened with a rack identifier query parameter, THE
   Rack_View SHALL pre-select that rack's full Breadcrumb_Nav path.

### Requirement 12: Rack View Face Toggle Visibility

**User Story:** As an operator, I want the front/back toggle to be obviously
present, so that I don't assume the rack view has no back-face option.

#### Acceptance Criteria

1. THE Rack_View SHALL render the front/back toggle as a labeled, visually
   prominent control positioned above the rack diagrams.

### Requirement 13: Rack Equipment Add/Edit/Remove

**User Story:** As an operator, I want to add, move, and remove equipment
directly from the rack view, so that I don't need a separate grid workflow.

#### Acceptance Criteria

1. WHEN the operator clicks an empty rack U slot, THE Rack_Slot_Editor SHALL
   offer creating a new device or assigning an existing unplaced device to
   that slot.
2. WHEN the operator confirms placement, THE Rack_Slot_Editor SHALL update
   both the Rack_Unit record and the placed device's own rack reference.
3. WHEN the operator clicks an occupied rack U slot, THE Rack_Slot_Editor
   SHALL offer editing the slot's label/height or removing the device from
   the rack.
4. WHEN the operator removes a device from a rack, THE Rack_Slot_Editor SHALL
   clear that device's rack reference and its Rack_Unit record.

### Requirement 14: Stencil Front and Back Faces

**User Story:** As an operator, I want to import and use a stencil for both
the front and back of a device, so that the back face shows a realistic
graphic too.

#### Acceptance Criteria

1. THE Device_Type_Lookup SHALL store a separate stencil for the front face
   and the back face.
2. WHEN a Device_Type_Lookup has a back-face stencil configured, THE
   Rack_Diagram SHALL render that stencil on the back face instead of the
   dimmed rectangle.
3. IF a Device_Type_Lookup has no back-face stencil configured, THEN THE
   Rack_Diagram SHALL render the existing dimmed-rectangle back face.

### Requirement 15: Graphical Connection Editing

**User Story:** As an operator, I want to create, edit, and remove
connections directly from a graphical view, so that cabling is managed
visually rather than only through a separate grid.

#### Acceptance Criteria

1. WHILE a port has an associated Cable, THE Connection_Dot for that port
   SHALL render in a visually distinct connected state.
2. WHILE a port has no associated Cable, THE Connection_Dot for that port
   SHALL render in a visually distinct unconnected state.
3. WHEN the operator clicks an unconnected Connection_Dot, THE graphical view
   SHALL open the connect panel to create a new Cable.
4. WHEN the operator clicks a connected Connection_Dot, THE graphical view
   SHALL open a connection panel showing the far end, with options to edit the
   destination, remove the Cable, or navigate to the far end's own graphical
   view.

### Requirement 16: Patch Panel Graphical View

**User Story:** As an operator, I want a graphical, breadcrumb-navigable,
connection-editable view for patch panels, so that I can manage them the same
way as racks.

#### Acceptance Criteria

1. THE Patch_Panel_View SHALL render a Breadcrumb_Nav down to a selected patch
   panel.
2. THE Patch_Panel_View SHALL render each patch panel port as a Connection_Dot
   using the Convention_Layout.
3. THE Patch_Panel_View SHALL support the connection editing behavior defined
   in Requirement 15.

### Requirement 17: Power Device Graphical View

**User Story:** As an operator, I want a graphical, breadcrumb-navigable,
stencil-based view for power devices, so that I can see and manage power
connections visually.

#### Acceptance Criteria

1. THE Power_Device_View SHALL render a Breadcrumb_Nav down to a selected
   power device.
2. WHEN a power device's Device_Type_Lookup has a configured stencil, THE
   Power_Device_View SHALL render that stencil with its outlets as
   Connection_Dots.
3. IF a power device's Device_Type_Lookup has no configured stencil, THEN THE
   Power_Device_View SHALL render its outlets using the Convention_Layout.
4. THE Power_Device_View SHALL support the connection editing behavior defined
   in Requirement 15.

### Requirement 18: Port Configuration Graphical View

**User Story:** As an operator, I want a graphical, breadcrumb-navigable,
connection-editable view per switch/router, so that I can manage its ports
visually.

#### Acceptance Criteria

1. THE Port_Config_View SHALL render a Breadcrumb_Nav down to a selected
   network device.
2. THE Port_Config_View SHALL render each of that device's ports as a
   Connection_Dot, using a mapped Anchor when one exists and the
   Convention_Layout otherwise.
3. THE Port_Config_View SHALL support the connection editing behavior defined
   in Requirement 15.
4. WHEN the operator clicks a port that is not a Connection_Dot interaction
   target (i.e. a settings click, not a connect click), THE Port_Config_View
   SHALL open a side panel to edit that port's configuration fields.

### Requirement 19: Stencil Anchor Mapping

**User Story:** As an administrator, I want to map precise port join points
on a stencil, so that connection dots align with the stencil's real connector
positions for the models I actually use.

#### Acceptance Criteria

1. THE Stencil_Anchor_Store SHALL persist an Anchor as a device-type stencil
   owner reference, a face, a port identifier, and normalized x/y coordinates.
2. WHEN the administrator clicks a location on a rendered stencil in the
   Anchor_Editor, THE Anchor_Editor SHALL prompt for a port identifier and
   create an Anchor at that normalized location.
3. WHEN a graphical view renders a port that has a matching Anchor for the
   current stencil and face, THE graphical view SHALL position that port's
   Connection_Dot at the Anchor's coordinates.
4. WHEN a graphical view renders a port with no matching Anchor, THE graphical
   view SHALL position that port's Connection_Dot using the Convention_Layout.
5. THE Anchor_Editor SHALL allow the administrator to delete an existing
   Anchor.

### Requirement 20: Cable Auto-Population

**User Story:** As an operator, I want Cable rows to appear automatically when
I fill in a switch port's connection fields, so that I don't have to enter
the same connection twice.

#### Acceptance Criteria

1. WHEN a Device_Interface's connected-device fields are set on create or
   update, THE Cable_Sync_Service SHALL create or update a Cable row
   representing that connection, marked as auto-generated.
2. WHEN a Device_Interface's connected-device fields are cleared, IF the
   associated Cable was auto-generated, THEN THE Cable_Sync_Service SHALL
   delete that Cable row.
3. THE Cable_Sync_Service SHALL NOT modify or delete a Cable row that was not
   auto-generated.

### Requirement 21: Ansible-Depth Device Facts

**User Story:** As an operator, I want device detail pages to show
Ansible-collectable depth of information, so that the Facts tab is useful
rather than a placeholder.

#### Acceptance Criteria

1. THE Facts_Store SHALL persist arbitrary incoming fact data in the
   `ansible_facts` JSONB column.
2. WHEN an incoming facts payload includes a promoted key (cpu_cores,
   memory_mb, os_distribution), THE Facts_Ingestion_Endpoint SHALL write that
   value to its dedicated column in addition to the JSONB blob.
3. WHEN an incoming facts payload is ingested, THE Facts_Ingestion_Endpoint
   SHALL record the ingestion time in `last_fact_sync_at`.
4. THE Device_Detail_Facts_Tab SHALL render the promoted columns and a
   collapsible view of the full `ansible_facts` blob.

### Requirement 22: Stencil Library Import (backlog addition)

**User Story:** As an administrator, I want to browse a library of existing
Visio stencils by category, fetch the matching file, and pick the specific
shape that matches a real device model, so that I don't have to hand-author
SVGs for every device type.

#### Acceptance Criteria

1. THE Stencil_Library SHALL offer a curated list of categories sourced from
   the `bhdicaire/visioStencils` GitHub repository and VisioCafe.
2. WHEN the administrator selects a category, THE Stencil_Library SHALL list
   the `.vss`/`.vssx` files available in that category.
3. WHEN the administrator selects a file, THE Stencil_Conversion_Service
   SHALL fetch it, convert every shape master it contains into a standalone
   SVG, and return a preview (thumbnail + title) for each shape.
4. WHEN the administrator picks one previewed shape, THE Stencil_Library
   picker SHALL upload that shape's SVG as the stencil for the selected
   Device_Type_Lookup row and face, through the existing stencil upload
   endpoint.
5. IF a `.vss`/`.vssx` file fails to fetch or convert, THEN THE Stencil_Library
   SHALL surface a clear error without leaving a partially-applied stencil.
