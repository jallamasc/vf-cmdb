# Design Document

## Overview

FEAT-6 extends the existing rack visualization stack with three coordinated sprints. The design deliberately reuses the platform's fixed patterns rather than introducing parallel machinery:

- **Generic CRUD** through `ENTITY_REGISTRY` (kebab-case slugs) in `backend/app/registry.py`, served by `backend/app/routers/generic.py`.
- **Changelog + naming** are *not* SQLAlchemy ORM event listeners in this codebase — they are applied inside `crud.create_item` / `crud.update_item` / `crud.delete_item` (`backend/app/crud.py`), which call `crud._log(...)` for every field change and `naming.apply_naming(session, obj)` for computed names. Anything that must be audited or auto-named therefore either routes through generic CRUD or replicates that call sequence (as the IPAM reservation endpoints in `special.py` already do). This design keeps cable writes on the generic CRUD path so audit + naming come for free, and hooks the Cable_Label into the existing `naming.GENERATORS` dispatch table.
- **Special (non-CRUD) endpoints** live in `backend/app/routers/special.py`, registered *before* the generic catch-all router in `main.py`. The Stencil_Service and the port-candidate lookup are added here.
- **Frontend** is React 18 + TS + Vite, TanStack Query for fetching, the typed `api` client in `frontend/src/api.ts`, AG Grid via the generic `EntityGrid.tsx`, and the front-only `RackDiagramSVG.tsx` / `RackView.tsx`.

The three sprints map to the requirements as:

- **6A (Req 1, 2, 7):** dual-face rack rendering with back-face port dots and hover labels.
- **6B (Req 3, 4, 5):** `stencil_url` on device-type models + Stencil_Service (cache-first proxy, upload, air-gap fallback) + SVG `<image>` embedding.
- **6C (Req 6, 8, 9, 10, 11):** polymorphic port ownership migration, the Connect_Panel workflow, cable creation with auto Cable_Label, and the filterable Cables_Viewer.

## Architecture

