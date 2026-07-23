// Lightweight typed fetch client for the CMDB REST API.
const BASE = "/api/v1";

export type Row = Record<string, any>;
export type Family = "ipv4" | "ipv6";

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
  nextIp: (subnetId: number, family: Family = "ipv4", anchor?: string) => {
    let qs = `family=${family}`;
    if (anchor) qs += `&anchor=${encodeURIComponent(anchor)}`;
    return fetch(`${BASE}/ipam/subnets/${subnetId}/next-ip?${qs}`).then(handle);
  },
  utilization: (subnetId: number, family: Family = "ipv4") =>
    fetch(`${BASE}/ipam/subnets/${subnetId}/utilization?family=${family}`).then(
      handle,
    ),

  // ---- Site-scoped IPAM listings (Phase 2) ----
  ipamVlans: (siteId?: number | null): Promise<Row[]> => {
    const qs = siteId != null ? `?site_id=${siteId}` : "";
    return fetch(`${BASE}/ipam/vlans${qs}`).then(handle);
  },
  ipamSubnets: (
    siteId?: number | null,
    family: Family = "ipv4",
    vlanId?: number | null,
  ): Promise<Row[]> => {
    let qs = `?family=${family}`;
    if (siteId != null) qs += `&site_id=${siteId}`;
    if (vlanId != null) qs += `&vlan_id=${vlanId}`;
    return fetch(`${BASE}/ipam/subnets${qs}`).then(handle);
  },

  // ---- Reserved-IP pools (Phase 2) ----
  reservations: (subnetId: number, family: Family = "ipv4") =>
    fetch(
      `${BASE}/ipam/subnets/${subnetId}/reservations?family=${family}`,
    ).then(handle),
  nextReserved: (subnetId: number, family: Family = "ipv4") =>
    fetch(
      `${BASE}/ipam/subnets/${subnetId}/next-reserved?family=${family}`,
    ).then(handle),
  addReservation: (
    subnetId: number,
    payload: Row,
    family: Family = "ipv4",
  ): Promise<Row> =>
    fetch(`${BASE}/ipam/subnets/${subnetId}/reservations?family=${family}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(handle),
  removeReservation: (
    subnetId: number,
    resId: number,
    family: Family = "ipv4",
    force = false,
  ): Promise<null> =>
    fetch(
      `${BASE}/ipam/subnets/${subnetId}/reservations/${resId}` +
        `?family=${family}${force ? "&force=true" : ""}`,
      { method: "DELETE" },
    ).then(handle),
  naming: (qs: string) => fetch(`${BASE}/naming/generate?${qs}`).then(handle),
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
