import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, CellValueChangedEvent } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { api, Row } from "../api";
import { fuzzyMatchesAny } from "../lib/fuzzy";

/**
 * A column the backend declares ``nullable=False`` on. EntityGrid uses these
 * to (a) block an "Add row" that would blow up with a NOT NULL violation and
 * (b) explain, in plain language, what the user has to pick first.
 */
export interface RequiredField {
  /** Column / model field name, e.g. "site_id". */
  field: string;
  /** Human label shown in messages, e.g. "Site". */
  label: string;
  /** Optional hint on how to satisfy it, e.g. "create a Site first". */
  hint?: string;
}

/**
 * FEAT-7 — an alternative source of rows for the grid.
 *
 * Listing pages read the whole table through ``api.list(resource)``. A device
 * dashboard tab instead reads a server-side filtered slice
 * (``/devices/{type}/{id}/related/{relation}``) but must still *write* through
 * the normal CRUD routes for ``resource``, because that is where audit logging
 * and the naming generators live. Both caches are invalidated after a save so
 * the tab and the full listing page never drift apart.
 */
export interface GridDataSource {
  /** React Query key for the filtered slice. */
  queryKey: unknown[];
  /** Loader for the filtered slice. */
  fetch: () => Promise<unknown>;
  /**
   * Pull the grid rows out of whatever ``fetch`` resolves to. Defaults to the
   * identity, so a plain ``Row[]`` loader needs nothing extra. Supplying it
   * lets a page share one cache entry (and one request) between the grid and
   * an envelope of metadata around the rows.
   */
  select?: (data: unknown) => Row[];
}

interface Props {
  resource: string;
  title: string;
  columns: ColDef[];
  /**
   * Values pre-filled on a new row. Pass a function when a value must be
   * computed per click (e.g. a unique placeholder abbreviation).
   */
  newRowDefaults?: Row | (() => Row);
  description?: ReactNode;
  toolbarExtra?: ReactNode;
  /**
   * Rendered between the header and the grid. Used by pages that drive an
   * editor panel from the row the user selected (FEAT-1's tri-mode site code).
   */
  panel?: ReactNode;
  /** Fields the database requires (NOT NULL). Checked before POST. */
  requiredFields?: RequiredField[];
  /**
   * Called with the currently selected rows every time the selection changes,
   * so a page can render an editor for the highlighted record.
   */
  onSelectionChanged?: (rows: Row[]) => void;
  /** FEAT-7 — read a filtered slice instead of the whole table. */
  dataSource?: GridDataSource;
  /** FEAT-7 — hide "+ Add row" for relations this device cannot own. */
  allowAdd?: boolean;
  /** FEAT-7 — hide "Delete selected" for read-only relations. */
  allowDelete?: boolean;
  /** FEAT-7 — shrink the grid so several tabs fit without a page scroll. */
  minHeight?: number;
  /** FEAT-7 — replace the footer hint (or hide it with ``null``). */
  footerHint?: ReactNode;
}

type ToastKind = "error" | "info";

interface Toast {
  kind: ToastKind;
  message: string;
}

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

/** Map a model field name to the header used in the grid (falls back to the field). */
function fieldLabel(
  field: string,
  columns: ColDef[],
  requiredFields: RequiredField[]
): string {
  const required = requiredFields.find((r) => r.field === field);
  if (required) return required.label;
  const col = columns.find((c) => c.field === field);
  if (col?.headerName) return col.headerName;
  return field;
}

/**
 * Turn a raw API/database error into a sentence a CMDB operator can act on.
 *
 * Handles the constraint violations the generic CRUD endpoint can surface:
 * NOT NULL, foreign key, unique/duplicate key and FastAPI 422 payloads. Any
 * unrecognised message is passed through unchanged so nothing is swallowed.
 */