```
┌──────────────────────────── Frontend (React + TS + Vite) ────────────────────────────┐
│  RackView.tsx                                                                          │
│    ├─ Front/Back toggle  ──────────────► face: "front" | "back"                        │
│    ├─ useQuery: racks, rack-units, device-interfaces, power-outlets (per shown rack)   │
│    ├─ RackDiagramSVG.tsx (face-aware)                                                   │
│    │     ├─ front: device rects OR <image href> stencil                                 │
│    │     └─ back:  PortConnectorDot[] (copper=blue, fiber=orange, power=yellow)         │
│    │            └─ onClick(sourcePort) ─► opens ConnectPanel                             │
│    └─ ConnectPanel.tsx (candidate ports in same rack / same datacenter)                 │
│  CablesViewer.tsx (EntityGrid over "cables", filter by rack / device)                   │
│  StencilField.tsx (admin: set stencil_url + upload SVG)                                  │
└───────────────────────────────────────────┬───────────────────────────────────────────┘
                                             │  api.ts (typed fetch, /api/v1)
┌────────────────────────────────────────────▼──────────────────────────────────────────┐
│  FastAPI backend                                                                         │
│   generic.py   /{resource}          ── cables, device-interfaces (CRUD + audit + naming) │
│   special.py   /stencils/{slug}     ── cache-first proxy + POST upload                    │
│   special.py   /ports/candidates    ── connectable destination ports for a source port   │
│   crud.py      create/update/delete ── crud._log(...) + naming.apply_naming(...)          │
│   naming.py    GENERATORS[Cable]    ── Cable_Label = {from}-{a}→{to}-{b}                   │
│   models.py    Cable / DeviceInterface / PowerOutlet / *DeviceType.stencil_url            │
│   alembic 0006 polymorphic ports + stencil_url                                            │
│   backend/static/stencils/  ── Stencil_Cache (downloaded + uploaded SVGs)                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Backend

| Component | Location | Responsibility |
| --- | --- | --- |
| `Cable`, `DeviceInterface`, `PowerOutlet` models | `backend/app/models.py` | Cable ends, data ports (now polymorphic), power ports |
| `NetworkDeviceType`, `ComputeDeviceType`, `StorageDeviceType` | `backend/app/models.py` | Gain `stencil_url` column |
| `naming.generate_cable` + `GENERATORS[Cable]` | `backend/app/naming.py` | Auto-generate Cable_Label |
| Stencil_Service | `backend/app/routers/special.py` (+ helper `backend/app/stencils.py`) | Resolve / download / cache / upload / serve stencils |
| Port candidates endpoint | `backend/app/routers/special.py` | List connectable destination ports scoped to rack / datacenter |
| Alembic `0006_ports_and_stencils` | `backend/alembic/versions/` | Schema migration + backfill |

### Frontend

| Component | Location | Responsibility |
| --- | --- | --- |
| `RackView.tsx` | `frontend/src/pages/` | Front/Back toggle, orchestrates data fetch, owns Connect_Panel open state |
| `RackDiagramSVG.tsx` | `frontend/src/components/` | `face` prop; front rects/stencils; back Port_Connector_Dots + hover labels |
| `ConnectPanel.tsx` | `frontend/src/components/` (new) | Lists candidate destination ports, submits cable creation |
| `CablesViewer.tsx` | `frontend/src/pages/` (new) | Filterable cables grid over `EntityGrid` |
| `StencilField.tsx` | `frontend/src/components/` (new) | Admin control to set `stencil_url` / upload an SVG |
| `api` client additions | `frontend/src/api.ts` | `stencilUrl`, `uploadStencil`, `portCandidates` helpers |

## Data Models

### 6B — `stencil_url` on device-type models

`NetworkDeviceType`, `ComputeDeviceType`, and `StorageDeviceType` are `LookupMixin` subclasses. Add a nullable column so a missing/empty value means "no stencil, draw a rectangle" (Req 3.1, 3.3):

```python
# models.py — added to each of the three device-type models
stencil_url: Mapped[Optional[str]] = mapped_column(String(500))
```

Because these are already registered CRUD resources (`network-device-types`, `compute-device-types`, `storage-device-types`), setting `stencil_url` flows through `PATCH /api/v1/{slug}/{id}` → `crud.update_item`, which persists the value and records a changelog entry automatically (Req 3.4).

### 6C — polymorphic port ownership on `device_interfaces`

Today `DeviceInterface.network_device_id` is a NOT NULL FK to `network_devices`. To let any device class own a data port (Req 6) add a polymorphic owner pair (mirroring the existing free-text discriminator pattern used by `cables.port_a_type` and `ip_assignments.assigned_to_type`) and relax the FK:

```python
# models.py — DeviceInterface changes
network_device_id: Mapped[Optional[int]] = mapped_column(
    ForeignKey("network_devices.id"), nullable=True  # was nullable=False
)
owner_device_type: Mapped[Optional[str]] = mapped_column(String(40))  # e.g. "network-devices", "physical-servers"
owner_device_id: Mapped[Optional[int]] = mapped_column(Integer)
```

`owner_device_type` holds the same kebab-case CRUD slug the polymorphic helpers in `devices.py` already match on (`polymorphic_aliases` / `_type_matches`), so the existing device-detail "interfaces" relation continues to resolve without special-casing.

**Ownership resolution rule (Req 6.4 / 6.5):** a `DeviceInterface` is owned by
- the record identified by (`owner_device_type`, `owner_device_id`) when those are set, otherwise
- `network_devices[network_device_id]` (legacy behavior preserved).

> **Disambiguation — two polymorphic pairs on `device_interfaces`.** The new
> `owner_device_type` / `owner_device_id` pair answers *"which device does this
> port belong to"* (the physical owner, used for rack membership and the back
> face). It is distinct from the pre-existing `connected_device_type` /
> `connected_device_id` / `connected_port` triplet, which records *"what this
> port is patched into"* (the far end of a link, used by
> `devices.related_interfaces`). Implementers must not conflate the two: 6C
> cabling reads/writes the **owner** pair; the connected-* triplet is left
> untouched.

### Physical-location resolution (rack + datacenter)

Both the back-face dot rendering (6A) and the port-candidate scoping (6C) depend
on two lookups that the codebase does **not** expose directly, so they are
defined here once and reused.

**A. Which rack is a device in? (`device → rack_id`)** Membership is resolved in
this order:
1. If the device model has a direct `rack_id` column and it is set, use it.
   `PhysicalServer`, `PowerDevice`, `PowerOutlet`, `PatchPanel` carry `rack_id`
   directly.
2. Otherwise, look it up through `RackUnit`: the `rack_units` row whose
   (`device_table`, `device_id`) discriminator matches the device gives
   `rack_units.rack_id`. `device_table` holds the same kebab/segment key used to
   identify the model. This covers `NetworkDevice` and any device placed only
   via a rack-unit assignment.
3. A `PowerOutlet` is treated as belonging to its own `rack_id` (it has one).

A device that resolves to no rack is simply omitted from the back face and is
not a candidate source/destination.

**B. Which datacenter is a rack in? (`rack → datacenter_id`)** `Rack` has **no**
`datacenter_id` column. Resolve in this order:
1. `rack.datacenter_floor_id → datacenter_floors.datacenter_id`, if set.
2. Else `rack.room_id → rooms.datacenter_floor_id → datacenter_floors.datacenter_id`, if set.
3. Else the rack has **no** resolvable datacenter (only `site_id`, or nothing).

**Candidate scoping fallback (Req 8.3).** The port-candidate endpoint scopes to
"same rack OR same datacenter." When the source rack has no resolvable
datacenter (rule B falls through), the endpoint falls back to **same `site_id`**;
if the rack has neither datacenter nor site, scoping is **same rack only**.
This guarantees legitimately-placed racks (site-only, floor-only, or room-based)
always yield candidates instead of a spurious `404`. A `404` is returned only
when the *source port itself* cannot be located to any rack.

### `Cable` model — no structural change

The existing a/b shape is intentionally preserved (no rename migration). Existing columns already cover 6C:

- `cable_type` (String(20)) — extend accepted values to `copper | fiber | power | patchcord | structured` (Req 8.6). Validation is enforced in the create path (see Error Handling); no enum migration.
- `port_a_type` / `port_a_id`, `port_b_type` / `port_b_id` — source→A, destination→B (Req 8.4).
- `label_a` / `label_b` — the from/to device references / port labels (Req 8.5).
- a new **`label`** column is **not** added; the single Cable_Label is stored in an existing free field. To store the generated Cable_Label without a rename, reuse `notes` is undesirable, so add one nullable column:

```python
# models.py — Cable
label: Mapped[Optional[str]] = mapped_column(String(200))  # auto-generated Cable_Label
```

This is additive (no rename of the a/b fields) and keeps the a/b shape intact per the requirements' constraint.

### Migration Plan — `0006_ports_and_stencils`

Follows the established idempotent style of `0005_site_redesign.py`: `down_revision = "0005_site_redesign"`, every step guarded by an `inspect(...)`/column-existence check so it is safe on both fresh (`create_all`-built) and previously-migrated databases.

**Upgrade steps**

1. `stencil_url` (String(500), nullable) on `network_device_types`, `compute_device_types`, `storage_device_types` — add if the column is absent.
2. `cables.label` (String(200), nullable) — add if absent.
3. `device_interfaces.owner_device_type` (String(40), nullable) + `owner_device_id` (Integer, nullable) — add if absent.
4. Make `device_interfaces.network_device_id` nullable (`alter_column(..., nullable=True)`).
5. **Backfill (Req 6.4):** every existing row keeps network-device ownership so no behavior changes:

```sql
UPDATE device_interfaces
   SET owner_device_type = 'network-devices',
       owner_device_id   = network_device_id
 WHERE network_device_id IS NOT NULL
   AND owner_device_id IS NULL;
