import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export default function Ansible() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["ansible-inventory"],
    queryFn: () => api.ansibleInventory(),
  });

  const groups =
    data && typeof data === "object"
      ? Object.keys(data).filter((k) => k !== "_meta")
      : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-semibold">Ansible Dynamic Inventory</h1>
          <p className="text-sm text-slate-500">
            Live inventory in Ansible’s JSON format, grouped by role, site, OS
            and type. The <code>cmdb_inventory.py</code> script serves this same
            data to <code>ansible-playbook</code>.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isLoading && <div className="text-slate-500">Loading inventory…</div>}
      {isError && (
        <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {groups.map((g) => (
              <span
                key={g}
                className="px-2 py-0.5 bg-slate-200 rounded text-xs font-mono"
              >
                {g} ({(data as any)[g]?.hosts?.length ?? 0})
              </span>
            ))}
          </div>
          <pre className="flex-1 bg-slate-900 text-emerald-300 text-xs rounded-lg p-4 overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
