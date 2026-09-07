import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api, Row } from "../api";
import type { DeviceTypeKey } from "../api";
import FuzzySelectEditor from "../components/FuzzySelectEditor";
import AirportCellEditor from "../components/AirportCellEditor";
import IconPickerEditor from "../components/IconPickerEditor";
import { resolveDeviceTypeIcon, isRecentlyActive } from "./deviceIcons";
import { resolveIcon } from "./iconLibrary";
import CountryFlag from "./countryFlags";

/**
 * Phase 6 Task 11 (Req 5.1) — the column-ordering convention every grid in
 * this app should follow, so a control is always roughly where an operator
 * expects it rather than in a random position per page:
 *
 *   1. `id` (roCol)
 *   2. `icon` (iconCol), when the resource has one
 *   3. The primary generated/name field(s) (generatedCol / namingComputedCol
 *      / deviceLinkCol) and, immediately after each one, its own Code Mode
 *      toggle (modeToggleCol) if it has one — the toggle always sits right
 *      next to the field it governs, never elsewhere in the row.
 *   4. Other identifiers (code, serial number, slug, ...).
 *   5. Relational fields (fkCol / selectCol for FKs and enums).
 *   6. `description`.
 *   7. Anything free-form/secondary (notes, custom fields).
 *
 * Not every grid has every one of these — the convention is about relative
 * order among the sections a given grid *does* have, not a fixed column
 * count. See `generatedCol`/`modeToggleCol`/`namingComputedCol` below for
 * the matching Req 5.2 visual treatment.
 */

/**
 * Phase 5 Task 24 (Req 20.1/20.2) — the set of field/column keys an
 * administrator has explicitly hidden (`visible: false`) for one entity
 * slug, via the Field Visibility panel in Reference Data
 * (`field-visibility-overrides`). Absence of an override row means
 * visible, so only `visible === false` rows contribute here.
 */
export function useFieldVisibility(resource: string): Set<string> {
  const { data } = useQuery({
    queryKey: ["field-visibility-overrides"],
    queryFn: () => api.list("field-visibility-overrides"),
  });
  const hidden = new Set<string>(
    ((data as Row[]) ?? [])
      .filter((o) => o.entity_slug === resource && o.visible === false)
      .map((o) => String(o.field_key))
  );
  return hidden;
}

/**
 * Phase 5 Task 24 — drop any column whose `field` is in `hidden`. Columns
 * with no `field` (e.g. a cellRenderer-only action column) are never
 * affected, since an override names a field/column key, not an arbitrary
 * colId.
 */
export function filterHiddenColumns(columns: ColDef[], hidden: Set<string>): ColDef[] {
  if (hidden.size === 0) return columns;
  return columns.filter((c) => !c.field || !hidden.has(c.field));
}

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

/**
 * Phase 6 Task 11 (Req 5.2) — a naming-engine-generated field that has no
 * per-row Code Mode toggle in this grid (always read-only, e.g.
 * Site.simple_name outside the tri-mode panel, or a device's vf_short_name
 * where the grid doesn't also show naming_mode). Styled the same
 * amber/monospace `vf-generated-cell` as `namingComputedCol` below, so
 * every naming-engine output reads the same way whether or not its own
 * toggle happens to be visible in that particular grid.
 */
export const generatedCol = (field: string, headerName?: string, width?: number): ColDef => ({
  field,
  headerName: headerName ?? field,
  editable: false,
  cellClass: "vf-generated-cell",
  width,
});

/**
 * Phase 6 Task 11 (Req 5.2) — the Code Mode toggle itself (`naming_mode` /
 * `site_code_type`), styled to visually read as part of the same control
 * group as the `namingComputedCol` field(s) it governs — a distinct,
 * consistent color across every grid that has one, so it's never the
 * "field I might have missed" among a row of plain columns.
 */
export const modeToggleCol = (
  field: string,
  headerName: string,
  values: unknown[],
  extra: Partial<ColDef> = {}
): ColDef => {
  const base = selectCol(field, headerName, values, extra);
  return { ...base, cellClass: "vf-mode-toggle-cell" };
};

/**
 * Phase 5 Task 28 (Req 23.1/23.2/23.3) — a naming-engine-computed column
 * (e.g. Site.vf_long_name, Rack.vf_long_name, PatchPanel.panel_id_label)
 * that becomes a normal editable cell exactly when the row's `naming_mode`
 * is "manual" (the whole point of manual mode), and stays read-only
 * (styled like `roCol`, but with the distinct Phase 6 Task 11 `vf-generated-
 * cell` treatment — Req 5.2) under "auto" — unlike `roCol`, this can't be a
 * fixed `editable: false`, since editability now depends on another field
 * on the same row.
 */
export const namingComputedCol = (
  field: string,
  headerName?: string,
  width?: number
): ColDef => ({
  field,
  headerName: headerName ?? field,
  editable: (p) => p.data?.naming_mode === "manual",
  cellClass: (p) =>
    p.data?.naming_mode === "manual" ? "" : "vf-generated-cell",
  width,
});

export const numCol = (field: string, headerName?: string): ColDef => ({
  field,
  headerName: headerName ?? field,
  editable: true,
  valueParser: (p) => (p.newValue === "" || p.newValue == null ? null : Number(p.newValue)),
  width: 110,
});

// A foreign-key column rendered as a dropdown of "Full Name - abbreviation".
// Phase 4 Req 5: uses FuzzySelectEditor (single click + fuzzy search) instead
// of a native <select>.
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
    cellEditor: FuzzySelectEditor,
    cellEditorParams: { values: [null, ...(options ?? []).map((o) => o.id)], formatOption: format },
    cellEditorPopup: true,
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
    cellEditor: FuzzySelectEditor,
    cellEditorParams: { values },
    cellEditorPopup: true,
    valueFormatter: (p) =>
      p.value == null || p.value === "" ? "" : String(p.value),
    cellRenderer: DropdownCellRenderer,
    width: 140,
    ...extra,
  };
}

