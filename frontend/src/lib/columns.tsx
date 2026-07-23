import { useQueries } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { api, Row } from "../api";

// Load several lookup resources at once and return a map slug -> rows
export function useLookups(slugs: string[]) {
  const results = useQueries({
    queries: slugs.map((s) => ({ queryKey: [s], queryFn: () => api.list(s) })),
  });
  const map: Record<string, Row[]> = {};
  slugs.forEach((s, i) => (map[s] = (results[i].data as Row[]) ?? []));
  const isLoading = results.some((r) => r.isLoading);
  return { map, isLoading };
}

/**
 * Human-friendly label for any lookup / reference row.
 *
 * Naming-convention lookups are rendered as "Full Name - abbreviation"
 * (e.g. "Switch - sw"). Other reference rows fall back to whatever
 * descriptive field they expose (label / simple_name / friendly name / …).
 */
export function lookupLabel(o: Row): string {
  if (o == null) return "";
  if (o.full_name && o.abbreviation) return `${o.full_name} - ${o.abbreviation}`;
  return (
    o.full_name ??
    o.label ??
    o.simple_name ??
    o.vf_short_name ??
    o.vf_friendly_name ??
    o.friendly_name ??
    o.name ??
    o.description ??
    String(o.id)
  );
}

// A read-only text column
export const textCol = (field: string, headerName?: string, width?: number): ColDef => ({
  field,
  headerName: headerName ?? field,
  editable: true,
  width,
});

export const roCol = (field: string, headerName?: string, width?: number): ColDef => ({
  field,
  headerName: headerName ?? field,
  editable: false,
  cellClass: "text-slate-500 italic",
  width,
});

export const numCol = (field: string, headerName?: string): ColDef => ({
  field,
  headerName: headerName ?? field,
  editable: true,
  valueParser: (p) => (p.newValue === "" || p.newValue == null ? null : Number(p.newValue)),
  width: 110,
});

// A foreign-key column rendered as a dropdown of "Full Name - abbreviation"
export function fkCol(
  field: string,
  headerName: string,
  options: Row[]
): ColDef {
  const idToLabel = new Map<number, string>();
  options.forEach((o) => idToLabel.set(o.id, lookupLabel(o)));
  return {
    field,
    headerName,
    editable: true,
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values: [null, ...options.map((o) => o.id)] },
    valueFormatter: (p) =>
      p.value == null ? "" : idToLabel.get(Number(p.value)) ?? String(p.value),
    width: 160,
  };
}

// IP column with zone-based color coding
export function ipCol(field: string, headerName: string, zone?: string): ColDef {
  return {
    field,
    headerName,
    editable: true,
    width: 160,
    cellClassRules: zone
      ? { [`zone-${zone}`]: () => true }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Dynamic / user-defined columns
// ---------------------------------------------------------------------------
export type CustomColumnType = "text" | "number" | "reference";

export interface CustomColumnDef {
  key: string; // stored under custom_fields[key]
  header: string;
  type: CustomColumnType;
  refResource?: string; // when type === "reference"
}

/**
 * Build an AG Grid column definition for a user-defined column whose value is
 * stored inside the row's ``custom_fields`` JSON object. No ``field`` is set
 * on purpose: the value is read / written through valueGetter / valueSetter so
 * EntityGrid can detect it (via the absence of ``colDef.field``) and persist
 * the whole ``custom_fields`` object.
 */
export function customCol(def: CustomColumnDef, refRows: Row[] = []): ColDef {
  const base: ColDef = {
    colId: `cf_${def.key}`,
    headerName: def.header,
    editable: true,
    width: 170,
    valueGetter: (p) => p.data?.custom_fields?.[def.key] ?? null,
    valueSetter: (p) => {
      if (!p.data.custom_fields || typeof p.data.custom_fields !== "object") {
        p.data.custom_fields = {};
      }
      const raw = p.newValue;
      p.data.custom_fields[def.key] =
        raw === "" || raw === undefined ? null : raw;
      return true;
    },
    headerClass: "cf-col-header",
  };

  if (def.type === "number") {
    return {
      ...base,
      valueSetter: (p) => {
        if (!p.data.custom_fields || typeof p.data.custom_fields !== "object") {
          p.data.custom_fields = {};
        }
        const raw = p.newValue;
        p.data.custom_fields[def.key] =
          raw === "" || raw == null ? null : Number(raw);
        return true;
      },
    };
  }

  if (def.type === "reference") {
    const idToLabel = new Map<number, string>();
    refRows.forEach((o) => idToLabel.set(o.id, lookupLabel(o)));
    return {
      ...base,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: [null, ...refRows.map((o) => o.id)] },
      valueFormatter: (p) =>
        p.value == null ? "" : idToLabel.get(Number(p.value)) ?? String(p.value),
      valueSetter: (p) => {
        if (!p.data.custom_fields || typeof p.data.custom_fields !== "object") {
          p.data.custom_fields = {};
        }
        const raw = p.newValue;
        p.data.custom_fields[def.key] =
          raw === "" || raw == null ? null : Number(raw);
        return true;
      },
    };
  }

  return base;
}
