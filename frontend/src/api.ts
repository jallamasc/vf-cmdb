// Lightweight typed fetch client for the CMDB REST API.
const BASE = "/api/v1";

export type Row = Record<string, any>;

/**
 * Result of GET /naming/generate?entity_type=… — what an entity *would* be
 * called for the currently selected foreign keys. Nothing is persisted.
 * ``generated`` is false for hierarchy levels outside the naming chain
 * (floor / room), which only get a readable ``path``.
 */
export interface NamePreview {
  entity_type: string;
  resource: string;
  /** FEAT-1: the site code the tri-mode selector would store. */
  simple_name: string | null;
  vf_long_name: string | null;
  vf_short_name: string | null;
  tia606b_name: string | null;
  vf_friendly_name: string | null;
  path: string;
  missing: string[];
  complete: boolean;
  generated: boolean;
}

/** FEAT-1: how a site's ``simple_name`` is produced. */
export type SiteCodeType = "auto" | "custom" | "theme";

/** FEAT-1: result of GET /naming/site-code. */
export interface SiteCodeResult {
  org_id: number | null;
  campus_id: number | null;
  region_id: number | null;
  site_code: string;
  missing: string[];
  complete: boolean;
}

/** FEAT-3: one entry of a themed name catalogue. */
export interface ThemeName {
  name: string;
  category: string;
  label: string;
}

/** FEAT-3: a themed name catalogue tab. */
export interface ThemeCategory {
  category: string;
  label: string;
  count: number;
}

/** FEAT-3: result of GET /naming/theme-names. */
export interface ThemeNamesResult {
  category: string | null;
  q: string;
  categories: ThemeCategory[];
  count: number;
  names: ThemeName[];
}

/** FEAT-5: one airport of the built-in catalogue. */
export interface Airport {
  iata: string;
  city: string;
  country: string;
  name: string;
}

/** FEAT-5: result of GET /naming/airport-code. */
export interface AirportCodeResult {
  query: string;
  city: string;
  iata_code: string | null;
  airport: string | null;
  country: string | null;
  alternatives: Airport[];
  matches: Airport[];
}

/**
 * FEAT-7 — the four device types that have a detail dashboard. These are the
 * underscored keys used in the ``/devices/:type/:id`` route; the backend also
 * accepts the kebab-case API slug.
 */
export type DeviceTypeKey =
  | "physical_servers"
  | "virtual_machines"
  | "workstations"
  | "network_devices";

export const DEVICE_TYPE_KEYS: DeviceTypeKey[] = [
  "physical_servers",
  "virtual_machines",
  "workstations",
  "network_devices",
];

/** FEAT-7 — resolved parent chain of a device, for the dashboard header. */
export interface DeviceContext {
  site: string | null;
  datacenter: string | null;
  room: string | null;
  rack: string | null;
  rack_unit: number | null;
  host_server: string | null;
  /** All of the above joined for a one-line breadcrumb. */
  position: string | null;
}

/** FEAT-7 — result of GET /devices/{type}/{id}. */
export interface DeviceDetail {
  device_type: DeviceTypeKey;
  /** Kebab-case CRUD slug of the device itself (``physical-servers``). */
  resource: string;
  table: string;
  label: string;
  id: number;
  display_name: string;
  /** Generated-name columns this model actually has, most significant first. */
  name_fields: string[];
  /** Tabs that can hold data for this device type. */
  relations: string[];
  /** relation name -> the CRUD slug writes must go to. */
  relation_resources: Record<string, string>;
  context: DeviceContext;
  record: Row;
}

/** FEAT-7 — result of GET /devices/{type}/{id}/related/{relation}. */
export interface DeviceRelated {
  device_type: DeviceTypeKey;
  device_id: number;
  relation: string;
  /** CRUD slug the rows live in, or null for read-only relations. */
  resource: string | null;
  count: number;
  rows: Row[];
  /** False when the rows are reachable but not owned by this device. */
  owned: boolean;
  /** Foreign key a new row must carry, or null when adding is not possible. */
  fk_field: string | null;
  /** Human explanation of what the relation contains. */
  note: string;
  /** Polymorphic discriminator a new IP assignment must carry. */
  assigned_to_type?: string;
  /** Polymorphic discriminator a new cable end must carry. */
  port_type?: string;
}