export function friendlyError(
  raw: string,
  columns: ColDef[] = [],
  requiredFields: RequiredField[] = []
): string {
  const msg = String(raw ?? "");
  const label = (f: string) => fieldLabel(f, columns, requiredFields);

  // psycopg / asyncpg: null value in column "site_id" of relation "vlans"
  // violates not-null constraint
  const notNull =
    /null value in column "([^"]+)"[\s\S]*?violates not-null constraint/i.exec(
      msg
    ) ?? /column "([^"]+)"[\s\S]*?violates not-null/i.exec(msg);
  if (notNull) {
    return `“${label(notNull[1])}” is required — pick a value for it before saving this row.`;
  }

  // Foreign key violation: insert or update on table "vlans" violates foreign
  // key constraint "vlans_site_id_fkey"
  const fk = /violates foreign key constraint "?([\w]*?)_?([\w]+_id)_fkey"?/i.exec(
    msg
  );
  if (fk) {
    return `“${label(fk[2])}” points at a record that no longer exists — pick an existing value.`;
  }
  if (/violates foreign key constraint/i.test(msg)) {
    return "A referenced record no longer exists — refresh the page and pick an existing value.";
  }

  // Unique violation: duplicate key value violates unique constraint
  // "uq_vlan_site_vlanid" / DETAIL: Key (vlan_id)=(10) already exists.
  const dupKey = /Key \(([^)]+)\)=\(([^)]*)\) already exists/i.exec(msg);
  if (dupKey) {
    const fields = dupKey[1]
      .split(",")
      .map((f) => `“${label(f.trim())}”`)
      .join(" + ");
    return `${fields} value “${dupKey[2]}” is already in use — values must be unique.`;
  }
  if (/duplicate key value violates unique constraint/i.test(msg)) {
    return "That value is already in use — it must be unique.";
  }

  // CHECK constraint (abbreviation charset etc.)
  const check = /violates check constraint "([^"]+)"/i.exec(msg);
  if (check) {
    return `Value rejected by rule “${check[1]}” — only letters, digits and single hyphens are allowed in codes.`;
  }

  // FastAPI validation payload: [{"loc":["body","site_id"],"msg":"..."}]
  const loc = /"loc"\s*:\s*\[\s*"body"\s*,\s*"([^"]+)"/i.exec(msg);
  if (loc) {
    return `“${label(loc[1])}” is invalid — check the value and try again.`;
  }

  // Network failure (backend restarting / offline)
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Cannot reach the API — the backend may be restarting. Retry in a moment.";
  }

  // Strip the leading "500: " style status prefix for readability, but keep
  // the server's own message (409/422 responses are already human-friendly).
  return msg.replace(/^\d{3}:\s*/, "") || "Unknown error";
}

