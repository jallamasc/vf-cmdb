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

// A foreign-key column rendered as a dropdown of "abbr — full_name"
export function fkCol(
  field: string,
  headerName: string,
  options: Row[]
): ColDef {
  const idToLabel = new Map<number, string>();
  options.forEach((o) =>
    idToLabel.set(o.id, `${o.abbreviation ?? o.simple_name ?? o.vf_short_name ?? o.id}`)
  );
  return {
    field,
    headerName,
    editable: true,
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values: [null, ...options.map((o) => o.id)] },
    valueFormatter: (p) =>
      p.value == null ? "" : idToLabel.get(Number(p.value)) ?? String(p.value),
    width: 130,
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
