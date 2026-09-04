/**
 * FEAT-7 — the Overview tab of the Device Detail Dashboard.
 *
 * Renders one device as an inline-editable *form* (not a grid): every column of
 * the model gets a labelled input grouped into sections, with the generated
 * names shown large at the top.
 *
 * Saving goes through the ordinary CRUD route (``PATCH /api/v1/{resource}/{id}``)
 * one field at a time, exactly like the grids do, so the changelog and the
 * naming engine keep working untouched. Text inputs commit on blur (or Enter);
 * dropdowns commit immediately.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";
import type { DeviceDetail } from "../api";
import { friendlyError } from "./EntityGrid";
import { useLookups, lookupLabel } from "../lib/columns";
import {
  DEVICE_SCHEMAS,
  TIA606B_NOTE,
  schemaFields,
} from "../lib/deviceSchema";
import type { DeviceField, DeviceSection } from "../lib/deviceSchema";

interface Props {
  detail: DeviceDetail;
}

const INPUT_CLASS =
  "w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none " +
  "focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:bg-slate-50";

/** Render a stored value as the string an <input> should show. */
function toInputValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function DeviceOverviewForm({ detail }: Props) {
  const schema = DEVICE_SCHEMAS[detail.device_type];
  const qc = useQueryClient();
  const { map, isLoading: lookupsLoading } = useLookups(schema.lookups);

  // Local edit buffer so a half-typed value is not thrown away by a refetch.
  const [draft, setDraft] = useState<Row>(detail.record);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Re-seed whenever the server sends a new version of the record (e.g. after
  // a save regenerates vf_long_name).
  useEffect(() => setDraft(detail.record), [detail.record]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const save = useMutation({
    mutationFn: ({ field, value }: { field: string; value: unknown }) =>
      api.update(schema.resource, detail.id, { [field]: value }),
    onSuccess: (_data, vars) => {
      setError(null);
      setSaved(vars.field);
      qc.invalidateQueries({ queryKey: ["device", detail.device_type, detail.id] });
      qc.invalidateQueries({ queryKey: [schema.resource] });
    },
    onError: (e: Error) => {
      setError(friendlyError(e.message));
      // Drop the rejected edit so the form shows what is actually stored.
      setDraft(detail.record);
    },
  });

  /** Commit one field if it actually changed. */
  const commit = (f: DeviceField, raw: string) => {
    const trimmed = raw.trim();
    let value: unknown = trimmed === "" ? null : trimmed;
    if (f.kind === "number" && value != null) {
      const n = Number(value);
      if (Number.isNaN(n)) {
        setError(`“${f.label}” must be a number.`);
        setDraft(detail.record);
        return;
      }
      value = n;
    }
    const current = detail.record[f.field] ?? null;
    if (String(current ?? "") === String(value ?? "")) return;
    setDraft((d) => ({ ...d, [f.field]: value }));
    save.mutate({ field: f.field, value });
  };

  /** Options for a foreign-key dropdown, sorted by their human label. */
  const optionsFor = (f: DeviceField) => {
    const rows: Row[] = f.lookup ? map[f.lookup] ?? [] : [];
    return rows
      .map((o) => ({ id: o.id as number, label: lookupLabel(o) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  /**
   * Columns the API returned that no section covers. Rendered read-only so a
   * newly added model column is visible immediately instead of vanishing.
   */
  const extraSection = useMemo<DeviceSection | null>(() => {
    const known = schemaFields(detail.device_type);
    const extras = Object.keys(detail.record)
      .filter((k) => !known.has(k))
      .map<DeviceField>((k) => ({ field: k, label: k, kind: "readonly", wide: true }));
    if (extras.length === 0) return null;
    return {
      title: "Other fields",
      description:
        "Columns present on the model but not yet mapped into a section — shown read-only.",
      fields: extras,
    };
  }, [detail.device_type, detail.record]);

  const renderControl = (f: DeviceField) => {
    const value = draft[f.field];
    const busy = save.isPending && save.variables?.field === f.field;

    if (f.kind === "generated" || f.kind === "readonly") {
      return (
        <div className="text-sm text-slate-600 font-mono break-all py-1">
          {toInputValue(value) || <span className="text-slate-400">—</span>}
        </div>
      );
    }

    if (f.kind === "json") {
      return (
        <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-56 text-slate-700">
          {value == null ? "— no data —" : JSON.stringify(value, null, 2)}
        </pre>
      );
    }

    if (f.kind === "fk") {
      return (
        <select
          className={INPUT_CLASS}
          value={value == null ? "" : String(value)}
          disabled={busy || lookupsLoading}
          onChange={(e) => {
            const raw = e.target.value;
            const next = raw === "" ? null : Number(raw);
            setDraft((d) => ({ ...d, [f.field]: next }));
            if ((detail.record[f.field] ?? null) !== next) {
              save.mutate({ field: f.field, value: next });
            }
          }}
        >
          <option value="">— none —</option>
          {optionsFor(f).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    if (f.kind === "textarea") {
      return (
        <textarea
          className={INPUT_CLASS}
          rows={3}
          disabled={busy}
          value={toInputValue(value)}
          onChange={(e) => setDraft((d) => ({ ...d, [f.field]: e.target.value }))}
          onBlur={(e) => commit(f, e.target.value)}
        />
      );
    }

    return (
      <input
        className={INPUT_CLASS}
        type={f.kind === "number" ? "number" : "text"}
        disabled={busy}
        value={toInputValue(value)}
        placeholder={f.kind === "ip" ? "e.g. 10.0.0.10" : undefined}
        onChange={(e) => setDraft((d) => ({ ...d, [f.field]: e.target.value }))}
        onBlur={(e) => commit(f, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(detail.record);
        }}
      />
    );
  };

  const renderField = (f: DeviceField) => (
    <div
      key={f.field}
      className={f.wide ? "sm:col-span-2" : undefined}
    >
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {f.label}
        {f.kind === "generated" && (
          <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">
            auto
          </span>
        )}
        {saved === f.field && (
          <span className="ml-2 text-[10px] text-green-600">saved</span>
        )}
      </label>
      {renderControl(f)}
      {f.help && <p className="mt-1 text-[11px] text-slate-400">{f.help}</p>}
    </div>
  );

  const sections = extraSection
    ? [...schema.sections, extraSection]
    : schema.sections;

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          {error}
        </div>
      )}

      {/* Generated identifiers — the whole point of this CMDB, so they lead. */}
      <section className="bg-slate-900 text-slate-100 rounded-lg p-4">
        <h2 className="text-xs uppercase tracking-wide text-slate-400 mb-3">
          Generated names
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {schema.generatedNames.map((f) => (
            <div key={f.field}>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                {f.label}
              </div>
              <div className="font-mono text-lg break-all">
                {toInputValue(detail.record[f.field]) || (
                  <span className="text-slate-500 text-sm">
                    not generated yet — fill in the classification fields below
                  </span>
                )}
              </div>
            </div>
          ))}
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              TIA-606-B name
            </div>
            <div className="text-xs text-slate-400 leading-snug">{TIA606B_NOTE}</div>
          </div>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Click a field to edit · changes save on blur (dropdowns save immediately)
        · every change is written to the changelog · fields marked{" "}
        <span className="uppercase tracking-wide">auto</span> are rewritten by
        the naming engine on each save.
      </p>

      {sections.map((section) => (
        <section
          key={section.title}
          className="bg-white border border-slate-200 rounded-lg p-4"
        >
          <h3 className="text-sm font-semibold text-slate-700">{section.title}</h3>
          {section.description && (
            <p className="text-xs text-slate-400 mb-3">{section.description}</p>
          )}
          <div className={`grid gap-4 sm:grid-cols-2 ${section.description ? "" : "mt-3"}`}>
            {section.fields.map(renderField)}
          </div>
        </section>
      ))}
    </div>
  );
}