```

**Downgrade steps** (best-effort, guarded): drop `owner_device_type` / `owner_device_id`, drop `cables.label`, drop the three `stencil_url` columns, and restore `network_device_id` to NOT NULL only if no NULLs exist (otherwise leave nullable to avoid data loss).

### Stencil_Cache layout

On-disk directory `backend/static/stencils/`, one file per model slug: `backend/static/stencils/{model_slug}.svg`. The directory is created on service startup if missing. `model_slug` is the kebab-case slug already used to identify the device type (validated against the charset `^[a-z0-9]+(-[a-z0-9]+)*$` to prevent path traversal).

## API Endpoint Contracts

### 6B — Stencil_Service (`special.py`)

**`GET /api/v1/stencils/{model_slug}`** — cache-first resolver (Req 4).

- Validate `model_slug` charset (else `400`).
- If `backend/static/stencils/{model_slug}.svg` exists → return it (`200`, `image/svg+xml`) (Req 4.1, 4.4, 5.3).
- Else, look up the device-type row's `stencil_url`; if present **and** Visio_Cafe reachable → download, store to cache, serve (`200`) (Req 4.2).
- Else (`stencil_url` absent, or download unreachable/fails) → `404` (Req 4.3).

Response headers: `Content-Type: image/svg+xml`, `Cache-Control: public, max-age=86400`.

**`POST /api/v1/stencils/{model_slug}`** — manual upload (Req 5).

- Request: `multipart/form-data` with field `file` (an SVG).
- Reject if content type is not `image/svg+xml` **and** the body does not begin with an `<svg` root element → `400` (Req 5.2).
- Store to `backend/static/stencils/{model_slug}.svg`, overwriting any cached copy (Req 5.1).
- Response `200`: `{ "model_slug": "...", "stored": true, "path": "/api/v1/stencils/{model_slug}" }`.
- Subsequent `GET` serves the uploaded file without contacting Visio_Cafe (Req 5.3, guaranteed by the cache-first ordering above).

### 6C — Port candidates (`special.py`)

**`GET /api/v1/ports/candidates`** — connectable destination ports for a source (Req 8.2, 8.3).

Query params: `source_type` (kebab slug), `source_id` (int), `source_port_kind` (`interface` | `outlet`), `source_port_id` (int).

Behavior: resolve the source port's owning device using the **Ownership resolution rule**, then its rack via **resolution rule A** and its datacenter via **resolution rule B** (see "Physical-location resolution" above). Return every `DeviceInterface` and `PowerOutlet` whose owning device is mounted in the **same rack**, or — applying the **candidate scoping fallback** — in any rack sharing the source's datacenter (else same `site_id`, else same rack only), excluding the source port itself. Return `404` only when the source port cannot be located to any rack.

Response:
```json
{
  "source": { "device_type": "network-devices", "device_id": 12, "port_kind": "interface", "port_id": 88, "rack_id": 3, "datacenter_id": 1 },
  "candidates": [
    {
      "port_kind": "interface", "port_id": 91,
      "owner_type": "physical-servers", "owner_id": 44,
      "owner_name": "VFHMA1SRV1", "label": "eth0",
      "port_type": "copper", "rack_id": 3, "same_rack": true
    }
  ]
}
```

### 6C — Cable creation (generic CRUD)

Cable creation uses the existing **`POST /api/v1/cables`** so changelog + naming apply automatically (Req 11.1, 9). The Connect_Panel maps the selection to the a/b shape:

Request body:
```json
{
  "cable_type": "copper",
  "port_a_type": "network-devices", "port_a_id": 12,
  "port_b_type": "physical-servers", "port_b_id": 44,
  "label_a": "sw1:1/0/1", "label_b": "srv1:eth0",
  "media_type": "cat6"
}
```

- `source → port_a_type / port_a_id`, `destination → port_b_type / port_b_id` (Req 8.4).
- `label_a` / `label_b` carry the from/to device+port references (Req 8.5).
- `cable_type` ∈ {copper, fiber, power, patchcord, structured} (Req 8.6).
- On flush, `naming.generate_cable` sets `label` (Req 9). Response is the created cable dict (via `crud.to_dict`).

`PATCH /api/v1/cables/{id}` and `DELETE /api/v1/cables/{id}` remain generic; update re-runs naming (Req 9.4) and every write records changelog rows (Req 11.2, 11.3).

### 6C — Cables_Viewer read (generic CRUD)

`GET /api/v1/cables?limit=5000` returns all cables; the Cables_Viewer applies rack/device filters client-side against the a/b device references (Req 10). No new endpoint required.

## Frontend Component Breakdown

### 6A — Front/Back toggle + back-face dots

`RackView.tsx`:
- Add `const [face, setFace] = useState<"front"|"back">("front")` (Req 1.2) and a segmented Front/Back control above the diagram grid (Req 1.1). The toggle flips to the opposite value (Req 1.3).
- Fetch `device-interfaces` and `power-outlets` (via `api.list`) alongside the existing `racks` / `rack-units` queries. Map each port to its owning device with the **Ownership resolution rule**, then to a rack with **resolution rule A** (device `rack_id` when present, else the matching `rack_units` (`device_table`,`device_id`) row; `PowerOutlet` uses its own `rack_id`). Index ports by `rack_id` so `RackDiagramSVG` can look up the ports for the rack it renders.
- Pass `face`, plus `interfaces` and `outlets` for the rack, into `RackDiagramSVG` (Req 1.4).

`RackDiagramSVG.tsx`:
- New props: `face: "front" | "back"`, `interfaces: Row[]`, `outlets: Row[]`, `stencilUrlByType?: Record<string,string>`, `onPortClick?: (port) => void`.
- `face === "front"` (Req 6.6): render the current rectangles, or an SVG `<image href={stencilHref}>` when the device type has a resolved stencil (6B, Req 3.2).
- `face === "back"` (Req 1.5): for each device resolved into this rack (via **resolution rule A**), draw one Port_Connector_Dot per owned `DeviceInterface` (Req 2.1) and per associated `PowerOutlet` (Req 2.2), positioned within the device's U block. Dot color by Port_Type: copper→blue `#2563eb`, fiber→orange `#f97316`, power→yellow `#eab308` (Req 2.3–2.5). Port_Type derives from the interface `speed`/media (copper vs fiber) and from PowerOutlet being inherently `power`.
- Hover (Req 7): `onMouseEnter` sets a local `hoveredPort`, rendering an SVG `<title>` / floating `<text>` with the port label; `onMouseLeave` clears it (Req 7.2). Only active while `face === "back"` (Req 7.1).
- Click a dot → `onPortClick(port)` bubbles to `RackView`, which opens the Connect_Panel (Req 8.1).

