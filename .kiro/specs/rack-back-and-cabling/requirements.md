# Requirements Document

## Introduction

FEAT-6 extends the rack visualization capabilities of the vf-cmdb system with three coordinated sprints. Sprint 6A adds a dual-face rack view so operators can inspect both the front and the back of a rack, with port connector dots drawn on the back face colored by port type. Sprint 6B introduces a Visio Café stencil library that downloads and caches per-model SVG graphics (with a manual upload fallback) so that device rectangles can be replaced with realistic stencils, working fully air-gapped once stencils are loaded. Sprint 6C adds port-to-port cable connections, including polymorphic port ownership so any device class can own data ports, an interactive "Connect to" workflow scoped to the same rack or datacenter, auto-generated cable labels, and a filterable cables viewer.

All three sprints reuse existing platform patterns: generic CRUD through the entity registry, kebab-case slugs, SQLAlchemy event listeners for changelog and naming, and TanStack Query on the frontend. The existing `Cable` model a/b shape is preserved without a rename migration.

## Glossary

- **Rack_View**: The frontend feature (`RackView.tsx`) that renders a rack and its mounted devices and provides user controls above the diagram.
- **Rack_Diagram**: The SVG rendering component (`RackDiagramSVG.tsx`) that draws rack units, devices, ports, and stencils.
- **Rack_Face**: The orientation of the rack currently rendered, either `front` or `back`.
- **Port_Connector_Dot**: A colored dot drawn on the back face of the Rack_Diagram representing a data or power port on a device.
- **Port_Type**: The category of a port used to determine dot color, one of `copper` (blue), `fiber` (orange), or `power` (yellow).
- **Device_Interface**: The `DeviceInterface` record (models.py:556) representing a data port owned by a device.
- **Power_Outlet**: The `PowerOutlet` record (models.py:389) representing a power port and the source of yellow power dots.
- **Stencil_Service**: The backend component exposing `GET /api/v1/stencils/{model_slug}` that resolves, downloads, caches, and serves stencil SVG graphics.
- **Stencil_Cache**: The on-disk directory `backend/static/stencils/` where downloaded and uploaded stencil SVG files are stored.
- **Visio_Cafe**: The external source (`https://www.visiocafe.com`) from which stencil SVG graphics are downloaded when internet access is reachable.
- **Device_Type_Model**: Any of the model records `NetworkDeviceType`, `ComputeDeviceType`, or `StorageDeviceType` that carry a `stencil_url` field.
- **Cable_Service**: The backend component that creates, reads, updates, deletes, and lists `Cable` records (models.py:425).
- **Cable_Label**: The single auto-generated identifier for a cable, formatted by the Naming_Engine.
- **Naming_Engine**: The naming convention module (`naming.py`) that generates entity names and, per this feature, the Cable_Label.
- **Connect_Panel**: The frontend panel opened after selecting a source port that lists candidate destination ports.
- **Cables_Viewer**: The frontend table view that lists all cable connections with from/to columns and filters.
- **Changelog_System**: The existing SQLAlchemy event-listener audit mechanism that records create, update, and delete operations.

## Requirements

### Requirement 1: Front/Back Rack Toggle

**User Story:** As a data center operator, I want to toggle between the front and back of a rack, so that I can inspect device cabling and port layout on the rear face.

#### Acceptance Criteria

1. THE Rack_View SHALL display a Front/Back toggle control positioned above the Rack_Diagram.
2. WHEN the Rack_View is first loaded, THE Rack_View SHALL set the Rack_Face to `front`.
3. WHEN the operator activates the Front/Back toggle, THE Rack_View SHALL set the Rack_Face to the opposite value of the current Rack_Face.
4. WHEN the Rack_Face is set, THE Rack_Diagram SHALL render the rack using the current Rack_Face value passed through its `face` property.
5. WHILE the Rack_Face is `back`, THE Rack_Diagram SHALL render the rear layout of each mounted device.

### Requirement 2: Back-Face Port Connector Dots

**User Story:** As a data center operator, I want ports drawn as colored dots on the back of the rack, so that I can identify port types at a glance.

