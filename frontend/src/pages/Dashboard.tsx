import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const LABELS: Record<string, string> = {
  sites: "Sites",
  racks: "Racks",
  network_devices: "Network Devices",
  physical_servers: "Physical Servers",
  virtual_machines: "Virtual Machines",
  containers_apps: "Containers & Apps",
  workstations: "Workstations",
  vlans: "VLANs",
  subnets_ipv4: "IPv4 Subnets",
  subnets_ipv6: "IPv6 Subnets",
  ip_assignments: "IPs Assigned",
};

// Req 1.1: every dashboard count card navigates to that entity's section.
// Exported so a Vitest can assert every LABELS key resolves to a real route.
export const ROUTE_FOR_COUNT: Record<string, string> = {
  sites: "/sites",
  racks: "/racks",
  network_devices: "/network-devices",
  physical_servers: "/physical-servers",
  virtual_machines: "/virtual-machines",
  containers_apps: "/containers-apps",
  workstations: "/workstations",
  vlans: "/vlans",
  subnets_ipv4: "/subnets",
  subnets_ipv6: "/subnets",
  ip_assignments: "/ip-assignments",
};

// Req 1.2/1.3: recent-change rows carry a raw DB table_name; resolve it to a
// route. Device tables with a FEAT-7 detail dashboard link straight to the
// affected record; everything else links to its listing page (record id is
// not orderable there, but the operator lands in the right section).
const DEVICE_DASHBOARD_TABLES: Record<string, string> = {
  physical_servers: "physical_servers",
  virtual_machines: "virtual_machines",
  workstations: "workstations",
  network_devices: "network_devices",
};

const TABLE_TO_LISTING_ROUTE: Record<string, string> = {
  ...ROUTE_FOR_COUNT,
  cables: "/cables",
  device_interfaces: "/port-config",
  power_devices: "/power",
  patch_panels: "/patch-panels",
  containers_apps: "/containers-apps",
  site_addresses: "/reference-data",
  rack_types: "/reference-data",
  datacenters: "/hierarchy",
  datacenter_floors: "/hierarchy",
  rooms: "/hierarchy",
};

/**
 * Best route for a changelog row. Returns null when the table has no known
 * route, so the caller can render that row as non-interactive (Req 1.3).
 */
export function tableToRoute(tableName: string, recordId: number): string | null {
  const deviceType = DEVICE_DASHBOARD_TABLES[tableName];
  if (deviceType) return `/devices/${deviceType}/${recordId}`;
  return TABLE_TO_LISTING_ROUTE[tableName] ?? null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(),
  });

  if (isLoading) return <div className="text-slate-500">Loading dashboard…</div>;
  if (isError)
    return (
      <div className="px-3 py-2 bg-red-100 text-red-800 rounded">
        Failed to load dashboard: {(error as Error).message}
      </div>
    );

  const counts = data.counts as Record<string, number>;
  const recent = data.recent_changes as any[];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-slate-500 mb-6">
        Virtualfactor infrastructure at a glance.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Object.entries(LABELS).map(([key, label]) => {
          const route = ROUTE_FOR_COUNT[key];
          const breakdown = (data.breakdowns as Record<string, Record<string, number>> | undefined)?.[key];
          const card = (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 h-full">
              <div className="text-3xl font-bold text-blue-700">
                {counts[key] ?? 0}
              </div>
              <div className="text-sm text-slate-500 mt-1">{label}</div>
              {breakdown && Object.keys(breakdown).length > 0 && (
                <ul className="mt-2 pt-2 border-t border-slate-100 space-y-0.5">
                  {Object.entries(breakdown).map(([k, v]) => (
                    <li key={k} className="text-xs text-slate-500 flex justify-between gap-2">
                      <span className="truncate">{k}</span>
                      <span className="font-medium text-slate-700">{v}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
          return (
            <div key={key} className="block">
              {route ? (
                <Link
                  to={route}
                  className="block h-full transition hover:shadow-md hover:-translate-y-0.5 rounded-lg"
                  title={`Open ${label}`}
                >
                  {card}
                </Link>
              ) : (
                card
              )}
            </div>
          );
        })}
      </div>

      <h2 className="text-lg font-semibold mb-3">Recent Changes</h2>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">When</th>
              <th className="text-left px-3 py-2">Table</th>
              <th className="text-left px-3 py-2">Record</th>
              <th className="text-left px-3 py-2">Field</th>
              <th className="text-left px-3 py-2">Old → New</th>
              <th className="text-left px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                  No changes recorded yet.
                </td>
              </tr>
            )}
            {recent.map((c) => {
              const route = tableToRoute(c.table_name, c.record_id);
              const rowClass =
                "border-t border-slate-100" + (route ? " hover:bg-slate-50 cursor-pointer" : "");
              const cells = (
                <>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(c.changed_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{c.table_name}</td>
                  <td className="px-3 py-2">{c.record_id}</td>
                  <td className="px-3 py-2">{c.field_name}</td>
                  <td className="px-3 py-2 text-slate-600">
                    <span className="text-red-600">{c.old_value ?? "∅"}</span> →{" "}
                    <span className="text-green-700">{c.new_value ?? "∅"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-xs">
                      {c.change_source}
                    </span>
                  </td>
                </>
              );
              if (!route) {
                return <tr key={c.id} className={rowClass}>{cells}</tr>;
              }
              return (
                <tr
                  key={c.id}
                  className={rowClass}
                  onClick={() => navigate(route)}
                  title={`Open ${c.table_name} #${c.record_id}`}
                >
                  {cells}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