### 6B — StencilField (admin)

`StencilField.tsx`, embedded on the device-type detail/edit surface:
- A URL input bound to `stencil_url`, persisted via `api.update("network-device-types", id, { stencil_url })` (Req 3.4).
- An SVG file picker that `POST`s to `/api/v1/stencils/{model_slug}` (Req 5.1). On success, invalidates the relevant TanStack Query keys so the diagram re-fetches.

### 6C — ConnectPanel + CablesViewer

`ConnectPanel.tsx`:
- Opened with the source port; calls `api.portCandidates(source)` → renders candidates grouped **same rack** first, then **same datacenter** (Req 8.2, 8.3), each with owner name, port label, and Port_Type swatch.
- Selecting a candidate + a `cable_type` submits `api.create("cables", body)` mapping source→A / destination→B (Req 8.4–8.6). On success, invalidate `["cables"]` and the rack/port queries.
- The panel disables/omits the source port from its own candidate list; the backend also rejects source==destination with `400` (Req 8.7).

`CablesViewer.tsx`:
- Renders `EntityGrid` over `cables` with `from` and `to` columns derived from `label_a` / `label_b` (Req 10.1).
- Rack filter and device filter dropdowns; a cable matches when *either* end's device is in the selected rack (Req 10.2) or matches the selected device (Req 10.3). No filter → all cables (Req 10.4).

