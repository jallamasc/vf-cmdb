// Lightweight typed fetch client for the CMDB REST API.
const BASE = "/api/v1";

export type Row = Record<string, any>;

/**
 * Result of GET /naming/generate?entity_type=… — what an entity *would* be
 * called for the currently selected foreign keys. Nothing is persisted.
 * ``generated`` is false for hierarchy levels outside the naming chain
 * (room), which only get a readable ``path``.
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
  /** Phase 6 Task 13/14 — Floor/Section's generated code (F{n}/S{n}). */
  code: string | null;
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

/** Phase 6 Req 9.2/9.3 — one vendor in the curated ZIP registry. */
export interface StencilVendor {
  key: string;
  label: string;
}

/** Phase 6 Req 9.2/9.3 — one product line (its own ZIP) for a vendor. */
export interface StencilVendorProductLine {
  key: string;
  label: string;
}

/** Phase 6 Req 9.2 — result of POST .../product-lines/{line}/convert. */
export interface StencilVendorConvertResult {
  token: string;
  vendor: string;
  product_line: string;
  file: string;
  shapes: StencilLibraryShape[];
}

/** Phase 6 Task 30 (Req 12.1) — result of POST /os-data/sync. */
export interface OsDataSyncResult {
  families_created: string[];
  versions_created: string[];
  skipped_conflicts: string[];
  products_unreachable: string[];
}

/** Phase 6 Task 36 (Req 13.3) — one Icecat proposed spec pair. */
export interface HardwareSpecEntry {
  name: string;
  value: string;
}

/** Phase 6 Task 36 (Req 13.3) — one Icecat lookup result. */
export interface IcecatLookupResult {
  found: boolean;
  title: string | null;
  specs: HardwareSpecEntry[];
}

/** Phase 6 Task 36 (Req 13.3) — one Brave Search result (link + snippet
 * only — never an auto-parsed value). */
export interface BraveSearchResult {
  title: string;
  url: string;
  description: string | null;
}

/** Phase 6 Task 36 (Req 13.3) — result of POST /hardware-specs/lookup. */
export interface HardwareSpecLookupResult {
  source: "icecat" | "brave" | "none";
  icecat: IcecatLookupResult | null;
  brave_results: BraveSearchResult[];
}

/** FEAT-6 (6C) / Phase 4 Task 21 — a source port handed to the Connect panel. */
export interface SourcePort {
  source_type: string;
  source_id: number;
  source_port_kind: "interface" | "outlet" | "patch_panel_port";
  source_port_id: number;
}

/**
 * Phase 5 Task 39 (Req 31.1/31.3) — result of GET /automation/{resource}/{id}.
 * `configured` is true only when SEMAPHORE_URL/SEMAPHORE_API_TOKEN/project
 * are all set server-side; `semaphore_url`/`project_id` are exposed (as
 * non-secret config) so the frontend can build a deep link without
 * hardcoding them.
 */
export interface AutomationStatus {
  inventory_id: number | null;
  has_credential: boolean;
  configured: boolean;
  semaphore_url: string | null;
  project_id: number | null;
}

/**
 * Phase 5 Task 39 (Req 31.2) — one entry of GET /automation/{resource}/{id}/templates.
 * Passed through as-is from Semaphore's own `/project/{id}/templates`
 * response, which carries more fields than this — only `id`/`name` are
 * relied on here.
 */
export interface SemaphoreTemplate {
  id: number;
  name: string;
  [key: string]: unknown;
}

/**
 * Phase 5 Task 39 (Req 31.2) — a launched (or polled) Semaphore task, as
 * returned by POST .../launch and GET .../tasks/{id}. Passed through as-is
 * from Semaphore; `status` is one of Semaphore's own task states
 * (e.g. "waiting" | "running" | "success" | "error" | "stopped").
 */
export interface SemaphoreTask {
  id: number;
  status: string;
  template_id?: number;
  [key: string]: unknown;
}