/** FEAT-6 (6C) / Phase 4 Task 21 — a port that a source port may be cabled to. */
export interface PortCandidate {
  port_kind: "interface" | "outlet" | "patch_panel_port";
  port_id: number;
  owner_type: string;
  owner_id: number | null;
  owner_name: string;
  label: string;
  /** copper | fiber | power — drives the connector dot colour. */
  port_type: string;
  rack_id: number;
  same_rack: boolean;
}

/** FEAT-6 (6C) — result of GET /ports/candidates. */
export interface PortCandidatesResult {
  source: {
    device_type: string;
    device_id: number;
    port_kind: string;
    port_id: number;
    rack_id: number | null;
    datacenter_id: number | null;
    site_id: number | null;
  };
  /** Which scope produced the candidates: rack | datacenter | site. */
  scope: string;
  candidates: PortCandidate[];
}

/** Phase 4 Req 22 — a curated stencil source. */
export type StencilLibrarySource = "github" | "visiocafe";

/** Phase 4 Req 22 — one category from GET /stencil-library/categories. */
export interface StencilLibraryCategory {
  key: string;
  label: string;
}

/** Phase 4 Req 22 — one .vss/.vssx file from GET .../categories/{cat}/files. */
export interface StencilLibraryFile {
  name: string;
  size: number | null;
}

/** Phase 4 Req 22 — one converted shape preview from POST .../fetch. */
export interface StencilLibraryShape {
  title: string;
  preview_url: string;
}

/** Phase 4 Req 22 — result of POST /stencil-library/fetch. */
export interface StencilLibraryFetchResult {
  token: string;
  source: string;
  category: string;
  file: string;
  shapes: StencilLibraryShape[];
}

/** FEAT-6 (6C) / Phase 4 Task 21 — a source port handed to the Connect panel. */
export interface SourcePort {
  source_type: string;
  source_id: number;
  source_port_kind: "interface" | "outlet" | "patch_panel_port";
  source_port_id: number;
}