### `api.ts` additions

```typescript
stencilUrl: (modelSlug: string) => `${BASE}/stencils/${modelSlug}`,           // GET href for <image>
uploadStencil: (modelSlug: string, file: File): Promise<Row> => { /* multipart POST */ },
portCandidates: (source: {source_type; source_id; source_port_kind; source_port_id}) =>
  fetch(`${BASE}/ports/candidates?...`).then(handle),
```

## Port-to-Port Connect Flow (Sequence)

```
Operator            RackView            RackDiagramSVG        api.ts / backend            crud.py + naming.py
   |  toggle Back      |                     |                      |                          |
   |------------------>| setFace("back")     |                      |                          |
   |                   |-- face=back ------->| draw port dots        |                          |
   |  click dot        |                     |                      |                          |
   |----------------------------------------->| onPortClick(src)    |                          |
   |                   |<-- open ConnectPanel(src) ----------------- |                          |
   |                   |-- portCandidates(src) ---------------------->| GET /ports/candidates    |
   |                   |                     |                      | resolve rack+dc, list ports|
   |                   |<-- candidates -------------------------------|                          |
   |  pick dest+type   |                     |                      |                          |
   |------------------>| create cable        |                      |                          |
   |                   |-- api.create("cables", {A=src,B=dest,type})->| POST /api/v1/cables      |
   |                   |                     |                      |-- crud.create_item ------>| flush → apply_naming
   |                   |                     |                      |                          | generate_cable → label
   |                   |                     |                      |                          | _log(create) per field
   |                   |<-- created cable ----------------------------|<-------------------------|
   |                   |-- invalidate ["cables"], rack/port queries   |                          |
```