#### Acceptance Criteria

1. WHILE the Rack_Face is `back`, THE Rack_Diagram SHALL draw one Port_Connector_Dot for each Device_Interface owned by a device mounted in the rack.
2. WHILE the Rack_Face is `back`, THE Rack_Diagram SHALL draw one Port_Connector_Dot for each Power_Outlet associated with a device mounted in the rack.
3. WHERE a Port_Connector_Dot represents a copper Port_Type, THE Rack_Diagram SHALL render the Port_Connector_Dot in blue.
4. WHERE a Port_Connector_Dot represents a fiber Port_Type, THE Rack_Diagram SHALL render the Port_Connector_Dot in orange.
5. WHERE a Port_Connector_Dot represents a power Port_Type, THE Rack_Diagram SHALL render the Port_Connector_Dot in yellow.
6. WHILE the Rack_Face is `front`, THE Rack_Diagram SHALL omit all Port_Connector_Dots.

### Requirement 3: Device Model Stencil URL

**User Story:** As a system administrator, I want each device model to carry a stencil URL, so that realistic graphics can replace plain colored rectangles.

#### Acceptance Criteria

1. THE Device_Type_Model SHALL provide a `stencil_url` field on the `NetworkDeviceType`, `ComputeDeviceType`, and `StorageDeviceType` models.
2. WHERE a Device_Type_Model has a non-empty `stencil_url`, THE Rack_Diagram SHALL embed the resolved stencil as an SVG image element at the device rectangle position.
3. WHERE a Device_Type_Model has an empty `stencil_url`, THE Rack_Diagram SHALL render the device as a colored rectangle.
4. WHEN the administrator sets a `stencil_url` value on a Device_Type_Model detail page, THE Cable_Service SHALL persist the `stencil_url` value on the corresponding Device_Type_Model record.

### Requirement 4: Stencil Download and Caching

**User Story:** As a system administrator, I want stencils downloaded and cached from Visio Café, so that the system displays them without repeated network access.

#### Acceptance Criteria

1. WHEN the Stencil_Service receives a request for a model slug that is present in the Stencil_Cache, THE Stencil_Service SHALL serve the stencil from the Stencil_Cache.
2. IF the Stencil_Service receives a request for a model slug that is absent from the Stencil_Cache AND Visio_Cafe is reachable, THEN THE Stencil_Service SHALL download the stencil from Visio_Cafe, store the stencil in the Stencil_Cache, and serve the downloaded stencil.
3. IF the Stencil_Service receives a request for a model slug that is absent from the Stencil_Cache AND Visio_Cafe is unreachable, THEN THE Stencil_Service SHALL return an HTTP 404 response.
4. WHILE Visio_Cafe is unreachable AND the requested model slug is present in the Stencil_Cache, THE Stencil_Service SHALL serve the stencil from the Stencil_Cache.

### Requirement 5: Manual Stencil Upload

**User Story:** As a system administrator, I want to upload a stencil SVG for a model manually, so that I can supply graphics in air-gapped environments.

#### Acceptance Criteria

1. WHEN the administrator uploads an SVG file for a model slug, THE Stencil_Service SHALL store the uploaded file in the Stencil_Cache under that model slug.
2. IF the administrator uploads a file whose content type is not SVG, THEN THE Stencil_Service SHALL reject the upload with an HTTP 400 response.
3. WHEN a stencil for a model slug is present in the Stencil_Cache through manual upload, THE Stencil_Service SHALL serve the uploaded stencil without contacting Visio_Cafe.

### Requirement 6: Polymorphic Port Ownership

**User Story:** As a data center operator, I want any device class to own data ports, so that servers, storage, and other equipment can participate in cable connections.

#### Acceptance Criteria

