import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";

export default function Changelog() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["changelog-full"],
    queryFn: () => api.changelog("?limit=1000"),
  });
  const [table, setTable] = useState("");
  const [source, setSource] = useState("");

  const rows: Row[] = data ?? [];
  const tables = useMemo(
    () => Array.from(new Set(rows.map((r) => r.table_name))).sort(),
    [rows]
  );
  const sources = useMemo(
    () => Array.from(new Set(rows.map((r) => r.change_source))).sort(),
    [rows]
  );

  const filtered = rows.filter(
    (r) =>
      (!table || r.table_name === table) &&
      (!source || r.change_source === source)
  );

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-xl font-semibold mb-1">Changelog</h1>
      <p className="text-sm text-slate-500 mb-3">
        Every create, update and delete is recorded automatically, including
        changes pushed in by Ansible fact collection.
      </p>

      <div className="flex gap-3 mb-3">
        <select
          value={table}
          onChange={(e) => setTable(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="">All tables</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500 self-center">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
        </span>
      </div>

      {isLoading && <div className="text-slate-500">Loading…</div>}
      {isError && (
        <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
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
              {filtered.map((c) => (
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
      )}
    </div>
  );
}