export default function EntityGrid({
  resource,
  title,
  columns,
  newRowDefaults = {},
  description,
  toolbarExtra,
  panel,
  requiredFields = [],
  onSelectionChanged,
  dataSource,
  allowAdd = true,
  allowDelete = true,
  minHeight = 480,
  footerHint,
}: Props) {
  const qc = useQueryClient();
  const gridRef = useRef<AgGridReact>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Req 6 — per-section fuzzy search, applied as an AG Grid external filter.
  const [search, setSearch] = useState("");

  const notify = (kind: ToastKind, message: string) =>
    setToast({ kind, message });

  const fail = (e: unknown) =>
    notify(
      "error",
      friendlyError(
        (e as Error)?.message ?? String(e),
        columns,
        requiredFields
      )
    );

  // Auto-dismiss info toasts; errors stay until the next action so the user
  // can read (and copy) them.
  useEffect(() => {
    if (toast?.kind !== "info") return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const selectRows = dataSource?.select;
  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: dataSource ? dataSource.queryKey : [resource],
    queryFn: dataSource ? dataSource.fetch : () => api.list(resource),
    select: useMemo(
      () => selectRows ?? ((d: unknown) => d as Row[]),
      [selectRows]
    ),
  });

  /**
   * Refresh both the rows on screen and the full table cache. When a device
   * tab is showing a filtered slice, the listing page for the same resource is
   * now stale too — invalidating both keeps them consistent.
   */
  const refresh = () => {
    qc.invalidateQueries({ queryKey: [resource] });
    if (dataSource) qc.invalidateQueries({ queryKey: dataSource.queryKey });
  };

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Row }) =>
      api.update(resource, id, payload),
    onSuccess: refresh,
    onError: (e: Error) => {
      fail(e);
      // Roll the cell back to the persisted value.
      refresh();
    },
  });

  const createMut = useMutation({
    mutationFn: (payload: Row) => api.create(resource, payload),
    onSuccess: refresh,
    onError: (e: Error) => fail(e),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.remove(resource, id),
    onSuccess: refresh,
    onError: (e: Error) => fail(e),
  });

  /**
   * UX-1 — nothing in a cell may be clipped.
   *
   * ``wrapText`` + ``autoHeight`` let a long value flow onto extra lines and
   * grow the row instead of being cut off with an ellipsis; the header gets the
   * same treatment. A tooltip carries the full value for quick hover reads, and
   * no ``maxWidth`` is set anywhere so "Auto-fit columns" can grow a column as
   * wide as its widest value.
   */
  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 110,
      wrapText: true,
      autoHeight: true,
      wrapHeaderText: true,
      autoHeaderHeight: true,
      tooltipValueGetter: (p) => {
        const v = p.valueFormatted ?? p.value;
        return v == null || v === "" ? null : String(v);
      },
    }),
    []
  );

  /**
   * UX-1 — resize every column to the width of its widest rendered value.
   * ``autoSizeAllColumns`` only measures the rows currently rendered, which is
   * exactly what the user sees, and it ignores ``minWidth``-only constraints.
   */
  const handleAutoFit = () => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.autoSizeAllColumns(false);
  };

  /**
   * Re-publish the selection to the parent page. Called both by AG Grid's own
   * event and after a refetch, because the refreshed row object is a new
   * reference and an open editor panel must not keep showing stale values.
   */
  const publishSelection = () => {
    if (!onSelectionChanged) return;
    onSelectionChanged(gridRef.current?.api?.getSelectedRows() ?? []);
  };

  useEffect(() => {
    if (!onSelectionChanged) return;
    publishSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Req 6.2/6.3 — re-run the external (fuzzy) filter whenever the query changes.
  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [search]);

  const onCellValueChanged = (e: CellValueChangedEvent) => {
    setToast(null);
    const field = e.colDef.field;
    let payload: Row;
    if (!field) {
      // User-defined column backed by the custom_fields JSON object. The
      // column's valueSetter has already mutated e.data.custom_fields, so we
      // persist the whole object.
      payload = { custom_fields: e.data.custom_fields ?? {} };
    } else if (field.includes(".")) {
      // Nested field path (e.g. "custom_fields.foo"): persist the root object.
      const root = field.split(".")[0];
      payload = { [root]: e.data[root] };
    } else {
      const value = e.newValue === "" ? null : e.newValue;
      // Never clear a NOT NULL column — the API would answer with a raw
      // constraint error; explain it locally instead.
      const required = requiredFields.find((r) => r.field === field);
      if (required && value == null) {
        notify(
          "error",
          `“${required.label}” is required and cannot be cleared.` +
            (required.hint ? ` ${required.hint}` : "")
        );
        refresh();
        return;
      }
      payload = { [field]: value };
    }
    updateMut.mutate({ id: e.data.id, payload });
  };

  const handleAdd = () => {
    setToast(null);
    const defaults =
      typeof newRowDefaults === "function" ? newRowDefaults() : newRowDefaults;
    const payload: Row = { ...defaults };

    const missing = requiredFields.filter(
      (r) => payload[r.field] == null || payload[r.field] === ""
    );
    if (missing.length > 0) {
      const names = missing.map((m) => `“${m.label}”`).join(", ");
      const hints = missing
        .map((m) => m.hint)
        .filter(Boolean)
        .join(" ");
      notify(
        "error",
        `Cannot add a row: ${names} ${
          missing.length === 1 ? "is" : "are"
        } required by the database.${hints ? ` ${hints}` : ""}`
      );
      return;
    }

    // Tell the user which values were pre-filled so a wrong default is never
    // saved silently.
    const prefilled = requiredFields
      .filter((r) => payload[r.field] != null)
      .map((r) => r.label);
    if (prefilled.length > 0) {
      notify(
        "info",
        `New row added with a default ${prefilled.join(", ")} — change it in the row if that is not right.`
      );
    }
    createMut.mutate(payload);
  };

  const handleDelete = () => {
    const selected = gridRef.current?.api.getSelectedRows() ?? [];
    if (selected.length === 0) {
      notify("error", "Select a row to delete first.");
      return;
    }
    if (!confirm(`Delete ${selected.length} row(s)? This is logged in the changelog.`))
      return;
    setToast(null);
    selected.forEach((r) => deleteMut.mutate(r.id));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Fuzzy search…"
            aria-label="Fuzzy search this table"
            className="px-3 py-1.5 border border-slate-300 rounded text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {toolbarExtra}
          <button
            onClick={handleAutoFit}
            title="Resize every column to fit its widest value"
            className="px-3 py-1.5 border border-slate-300 bg-white text-slate-700 rounded text-sm hover:bg-slate-50"
          >
            Auto-fit columns
          </button>
          {allowAdd && (
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              + Add row
            </button>
          )}
          {allowDelete && (
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Delete selected
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div
          role="alert"
          className={`mb-2 px-3 py-2 rounded text-sm flex items-start gap-2 ${
            toast.kind === "error"
              ? "bg-red-100 text-red-800"
              : "bg-blue-50 text-blue-800"
          }`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="text-xs opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {panel}

      {/* Only useful when the user can actually create rows here. */}
      {allowAdd && requiredFields.length > 0 && (
        <p className="text-xs text-slate-400 mb-1">
          Required by the database:{" "}
          {requiredFields.map((r) => r.label).join(", ")}.
        </p>
      )}

      {isLoading && <div className="text-slate-500 py-8 text-center">Loading…</div>}
      {isError && (
        <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          Failed to load:{" "}
          {friendlyError((queryError as Error)?.message ?? "", columns, requiredFields)}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="ag-theme-quartz flex-1" style={{ minHeight }}>
          <AgGridReact
            ref={gridRef}
            rowData={data}
            columnDefs={columns}
            defaultColDef={defaultColDef}
            onCellValueChanged={onCellValueChanged}
            onSelectionChanged={publishSelection}
            // Stable ids keep the selection (and any editor panel bound to it)
            // alive across the refetch that follows every save.
            getRowId={(p) => String(p.data.id)}
            rowSelection="multiple"
            stopEditingWhenCellsLoseFocus
            // Req 5.1 — a dropdown cell opens its picker on the first click.
            singleClickEdit
            animateRows
            pagination
            paginationPageSize={50}
            tooltipShowDelay={400}
            // Req 6.2/6.3 — fuzzy search across every column value.
            isExternalFilterPresent={() => search.trim() !== ""}
            doesExternalFilterPass={(node) =>
              fuzzyMatchesAny(search, Object.values(node.data ?? {}))
            }
          />
        </div>
      )}
      {footerHint !== undefined ? (
        footerHint && <p className="text-xs text-slate-400 mt-2">{footerHint}</p>
      ) : (
        <p className="text-xs text-slate-400 mt-2">
          Click a cell to edit · Enter to save · Esc to cancel · cells marked
          with ▼ open a dropdown · long values wrap instead of being cut off,
          and “Auto-fit columns” widens every column to its content. Every
          change is written to the changelog; computed name columns are
          read-only.
        </p>
      )}
    </div>
  );
}
