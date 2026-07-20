// Lightweight typed fetch client for the CMDB REST API.
const BASE = "/api/v1";

export type Row = Record<string, any>;

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
  naming: (qs: string) => fetch(`${BASE}/naming/generate?${qs}`).then(handle),
};