1. THE Device_Interface SHALL provide an `owner_device_type` field and an `owner_device_id` field identifying the owning device.
2. THE Device_Interface SHALL permit a null value for the `network_device_id` field.
3. THE Cable_Service SHALL apply an Alembic migration that adds the `owner_device_type` and `owner_device_id` fields to the `device_interfaces` table and makes the `network_device_id` column nullable.
4. WHERE a Device_Interface has a non-null `network_device_id`, THE Cable_Service SHALL preserve the existing network-device port behavior for that Device_Interface.
5. WHEN a Device_Interface is created with an `owner_device_type` and `owner_device_id`, THE Cable_Service SHALL associate the Device_Interface with the identified owning device.

### Requirement 7: Port Label on Hover

**User Story:** As a data center operator, I want to see a port's label when I hover over it, so that I can confirm which port I am about to connect.

#### Acceptance Criteria

1. WHILE the Rack_Face is `back`, WHEN the operator hovers over a Port_Connector_Dot, THE Rack_Diagram SHALL display the label of the corresponding port.
2. WHEN the operator moves the pointer away from a Port_Connector_Dot, THE Rack_Diagram SHALL hide the displayed port label.

### Requirement 8: Port-to-Port Cable Connection

**User Story:** As a data center operator, I want to connect a source port to a destination port, so that I can record physical cabling between devices.

#### Acceptance Criteria

1. WHEN the operator selects a Port_Connector_Dot as the source port, THE Rack_View SHALL open the Connect_Panel.
2. THE Connect_Panel SHALL list candidate destination ports belonging to devices mounted in the same rack as the source port.
3. THE Connect_Panel SHALL list candidate destination ports belonging to devices mounted in other racks within the same datacenter as the source port.
4. WHEN the operator selects a destination port in the Connect_Panel, THE Cable_Service SHALL create a Cable record mapping the source port to `port_a_type` and `port_a_id` and mapping the destination port to `port_b_type` and `port_b_id`.
5. WHEN the Cable_Service creates a Cable record, THE Cable_Service SHALL populate the from device reference fields with the source device identity and the to device reference fields with the destination device identity.
6. WHEN the Cable_Service creates a Cable record, THE Cable_Service SHALL store the `cable_type` value as one of the strings `copper`, `fiber`, `power`, `patchcord`, or `structured`.
7. IF the operator selects the source port as the destination port, THEN THE Cable_Service SHALL reject the request with an HTTP 400 response.

### Requirement 9: Automatic Cable Label Generation

**User Story:** As a data center operator, I want a cable label generated automatically, so that physical labeling matches the recorded connection.

#### Acceptance Criteria

1. WHEN the Cable_Service creates a Cable record, THE Naming_Engine SHALL generate a single Cable_Label from the source device name, the source port, the destination device name, and the destination port.
2. THE Naming_Engine SHALL format the Cable_Label as `{from_device_name}-{from_port}→{to_device_name}-{to_port}`.
3. WHEN the Naming_Engine generates the Cable_Label, THE Cable_Service SHALL store the Cable_Label value on the Cable record.
4. WHEN the source device name, source port, destination device name, or destination port of a Cable record changes, THE Naming_Engine SHALL regenerate the Cable_Label for that Cable record.

### Requirement 10: Filterable Cables Viewer

**User Story:** As a data center operator, I want a filterable cables viewer, so that I can review all connections by rack or device.

#### Acceptance Criteria

1. THE Cables_Viewer SHALL display all Cable records in a table with a from column and a to column.
2. WHEN the operator applies a rack filter, THE Cables_Viewer SHALL display only Cable records whose source device or destination device is mounted in the selected rack.
3. WHEN the operator applies a device filter, THE Cables_Viewer SHALL display only Cable records whose source device or destination device matches the selected device.
4. WHEN no filter is applied, THE Cables_Viewer SHALL display every Cable record.

### Requirement 11: Cable Operation Auditing

**User Story:** As a system administrator, I want cable operations recorded in the changelog, so that I can audit connection changes.

#### Acceptance Criteria

1. WHEN the Cable_Service creates a Cable record, THE Changelog_System SHALL record a create entry for that Cable record.
2. WHEN the Cable_Service updates a Cable record, THE Changelog_System SHALL record an update entry for that Cable record.
3. WHEN the Cable_Service deletes a Cable record, THE Changelog_System SHALL record a delete entry for that Cable record.