/**
 * Phase 5 Task 19 — a true/false column, rendered with the same dropdown
 * affordance as ``fkCol``/``selectCol`` but formatted as "Yes"/"No" instead
 * of the literal ``true``/``false`` string ``selectCol`` would show.
 */
export function boolCol(
  field: string,
  headerName: string,
  extra: Partial<ColDef> = {}
): ColDef {
  return {
    field,
    headerName,
    editable: true,
    cellEditor: FuzzySelectEditor,
    cellEditorParams: { values: [true, false], formatOption: (v: unknown) => (v ? "Yes" : "No") },
    cellEditorPopup: true,
    valueFormatter: (p) => (p.value == null ? "" : p.value ? "Yes" : "No"),
    cellRenderer: DropdownCellRenderer,
    width: 100,
    ...extra,
  };
}

/**
 * Phase 6 Task 10 (Req 4.1/4.2) — the icon column every registry now has:
 * shows the currently-picked icon's live SVG preview + its name (falling
 * back to the generic HelpCircle glyph via `resolveIcon` for an
 * unrecognised/legacy value), with the same ▼ dropdown affordance as
 * `fkCol`/`selectCol`. Editing opens `IconPickerEditor`'s fuzzy-searchable,
 * preview-showing picker (Req 4.2's "chevron-triggered, fuzzy-searchable,
 * with a live preview of each candidate").
 */
export function iconCol(
  field = "icon",
  headerName = "Icon",
  extra: Partial<ColDef> = {}
): ColDef {
  return {
    field,
    headerName,
    editable: true,
    width: 130,
    cellEditor: IconPickerEditor,
    cellEditorPopup: true,
    cellRenderer: (p: ICellRendererParams) => {
      const Icon = resolveIcon(p.value as string | null);
      return (
        <span className="vf-dd-cell">
          <span className="vf-dd-text flex items-center gap-1.5">
            <Icon size={16} aria-hidden="true" />
            {p.value ? String(p.value) : <span className="vf-dd-empty">— none —</span>}
          </span>
          <span className="vf-dd-caret" aria-hidden="true">
            ▼
          </span>
        </span>
      );
    },
    ...extra,
  };
}

/**
 * Phase 4 Req 9 — an IATA airport-code column with an in-cell search/select
 * editor (AirportCellEditor), instead of a plain typed text cell.
 */
export function airportCol(field: string, headerName: string, width = 130): ColDef {
  return {
    field,
    headerName,
    editable: true,
    width,
    cellEditor: AirportCellEditor,
    cellEditorPopup: true,
    cellRenderer: DropdownCellRenderer,
    valueFormatter: (p) => (p.value == null ? "" : String(p.value)),
  };
}

/**
 * Phase 5 Req 6.2/7.1 — a small, read-only glyph column showing the device
 * type's icon (from its lookup row's ``icon`` field, set via Naming.tsx) and,
 * when ``activeField`` names a recent-timestamp column present on the row
 * (e.g. ``last_fact_sync_at``), an animated dot signalling the device has
 * recently reported facts.
 */
export function deviceTypeIconCol(
  field: string,
  headerName: string,
  options: Row[],
  activeField?: string
): ColDef {
  const iconById = new Map<number, string | null | undefined>();
  (options ?? []).forEach((o) => iconById.set(o.id, o.icon));
  return {
    field,
    headerName,
    editable: false,
    width: 70,
    sortable: false,
    filter: false,
    cellRenderer: (p: ICellRendererParams) => {
      const typeId = p.value;
      const Icon = resolveDeviceTypeIcon(
        typeId == null ? null : iconById.get(Number(typeId))
      );
      const active = activeField ? isRecentlyActive(p.data?.[activeField]) : false;
      return (
        <span className="relative inline-flex items-center justify-center w-5 h-5">
          <Icon size={16} aria-hidden="true" />
          {active && (
            <span
              title="Active — recently reported facts"
              aria-label="Active"
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
            />
          )}
        </span>
      );
    },
  };
}

/**
 * Phase 5 Task 12 (Req 10) — a small flag column. By default reads the
 * country name straight off ``row[field]``; pass ``resolveCountryName`` when
 * the country has to be derived (e.g. a Region's abbreviation -> mapped
 * country via ``lib/regionGeo.ts``). Renders nothing for an unrecognised or
 * absent country rather than a broken flag.
 */
export function flagCol(
  field: string,
  headerName: string,
  resolveCountryName?: (row: Row) => string | null | undefined,
  width = 60
): ColDef {
  return {
    // Distinct colId: a flag column is often paired with a plain text column
    // reading the SAME field (e.g. "country"), and AG Grid needs unique
    // column ids even when they share a field.
    colId: `${field}_flag`,
    field,
    headerName,
    editable: false,
    sortable: false,
    filter: false,
    width,
    cellRenderer: (p: ICellRendererParams) => (
      <CountryFlag country={resolveCountryName ? resolveCountryName(p.data ?? {}) : p.data?.[field]} />
    ),
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
    const format = (v: unknown) =>
      v == null ? "" : idToLabel.get(Number(v)) ?? String(v);
    return {
      ...base,
      cellEditor: FuzzySelectEditor,
      cellEditorParams: { values: [null, ...refRows.map((o) => o.id)], formatOption: format },
      cellEditorPopup: true,
      valueFormatter: (p) => format(p.value),
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