## Cable_Label Naming (`naming.py`)

Add a generator and register it in the `GENERATORS` dispatch table so the existing `crud` create/update path invokes it (Req 9.1–9.4):

```python
async def generate_cable(session: AsyncSession, cable: models.Cable) -> None:
    """Cable_Label = {from_device_name}-{from_port}→{to_device_name}-{to_port}."""
    from_name = await _device_name(session, cable.port_a_type, cable.port_a_id)
    to_name   = await _device_name(session, cable.port_b_type, cable.port_b_id)
    from_port = cable.label_a or ""
    to_port   = cable.label_b or ""
    cable.label = f"{from_name}-{from_port}→{to_name}-{to_port}"

GENERATORS = {
    ...,
    models.Cable: generate_cable,
}
```

`_device_name` resolves a display name from the polymorphic (`port_*_type`, `port_*_id`) reference by mapping the slug to its model via `ENTITY_REGISTRY` and reading its best name field (`vf_long_name` / `vf_short_name` / `name`). Because `apply_naming` is called on both create and update, changing any of the four inputs regenerates the label (Req 9.4). No changes to the naming *preview* path are required.

## Error Handling

| Condition | Handling | Requirement |
| --- | --- | --- |
| Stencil requested, not cached, no `stencil_url` or Visio_Cafe unreachable | `404` | 4.3 |
| Stencil download timeout/HTTP error | Treated as unreachable → `404`; existing cache still served | 4.3, 4.4 |
| Upload not SVG (content type nor `<svg` root) | `400` | 5.2 |
| `model_slug` fails charset (path-traversal guard) | `400` | 4/5 |
| `cable_type` not in {copper, fiber, power, patchcord, structured} | `422` from a validator in the cable create path | 8.6 |
| source port == destination port | `400` | 8.7 |
| source port cannot be located to any rack | `404` (source not locatable) | 8.2, 8.3 |
| source rack has no datacenter (only site, or nothing) | scope falls back to same site, else same rack only (no 404) | 8.3 |
| Migration re-run on already-migrated DB | Idempotent guards skip existing objects | 6.3 |
| Downgrade with NULL `network_device_id` present | Leave column nullable (no data loss) | 6.2, 6.3 |

Network fetches to Visio_Cafe use a short timeout and catch all connection errors so the service degrades to cache-only behavior when air-gapped (Req 4.4). Cable-type validation is enforced in a small guard invoked from the create path (a lightweight check, since the `Cable` a/b shape is preserved without an enum migration).

## Changelog / Naming Hook Points

- **Changelog (Req 11):** cable create/update/delete go through `crud.create_item` / `update_item` / `delete_item`, each of which calls `crud._log(...)` per changed field (create logs every field; delete logs a `__deleted__` marker). No extra wiring is needed beyond keeping cable writes on the generic CRUD route.
- **Naming (Req 9):** `naming.GENERATORS[models.Cable] = generate_cable`. `crud.create_item` and `crud.update_item` both call `naming.apply_naming(session, obj)` after flush, so the Cable_Label is generated on create and regenerated whenever a contributing field changes.
- **Stencil upload / port candidates** are non-CRUD `special.py` endpoints; they do not mutate audited CRUD rows (uploads write to the filesystem Stencil_Cache), so they do not require changelog entries. Setting `stencil_url` *is* audited because it goes through generic CRUD (Req 3.4).

## Testing Strategy

**Dual approach:** property-based tests for input-varying logic, example/integration tests for endpoints and infrastructure-shaped behavior.

