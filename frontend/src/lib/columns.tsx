import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api, Row } from "../api";
import type { DeviceTypeKey } from "../api";

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

// ---------------------------------------------------------------------------
// UX-2: dropdown affordance
// ---------------------------------------------------------------------------
/**
 * Cell renderer used by every dropdown-backed column (``fkCol`` / ``selectCol``).
 *
 * Renders the formatted value plus a small muted ▼ on the right so the user can
 * tell at a glance that the cell opens a picker. AG Grid swaps the renderer for
 * the cell *editor* while editing, so the chevron is only ever visible in
 * read mode — exactly what UX-2 asks for.
 */
export function DropdownCellRenderer(p: ICellRendererParams) {
  const formatted =
    p.valueFormatted != null && p.valueFormatted !== ""
      ? p.valueFormatted
      : p.value == null || p.value === ""
        ? ""
        : String(p.value);
  return (
    <span className="vf-dd-cell">
      <span className="vf-dd-text">
        {formatted !== "" ? (
          formatted
        ) : (
          <span className="vf-dd-empty">— select —</span>
        )}
      </span>
      <span className="vf-dd-caret" aria-hidden="true">
        ▼
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// FEAT-7: link to the device detail dashboard
// ---------------------------------------------------------------------------
/**
 * The primary name column of a device listing grid, rendered as a link to
 * ``/devices/{type}/{id}``.
 *
 * The value stays read-only (these are naming-engine outputs, exactly like
 * ``roCol``) but becomes clickable, which is how an operator gets from the
 * table to the single-device dashboard. A row whose name has not been
 * generated yet still links, using its id as the label, so the dashboard is
 * never unreachable.
 */
export function deviceLinkCol(
  field: string,
  headerName: string,
  type: DeviceTypeKey,
  width = 220
): ColDef {
  return {
    field,
    headerName,
    editable: false,
    width,
    cellClass: "vf-device-link-cell",
    cellRenderer: (p: ICellRendererParams) => {
      const id = p.data?.id;
      if (id == null) return null;
      const label =
        p.value == null || p.value === "" ? `(unnamed) #${id}` : String(p.value);
      return (
        <Link
          to={`/devices/${type}/${id}`}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
          title={`Open the ${label} dashboard`}
        >
          {label}
        </Link>
      );
    },
  };
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
  options: Row[],
  extra: Partial<ColDef> = {}
): ColDef {
  const idToLabel = new Map<number, string>();
  (options ?? []).forEach((o) => idToLabel.set(o.id, lookupLabel(o)));
  const format = (v: unknown) =>
    v == null || v === "" ? "" : idToLabel.get(Number(v)) ?? String(v);
  return {
    field,
    headerName,
    editable: true,
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values: [null, ...(options ?? []).map((o) => o.id)] },
    valueFormatter: (p) => format(p.value),
    // UX-2: show a ▼ so the cell reads as a picker, not as plain text.
    cellRenderer: DropdownCellRenderer,
    // Filter / quick-search on the human label instead of the raw id.
    filterValueGetter: (p) => format(p.data?.[field]),
    width: 180,
    ...extra,
  };
}

/**
 * A column backed by a fixed list of literal values (enum-ish), rendered with
 * the same dropdown affordance as ``fkCol``.
 *
 * ``values`` is passed straight to ``agSelectCellEditor``; include ``null``
 * first when the column is clearable. ``extra`` is merged last so callers can
 * override the width, add ``cellClassRules`` etc.
 */
export function selectCol(
  field: string,
  headerName: string,
  values: unknown[],
  extra: Partial<ColDef> = {}
): ColDef {
  return {
    field,
    headerName,
    editable: true,
    cellEditor: "agSelectCellEditor",
    cellEditorParams: { values },
    valueFormatter: (p) =>
      p.value == null || p.value === "" ? "" : String(p.value),
    cellRenderer: DropdownCellRenderer,
    width: 140,
    ...extra,
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
      // UX-2: user-defined reference columns are dropdowns too.
      cellRenderer: DropdownCellRenderer,
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
