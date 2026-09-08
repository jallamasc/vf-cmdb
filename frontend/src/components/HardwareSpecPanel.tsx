import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, HardwareSpecLookupResult, Row } from "../api";

/**
 * Phase 6 Task 33/37 (Req 13.1/13.2/13.3) — category-appropriate structured
 * spec fields for a device-type row, plus a "Look up online" flow
 * (Icecat first, Brave Search fallback) that only ever shows PROPOSED
 * data — nothing here is auto-applied to a field. The operator reads the
 * proposal and, if they want it, types the value into the real field
 * themselves; that field's own save (onBlur) is the only thing that ever
 * writes to the database, so "requires operator confirmation before
 * saving any proposed value" (Req 13.3) holds in the strictest possible
 * sense — there is no code path from a lookup result straight into a
 * PATCH.
 */
interface SpecField {
  field: string;
  label: string;
  kind: "number" | "text" | "boolean";
}

const SPEC_FIELDS_BY_RESOURCE: Record<string, SpecField[]> = {
  "compute-device-types": [
    { field: "rack_units", label: "Rack Units (U)", kind: "number" },
    { field: "cpu_sockets", label: "CPU Sockets", kind: "number" },
    { field: "max_cpu_cores", label: "Max CPU Cores", kind: "number" },
    { field: "max_memory_gb", label: "Max Memory (GB)", kind: "number" },
    { field: "drive_bays", label: "Drive Bays", kind: "number" },
    { field: "max_power_watts", label: "Max Power (W)", kind: "number" },
  ],
  "network-device-types": [
    { field: "rack_units", label: "Rack Units (U)", kind: "number" },
    { field: "port_count", label: "Port Count", kind: "number" },
    { field: "port_speed_gbps", label: "Port Speed (Gbps)", kind: "number" },
    { field: "poe_supported", label: "PoE Supported", kind: "boolean" },
    { field: "max_power_watts", label: "Max Power (W)", kind: "number" },
  ],
  "storage-device-types": [
    { field: "rack_units", label: "Rack Units (U)", kind: "number" },
    { field: "capacity_tb", label: "Capacity (TB)", kind: "number" },
    { field: "drive_bays", label: "Drive Bays", kind: "number" },
    { field: "interface_type", label: "Interface Type", kind: "text" },
    { field: "max_power_watts", label: "Max Power (W)", kind: "number" },
  ],
  "power-device-types": [
    { field: "rack_units", label: "Rack Units (U)", kind: "number" },
    { field: "capacity_va", label: "Capacity (VA)", kind: "number" },
    { field: "output_count", label: "Output Count", kind: "number" },
    { field: "input_voltage", label: "Input Voltage", kind: "text" },
  ],
};

/** Whether `resource` is one of the 4 device-type registries this panel
 * applies to (exported so callers can decide whether to render it at
 * all). */
export function hasHardwareSpecFields(resource: string): boolean {
  return resource in SPEC_FIELDS_BY_RESOURCE;
}

export default function HardwareSpecPanel({
  resource,
  row,
  onChanged,
}: {
  resource: string;
  row: Row;
  onChanged: () => void;
}) {
  const fields = SPEC_FIELDS_BY_RESOURCE[resource] ?? [];
  const [draft, setDraft] = useState<Row>(row);
  const [status, setStatus] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState(String(row.full_name ?? ""));
  const [lookupResult, setLookupResult] = useState<HardwareSpecLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (field: string) => api.update(resource, row.id, { [field]: draft[field] ?? null }),
    onSuccess: () => {
      setStatus("Saved");
      onChanged();
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Save failed"),
  });

  const lookup = useMutation({
    mutationFn: () => api.lookupHardwareSpecs(brand.trim(), model.trim()),
    onSuccess: (data) => {
      setLookupResult(data);
      setLookupError(null);
    },
    onError: (e: unknown) => {
      setLookupResult(null);
      setLookupError(e instanceof Error ? e.message : "Lookup failed");
    },
  });

  const commit = (field: string, kind: SpecField["kind"], raw: string | boolean) => {
    let value: unknown = raw;
    if (kind === "number") {
      const trimmed = String(raw).trim();
      value = trimmed === "" ? null : Number(trimmed);
      if (value !== null && Number.isNaN(value)) return;
    } else if (kind === "text") {
      const trimmed = String(raw).trim();
      value = trimmed === "" ? null : trimmed;
    }
    setDraft((d) => ({ ...d, [field]: value }));
    save.mutate(field);
  };

  return (
    <div className="border border-slate-200 rounded px-3 py-2 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Hardware specs</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {fields.map((f) => (
            <label key={f.field} className="text-xs text-slate-500">
              {f.label}
              {f.kind === "boolean" ? (
                <select
                  value={draft[f.field] == null ? "" : String(draft[f.field])}
                  onChange={(e) =>
                    commit(f.field, f.kind, e.target.value === "" ? "" : e.target.value === "true")
                  }
                  className="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm"
                >
                  <option value="">— unset —</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  type={f.kind === "number" ? "number" : "text"}
                  defaultValue={draft[f.field] ?? ""}
                  onBlur={(e) => commit(f.field, f.kind, e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm"
                />
              )}
            </label>
          ))}
        </div>
        {status && <p className="mt-1 text-xs text-slate-500">{status}</p>}
      </div>

      <div className="border-t border-slate-100 pt-2">
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
          Look up online (Icecat, then Brave Search)
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand (e.g. APC)"
            className="border border-slate-300 rounded px-2 py-1 text-sm flex-1 min-w-[9rem]"
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model / part code"
            className="border border-slate-300 rounded px-2 py-1 text-sm flex-1 min-w-[9rem]"
          />
          <button
            type="button"
            onClick={() => lookup.mutate()}
            disabled={lookup.isPending || !brand.trim() || !model.trim()}
            className="px-2.5 py-1 text-sm rounded bg-slate-800 text-white disabled:opacity-50"
          >
            {lookup.isPending ? "Looking up…" : "Look up"}
          </button>
        </div>

        {lookupError && <p className="mt-2 text-sm text-rose-600">{lookupError}</p>}

        {lookupResult && lookupResult.source === "icecat" && lookupResult.icecat && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-slate-500">
              Icecat found <span className="font-medium">{lookupResult.icecat.title}</span> —
              copy any values you want into the fields above (nothing here is applied
              automatically):
            </p>
            <ul className="text-xs text-slate-600 border border-slate-200 rounded divide-y divide-slate-100">
              {lookupResult.icecat.specs.map((s) => (
                <li key={s.name} className="px-2 py-1 flex justify-between gap-3">
                  <span className="text-slate-500">{s.name}</span>
                  <span className="font-medium">{s.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lookupResult && lookupResult.source === "brave" && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-slate-500">
              Icecat had no data — Brave Search links (read these yourself; nothing is
              auto-applied):
            </p>
            <ul className="text-xs space-y-1.5">
              {lookupResult.brave_results.map((r) => (
                <li key={r.url} className="border border-slate-200 rounded px-2 py-1.5">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {r.title}
                  </a>
                  {r.description && <p className="text-slate-500 mt-0.5">{r.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {lookupResult && lookupResult.source === "none" && (
          <p className="mt-2 text-sm text-slate-400 italic">
            No proposed data found online for this brand/model.
          </p>
        )}
      </div>
    </div>
  );
}
