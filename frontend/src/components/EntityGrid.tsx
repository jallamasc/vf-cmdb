import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, CellValueChangedEvent } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { api, Row } from "../api";

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

interface Props {
  resource: string;
  title: string;
  columns: ColDef[];
  /**
   * Values pre-filled on a new row. Pass a function when a value must be
   * computed per click (e.g. a unique placeholder abbreviation).
   */
  newRowDefaults?: Row | (() => Row);
  description?: string;
  toolbarExtra?: ReactNode;
  /** Fields the database requires (NOT NULL). Checked before POST. */
  requiredFields?: RequiredField[];
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
  requiredFields = [],
}: Props) {
  const qc = useQueryClient();
  const gridRef = useRef<AgGridReact>(null);
  const [toast, setToast] = useState<Toast | null>(null);

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

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: [resource],
    queryFn: () => api.list(resource),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Row }) =>
      api.update(resource, id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
    onError: (e: Error) => {
      fail(e);
      // Roll the cell back to the persisted value.
      qc.invalidateQueries({ queryKey: [resource] });
    },
  });

  const createMut = useMutation({
    mutationFn: (payload: Row) => api.create(resource, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
    onError: (e: Error) => fail(e),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.remove(resource, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
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
        qc.invalidateQueries({ queryKey: [resource] });
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
          {toolbarExtra}
          <button
            onClick={handleAutoFit}
            title="Resize every column to fit its widest value"
            className="px-3 py-1.5 border border-slate-300 bg-white text-slate-700 rounded text-sm hover:bg-slate-50"
          >
            Auto-fit columns
          </button>
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            + Add row
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Delete selected
          </button>
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

      {requiredFields.length > 0 && (
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
        <div className="ag-theme-quartz flex-1" style={{ minHeight: 480 }}>
          <AgGridReact
            ref={gridRef}
            rowData={data}
            columnDefs={columns}
            defaultColDef={defaultColDef}
            onCellValueChanged={onCellValueChanged}
            rowSelection="multiple"
            stopEditingWhenCellsLoseFocus
            animateRows
            pagination
            paginationPageSize={50}
            tooltipShowDelay={400}
          />
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Click a cell to edit · Enter to save · Esc to cancel · cells marked with
        ▼ open a dropdown · long values wrap instead of being cut off, and
        “Auto-fit columns” widens every column to its content. Every change is
        written to the changelog; computed name columns are read-only.
      </p>
    </div>
  );
}