/** Phase 5 Task 39 (Req 31.2) — one line of GET .../tasks/{id}/output. */
export interface SemaphoreTaskOutputLine {
  task_id: number;
  time: string;
  output: string;
  [key: string]: unknown;
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
   * (+ optional cloud/building/floor-section — round 4: the same
   * conformation VF Short Name itself uses) combination. Pass ``siteId``
   * when editing so the row's own code is not counted as taken. Nothing
   * is persisted.
   */
  siteCode: (
    orgId?: number | null,
    campusId?: number | null,
    regionId?: number | null,
    siteId?: number | null,
    cloudId?: number | null,
    buildingId?: number | null,
    floorSectionId?: number | null,
  ): Promise<SiteCodeResult> => {
    const qs = new URLSearchParams();
    if (orgId != null) qs.set("org_id", String(orgId));
    if (campusId != null) qs.set("campus_id", String(campusId));
    if (regionId != null) qs.set("region_id", String(regionId));
    if (siteId != null) qs.set("site_id", String(siteId));
    if (cloudId != null) qs.set("cloud_id", String(cloudId));
    if (buildingId != null) qs.set("building_id", String(buildingId));
    if (floorSectionId != null) qs.set("floor_section_id", String(floorSectionId));
    return fetch(`${BASE}/naming/site-code?${qs.toString()}`).then(handle);
  },
  /**
   * Naming-convention modifications (item 2/3) — a guaranteed-available
   * abbreviation suggestion derived from ``fullName``, for any lookup
   * dictionary (Organizations, Regions, Clouds, ...). Pass the row's own
   * ``maxLength``/``caseEnforcement`` so the suggestion already respects
   * them, and (when editing) ``entityType``/``entityId`` so the row's own
   * current abbreviation is never flagged as a collision with itself.
   */
  suggestAbbreviation: (
    fullName: string,
    opts?: {
      maxLength?: number | null;
      caseEnforcement?: string | null;
      entityType?: string;
      entityId?: number | null;
    },
  ): Promise<{ full_name: string; abbreviation: string }> => {
    const qs = new URLSearchParams({ full_name: fullName });
    if (opts?.maxLength != null) qs.set("max_length", String(opts.maxLength));
    if (opts?.caseEnforcement) qs.set("case_enforcement", opts.caseEnforcement);
    if (opts?.entityType) qs.set("entity_type", opts.entityType);
    if (opts?.entityId != null) qs.set("entity_id", String(opts.entityId));
    return fetch(`${BASE}/naming/suggest-abbreviation?${qs.toString()}`).then(handle);
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
   * Phase 5 Task 34 (Req 28.2/28.3) — fetch a record's default admin
   * credential on demand. Never persisted anywhere by the caller either.
   */
  revealCredential: (resource: string, id: number): Promise<{ username: string; password: string }> =>
    fetch(`${BASE}/credentials/${resource}/${id}/reveal`).then(handle),
  /** Rotate a record's default admin credential's value in place. */
  regenerateCredential: (resource: string, id: number): Promise<{ username: string; password: string }> =>
    fetch(`${BASE}/credentials/${resource}/${id}/regenerate`, { method: "POST" }).then(handle),
  /**
   * Phase 5 Task 39 (Req 31.1/31.3) — a record's automation sync status
   * plus the non-secret Semaphore config the frontend needs to build a
   * deep link, without hardcoding it.
   */
  automationStatus: (resource: string, id: number): Promise<AutomationStatus> =>
    fetch(`${BASE}/automation/${resource}/${id}`).then(handle),
  /** Semaphore templates available to launch against this record (Req 31.2). */
  automationTemplates: (resource: string, id: number): Promise<SemaphoreTemplate[]> =>
    fetch(`${BASE}/automation/${resource}/${id}/templates`).then(handle),
  /** Launch a template against this record's own Semaphore inventory. */
  launchAutomationTask: (resource: string, id: number, templateId: number): Promise<SemaphoreTask> =>
    fetch(`${BASE}/automation/${resource}/${id}/launch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId }),
    }).then(handle),
  /** Poll a launched task's status. */
  getAutomationTask: (resource: string, id: number, taskId: number): Promise<SemaphoreTask> =>
    fetch(`${BASE}/automation/${resource}/${id}/tasks/${taskId}`).then(handle),
  /** A launched task's live output lines. */
  getAutomationTaskOutput: (
    resource: string,
    id: number,
    taskId: number,
  ): Promise<SemaphoreTaskOutputLine[]> =>
    fetch(`${BASE}/automation/${resource}/${id}/tasks/${taskId}/output`).then(handle),
  /**
   * FEAT-5 — resolve a city to the IATA code of its main airport, with
   * ``matches`` for autocomplete and ``alternatives`` for multi-airport cities.
   *
   * Phase 5 Task 30 (Req 25.2) — an optional ``country`` scopes ``matches``
   * (and the resolved best match) to that country only.
   */
  airportCode: (city: string, limit = 25, country = ""): Promise<AirportCodeResult> =>
    fetch(
      `${BASE}/naming/airport-code?city=${encodeURIComponent(city)}&limit=${limit}` +
        (country ? `&country=${encodeURIComponent(country)}` : ""),
    ).then(handle),
  /**
   * Phase 5 Task 30 (Req 25.1) — every country in the built-in airport
   * catalogue, for the "Country" selector the City field now requires.
   */
  airportCountries: (): Promise<{ countries: string[] }> =>
    fetch(`${BASE}/naming/airport-countries`).then(handle),
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
  /**
   * Phase 5 Task 22/23 — URL of a record's uploaded photo, for embedding in
   * an <img src>. Unlike `stencilUrl`, this is exactly the value stored in
   * that record's own `photo_url` column (the upload endpoint sets it to
   * this same URL) — pass it straight through rather than reconstructing it
   * from `resource`/`id` here, so it keeps working if a record's photo_url
   * was set by hand (e.g. pasted) instead of via `uploadPhoto`.
   */
  photoUrl: (resource: string, id: number): string => `${BASE}/photos/${resource}-${id}`,
  /**
   * Phase 5 Task 22/23 — upload a photo for one record. Resource-agnostic:
   * works for any resource whose model has a `photo_url` column (currently
   * generic-entities; Task 23 adds it to the hardcoded device tables too).
   * Sets that record's `photo_url` server-side and returns it.
   */
  uploadPhoto: (
    resource: string,
    id: number,
    file: File,
  ): Promise<{ resource: string; id: number; photo_url: string }> => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/photos/${resource}/${id}`, {
      method: "POST",
      body: form,
    }).then(handle);
  },
  /**
   * Phase 5 Task 26/27 (Req 21.3/22.3) — URL of a record's uploaded
   * blueprint (floor plan), for embedding in an <img src>. Mirrors
   * `photoUrl` exactly, but for the separate `blueprint_url` column/asset
   * class (Floor/Room/Section, not a device).
   */
  blueprintUrl: (resource: string, id: number): string =>
    `${BASE}/blueprints/${resource}-${id}`,
  /** Phase 5 Task 26/27 — upload a blueprint for one record. Mirrors
   * `uploadPhoto`, sets that record's `blueprint_url`. */
  uploadBlueprint: (
    resource: string,
    id: number,
    file: File,
  ): Promise<{ resource: string; id: number; blueprint_url: string }> => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/blueprints/${resource}/${id}`, {
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
  /** Phase 6 Req 9.2 — vendors available in the curated ZIP registry. */
  stencilVendors: (): Promise<StencilVendor[]> =>
    fetch(`${BASE}/stencil-library/vendors`).then(handle),
  /** Phase 6 Req 9.2 — product lines (each its own ZIP) for one vendor. */
  stencilVendorProductLines: (vendor: string): Promise<StencilVendorProductLine[]> =>
    fetch(
      `${BASE}/stencil-library/vendors/${encodeURIComponent(vendor)}/product-lines`,
    ).then(handle),
  /**
   * Phase 6 Req 9.3 — download+extract ONLY this product line's ZIP (a
   * cache hit with no further network calls on repeat selection) and list
   * the .vss/.vssx files found inside it.
   */
  stencilVendorFiles: (vendor: string, productLine: string): Promise<string[]> =>
    fetch(
      `${BASE}/stencil-library/vendors/${encodeURIComponent(vendor)}/product-lines/${encodeURIComponent(
        productLine,
      )}/files`,
      { method: "POST" },
    ).then(handle),
  /**
   * Phase 6 Req 9.2 — convert one already-extracted vendor file into
   * per-shape SVG previews, through the SAME pipeline as
   * `stencilLibraryFetch()`.
   */
  stencilVendorConvert: (
    vendor: string,
    productLine: string,
    file: string,
  ): Promise<StencilVendorConvertResult> =>
    fetch(
      `${BASE}/stencil-library/vendors/${encodeURIComponent(vendor)}/product-lines/${encodeURIComponent(
        productLine,
      )}/convert`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      },
    ).then(handle),
  /**
   * Phase 6 Task 30 (Req 12.1) — manual trigger for the endoflife.date sync
   * (the automatic side runs once, at first seed — see seed.py). `products`
   * lets an administrator resync just one or a few slugs; omitted syncs the
   * full curated list.
   */
  syncOsData: (products?: string[]): Promise<OsDataSyncResult> =>
    fetch(`${BASE}/os-data/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: products ?? null }),
    }).then(handle),
  /**
   * Phase 6 Task 36 (Req 13.3) — Hardware_Spec_Lookup: Icecat first, Brave
   * Search fallback. Never saves anything — the caller shows the result as
   * PROPOSED data the operator must explicitly confirm before saving.
   */
  lookupHardwareSpecs: (brand: string, model: string): Promise<HardwareSpecLookupResult> =>
    fetch(`${BASE}/hardware-specs/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, model }),
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