### Backend endpoint tests (`pytest` + async client)
- Stencil_Service: cached hit serves file; cache miss + mocked reachable Visio_Cafe downloads/caches/serves; cache miss + mocked unreachable → `404`; upload non-SVG → `400`; upload then `GET` serves without network (mock asserts no outbound call).
- Port candidates: same-rack and same-datacenter ports appear, other-datacenter ports excluded, source port excluded.
- Cable creation via `POST /api/v1/cables`: A/B mapping correct, invalid `cable_type` → `422`, source==destination → `400`, changelog rows written for create/update/delete.

### Property-based tests
- **Cable_Label round-trip / format:** for any from-device, from-port, to-device, to-port, the generated `label` equals `{from}-{from_port}→{to}-{to_port}` (see Correctness Property 4).
- **Port ownership resolution:** for any interface, the resolved owner is the polymorphic pair when set, else the network device (Property 3).
- **Candidate scope:** for any generated rack/datacenter topology, every returned candidate is in the same rack or same datacenter and never the source (Property 2).
- Property tests run ≥100 iterations and are tagged `Feature: rack-back-and-cabling, Property {n}: {text}`.

### Migration test
- Apply `0006` to a database seeded with legacy `device_interfaces` rows (non-null `network_device_id`); assert each row is backfilled with `owner_device_type = "network-devices"` and `owner_device_id = network_device_id`, that `network_device_id` is now nullable, and that re-running the migration is a no-op.

### Frontend component tests (Vitest + Testing Library)
- `RackView` renders a Front/Back toggle, defaults to front, and flips on activation.
- `RackDiagramSVG` on `face="back"` draws one dot per interface + outlet with the correct color; on `face="front"` draws no dots and uses `<image>` when a stencil is present, a rect otherwise.
- Hovering a dot shows the port label and moving away hides it.
- `ConnectPanel` lists candidates grouped by rack/datacenter and submits the correct A/B body.
- `CablesViewer` filters rows by rack and by device and shows all when unfiltered.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Back-face dot color matches port type

For any device mounted in a rack, when the Rack_Diagram is rendered with `face = "back"`, every Port_Connector_Dot is blue when its Port_Type is copper, orange when fiber, and yellow when power; and when `face = "front"` no Port_Connector_Dots are rendered.

**Validates: Requirements 2.3, 2.4, 2.5, 6.6**

### Property 2: Connect candidates are scoped and exclude the source

For any topology of racks, datacenters, and ports, the candidate destination ports returned for a locatable source port are exactly those owned by devices in the same rack, or — when the source rack has a resolvable datacenter — in the same datacenter (falling back to same site, then to same rack only, when no datacenter resolves), and never include the source port itself.

**Validates: Requirements 8.2, 8.3, 8.7**

### Property 3: Port ownership resolution is deterministic

For any Device_Interface, its resolved owning device is the record identified by (`owner_device_type`, `owner_device_id`) when both are set, and otherwise the network device identified by `network_device_id`; a Device_Interface with a non-null `network_device_id` always resolves to that network device unless an explicit owner pair overrides it.

**Validates: Requirements 6.1, 6.2, 6.4, 6.5**

### Property 4: Cable_Label formatting round-trip

For any created or updated Cable, the stored Cable_Label equals `{from_device_name}-{from_port}→{to_device_name}-{to_port}` computed from the source device name, source port, destination device name, and destination port; changing any of those four inputs regenerates a label consistent with the new values.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4**

### Property 5: Cable end mapping preserves source and destination

For any connect operation from a source port to a destination port, the created Cable maps the source to (`port_a_type`, `port_a_id`) and the destination to (`port_b_type`, `port_b_id`), stores the from/to device references, and stores a `cable_type` in {copper, fiber, power, patchcord, structured}.

**Validates: Requirements 8.4, 8.5, 8.6**

### Property 6: Stencil resolution is cache-first and air-gap safe

For any model slug whose stencil is present in the Stencil_Cache, the Stencil_Service serves the cached file regardless of Visio_Cafe reachability and without contacting Visio_Cafe; for any model slug absent from the cache, the service downloads and caches when Visio_Cafe is reachable and returns HTTP 404 when it is not.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.3**

### Property 7: Cable operations are audited

For any create, update, or delete of a Cable through the Cable_Service, the Changelog_System records a corresponding entry for that Cable record.

**Validates: Requirements 11.1, 11.2, 11.3**
