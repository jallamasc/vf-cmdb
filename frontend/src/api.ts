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
};
