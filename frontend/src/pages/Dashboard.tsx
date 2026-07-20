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

export default function Dashboard() {
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
        {Object.entries(LABELS).map(([key, label]) => (
          <div
            key={key}
            className="bg-white rounded-lg shadow-sm border border-slate-200 p-4"
          >
            <div className="text-3xl font-bold text-blue-700">
              {counts[key] ?? 0}
            </div>
            <div className="text-sm text-slate-500 mt-1">{label}</div>
          </div>
        ))}
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
            {recent.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
