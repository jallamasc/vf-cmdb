import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, CellValueChangedEvent } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { api, Row } from "../api";

interface Props {
  resource: string;
  title: string;
  columns: ColDef[];
  newRowDefaults?: Row;
  description?: string;
}

export default function EntityGrid({
  resource,
  title,
  columns,
  newRowDefaults = {},
  description,
}: Props) {
  const qc = useQueryClient();
  const gridRef = useRef<AgGridReact>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: [resource],
    queryFn: () => api.list(resource),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Row }) =>
      api.update(resource, id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
    onError: (e: Error) => setError(e.message),
  });

  const createMut = useMutation({
    mutationFn: (payload: Row) => api.create(resource, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.remove(resource, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
    onError: (e: Error) => setError(e.message),
  });

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 110,
    }),
    []
  );

  const onCellValueChanged = (e: CellValueChangedEvent) => {
    setError(null);
    const field = e.colDef.field!;
    const payload: Row = { [field]: e.newValue === "" ? null : e.newValue };
    updateMut.mutate({ id: e.data.id, payload });
  };

  const handleAdd = () => {
    setError(null);
    createMut.mutate({ ...newRowDefaults });
  };

  const handleDelete = () => {
    const selected = gridRef.current?.api.getSelectedRows() ?? [];
    if (selected.length === 0) {
      setError("Select a row to delete first.");
      return;
    }
    if (!confirm(`Delete ${selected.length} row(s)? This is logged in the changelog.`))
      return;
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

      {error && (
        <div className="mb-2 px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          {error}
        </div>
      )}

      {isLoading && <div className="text-slate-500 py-8 text-center">Loading…</div>}
      {isError && (
        <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          Failed to load: {(queryError as Error)?.message}
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
          />
        </div>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Click a cell to edit · Enter to save · Esc to cancel · every change is
        written to the changelog. Computed name columns are read-only.
      </p>
    </div>
  );
}