async function handle(res: Response) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  list: (resource: string): Promise<Row[]> =>
    fetch(`${BASE}/${resource}?limit=5000`).then(handle),
  get: (resource: string, id: number): Promise<Row> =>
    fetch(`${BASE}/${resource}/${id}`).then(handle),
  create: (resource: string, payload: Row): Promise<Row> =>
    fetch(`${BASE}/${resource}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),
  update: (resource: string, id: number, payload: Row): Promise<Row> =>
    fetch(`${BASE}/${resource}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),
  remove: (resource: string, id: number): Promise<null> =>
    fetch(`${BASE}/${resource}/${id}`, { method: "DELETE" }).then(handle),
  dashboard: () => fetch(`${BASE}/dashboard/summary`).then(handle),
  changelog: (params = "") =>
    fetch(`${BASE}/changelog${params}`).then(handle),
  ansibleInventory: () => fetch(`${BASE}/ansible/inventory`).then(handle),
  nextIp: (subnetId: number) =>
    fetch(`${BASE}/ipam/subnets/${subnetId}/next-ip`).then(handle),
  utilization: (subnetId: number) =>
    fetch(`${BASE}/ipam/subnets/${subnetId}/utilization`).then(handle),
  // --- Reservations (reserved pool) ---
  reservations: (subnetId: number, family: "ipv4" | "ipv6" = "ipv4"): Promise<Row[]> =>
    fetch(`${BASE}/ipam/subnets/${subnetId}/reservations?family=${family}`).then(handle),
  createReservation: (
    subnetId: number,
    payload: Row,
    family: "ipv4" | "ipv6" = "ipv4",
  ): Promise<Row> =>
    fetch(`${BASE}/ipam/subnets/${subnetId}/reservations?family=${family}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteReservation: (
    subnetId: number,
    reservationId: number,
    family: "ipv4" | "ipv6" = "ipv4",
  ): Promise<null> =>
    fetch(
      `${BASE}/ipam/subnets/${subnetId}/reservations/${reservationId}?family=${family}`,
      { method: "DELETE" },
    ).then(handle),
  nextReserved: (subnetId: number, family: "ipv4" | "ipv6" = "ipv4") =>
    fetch(`${BASE}/ipam/subnets/${subnetId}/next-reserved?family=${family}`).then(handle),
  naming: (qs: string) => fetch(`${BASE}/naming/generate?${qs}`).then(handle),
  /**
   * Live name preview for an entity that has not been created yet (UX-4).
   * ``params`` are model columns (site_id, organization_id, code, …); empty
   * and null values are dropped so a half-filled form still previews.
   */
  generateNames: (
    entityType: string,
    params: Record<string, unknown>,
  ): Promise<NamePreview> => {
    const qs = new URLSearchParams({ entity_type: entityType });
    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value != null) qs.set(key, String(value));
    });
    return fetch(`${BASE}/naming/generate?${qs.toString()}`).then(handle);
  },
  /**
   * FEAT-1 — the automatic site code (``vfhmcc1``) for an org/campus/region
   * combination. Pass ``siteId`` when editing so the row's own code is not
   * counted as taken. Nothing is persisted.
   */
  siteCode: (
    orgId?: number | null,
    campusId?: number | null,
    regionId?: number | null,
    siteId?: number | null,
  ): Promise<SiteCodeResult> => {
    const qs = new URLSearchParams();
    if (orgId != null) qs.set("org_id", String(orgId));
    if (campusId != null) qs.set("campus_id", String(campusId));
    if (regionId != null) qs.set("region_id", String(regionId));
    if (siteId != null) qs.set("site_id", String(siteId));
    return fetch(`${BASE}/naming/site-code?${qs.toString()}`).then(handle);
  },
  /**
   * FEAT-3 — search the built-in themed name catalogues. Omit ``category`` to
   * search every theme at once.
   */
  themeNames: (category = "", q = "", limit = 200): Promise<ThemeNamesResult> => {
    const qs = new URLSearchParams({ q, limit: String(limit) });
    if (category) qs.set("category", category);
    return fetch(`${BASE}/naming/theme-names?${qs.toString()}`).then(handle);
  },
  /**
   * FEAT-5 — resolve a city to the IATA code of its main airport, with
   * ``matches`` for autocomplete and ``alternatives`` for multi-airport cities.
   */
  airportCode: (city: string, limit = 25): Promise<AirportCodeResult> =>
    fetch(
      `${BASE}/naming/airport-code?city=${encodeURIComponent(city)}&limit=${limit}`,
    ).then(handle),
  // Abbreviation preview: derive a short code from a full name by trim mode.
  previewAbbrev: (
    fullName: string,
    trimMode: string,
    caseEnforcement: string,
  ): Promise<{ abbreviation: string }> =>
    fetch(
      `${BASE}/naming/preview?full_name=${encodeURIComponent(fullName)}` +
        `&trim_mode=${encodeURIComponent(trimMode)}` +
        `&case_enforcement=${encodeURIComponent(caseEnforcement)}`,
    ).then(handle),
  // Global uniqueness check for an abbreviation/code value.
  checkAbbrev: (
    value: string,
    entityType = "",
    entityId?: number,
  ): Promise<{ value: string; available: boolean; owner: Row | null }> => {
    let qs = `value=${encodeURIComponent(value)}`;
    if (entityType) qs += `&entity_type=${encodeURIComponent(entityType)}`;
    if (entityId != null) qs += `&entity_id=${entityId}`;
    return fetch(`${BASE}/naming/check-abbreviation?${qs}`).then(handle);
  },
  // Sequence-number gap detection for a device naming prefix.
  gaps: (
    prefix: string,
  ): Promise<{
    prefix: string;
    used: number[];
    gaps: number[];
    next_gap: number | null;
    next_sequential: number;
    recommended: number;
    message: string;
  }> => fetch(`${BASE}/naming/gaps?prefix=${encodeURIComponent(prefix)}`).then(handle),
  /**
   * FEAT-7 — one device with every column, its resolved location and the list
   * of tabs that apply to its type. ``type`` may be either the underscored
   * route key or the kebab-case CRUD slug.
   */
  deviceDetail: (type: string, id: number): Promise<DeviceDetail> =>
    fetch(`${BASE}/devices/${type}/${id}`).then(handle),
  /**
   * FEAT-7 — records related to one device, already filtered server-side by
   * the device's id (and polymorphic discriminator where one exists).
   */
  deviceRelated: (
    type: string,
    id: number,
    relation: string,
    limit = 500,
  ): Promise<DeviceRelated> =>
    fetch(`${BASE}/devices/${type}/${id}/related/${relation}?limit=${limit}`).then(handle),
  /**
   * FEAT-6 (6B) — URL of a device model's stencil SVG, for embedding in an
   * <image href>. The GET endpoint serves cache-first (air-gap safe) and 404s
   * when no stencil is available. Phase 4 Req 14: `face` selects front
   * (default) or back — the two are cached and served independently.
   */
  stencilUrl: (modelSlug: string, face: "front" | "back" = "front"): string =>
    `${BASE}/stencils/${modelSlug}${face === "back" ? "?face=back" : ""}`,
  /**
   * FEAT-6 (6B) — upload an SVG stencil for a device model. Works offline; the
   * uploaded file is cached and served without contacting Visio Café.
   */
  uploadStencil: (
    modelSlug: string,
    file: File,
    face: "front" | "back" = "front",
  ): Promise<Row> => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/stencils/${modelSlug}?face=${face}`, {
      method: "POST",
      body: form,
    }).then(handle);
  },
  /** Phase 4 Req 19 — anchors mapped for a stencil owner (+ optional face). */
  stencilAnchors: (modelSlug: string, face?: "front" | "back"): Promise<Row[]> =>
    fetch(
      `${BASE}/stencils/${modelSlug}/anchors${face ? `?face=${face}` : ""}`,
    ).then(handle),
  /** Phase 4 Req 22 — stencil library: categories available from a source. */
  stencilLibraryCategories: (source: StencilLibrarySource): Promise<StencilLibraryCategory[]> =>
    fetch(`${BASE}/stencil-library/categories?source=${source}`).then(handle),
  /** Phase 4 Req 22 — .vss/.vssx files available in a category. */
  stencilLibraryFiles: (
    source: StencilLibrarySource,
    category: string,
  ): Promise<StencilLibraryFile[]> =>
    fetch(
      `${BASE}/stencil-library/categories/${encodeURIComponent(category)}/files?source=${source}`,
    ).then(handle),
  /**
   * Phase 4 Req 22 — fetch + convert a chosen stencil file into per-shape
   * SVG previews. Nothing is applied as a real stencil yet — the caller
   * picks exactly one preview and uploads it via `uploadStencil()`.
   */
  stencilLibraryFetch: (
    source: StencilLibrarySource,
    category: string,
    file: string,
  ): Promise<StencilLibraryFetchResult> =>
    fetch(`${BASE}/stencil-library/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, category, file }),
    }).then(handle),
  /**
   * FEAT-6 (6C) — connectable destination ports for a source port. Scoped to
   * the same rack, else datacenter, else site (fallback).
   */
  portCandidates: (source: SourcePort): Promise<PortCandidatesResult> => {
    const qs = new URLSearchParams({
      source_type: source.source_type,
      source_id: String(source.source_id),
      source_port_kind: source.source_port_kind,
      source_port_id: String(source.source_port_id),
    });
    return fetch(`${BASE}/ports/candidates?${qs.toString()}`).then(handle);
  },
};
