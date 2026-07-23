import { useState } from "react";
import type { CustomColumnDef, CustomColumnType } from "../lib/columns";

export interface ReferenceTableOption {
  slug: string;
  label: string;
}

interface Props {
  cols: CustomColumnDef[];
  referenceTables: ReferenceTableOption[];
  onAdd: (def: CustomColumnDef) => void;
  onUpdate: (key: string, def: CustomColumnDef) => void;
  onRemove: (key: string) => void;
}

const TYPES: { value: CustomColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "reference", label: "Dropdown from reference table" },
];

function slugifyKey(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function ColumnManager({
  cols,
  referenceTables,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [header, setHeader] = useState("");
  const [type, setType] = useState<CustomColumnType>("text");
  const [refResource, setRefResource] = useState(referenceTables[0]?.slug ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingKey(null);
    setHeader("");
    setType("text");
    setRefResource(referenceTables[0]?.slug ?? "");
    setFormError(null);
  };

  const startEdit = (c: CustomColumnDef) => {
    setEditingKey(c.key);
    setHeader(c.header);
    setType(c.type);
    setRefResource(c.refResource ?? referenceTables[0]?.slug ?? "");
    setFormError(null);
  };

  const submit = () => {
    const trimmed = header.trim();
    if (!trimmed) {
      setFormError("Column name is required.");
      return;
    }
    if (type === "reference" && !refResource) {
      setFormError("Pick a reference table for the dropdown.");
      return;
    }
    const def: CustomColumnDef = {
      key: editingKey ?? slugifyKey(trimmed),
      header: trimmed,
      type,
      ...(type === "reference" ? { refResource } : {}),
    };
    if (!def.key) {
      setFormError("Column name must contain letters or numbers.");
      return;
    }
    if (editingKey) onUpdate(editingKey, def);
    else onAdd(def);
    resetForm();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded text-sm hover:bg-slate-300"
        title="Add, edit or remove custom columns"
      >
        ⚙ Columns{cols.length ? ` (${cols.length})` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => {
            setOpen(false);
            resetForm();
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[540px] max-w-[92vw] max-h-[88vh] overflow-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Manage columns</h2>
              <button
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Custom columns are stored per-page in your browser. Values are
              saved on the record. Choose “Dropdown from reference table” to
              populate the cell editor from a reference list such as Site
              Addresses.
            </p>

            {/* Existing custom columns */}
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Current custom columns
              </div>
              {cols.length === 0 && (
                <div className="text-sm text-slate-400 py-2">
                  No custom columns yet.
                </div>
              )}
              {cols.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between border border-slate-200 rounded px-3 py-2 mb-1.5"
                >
                  <div className="text-sm">
                    <span className="font-medium">{c.header}</span>
                    <span className="text-slate-400 ml-2">
                      {c.type === "reference"
                        ? `dropdown · ${
                            referenceTables.find((r) => r.slug === c.refResource)
                              ?.label ?? c.refResource
                          }`
                        : c.type}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(c)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        onRemove(c.key);
                        if (editingKey === c.key) resetForm();
                      }}
                      className="text-red-600 hover:underline text-xs"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add / edit form */}
            <div className="border-t border-slate-200 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {editingKey ? "Edit column" : "Add a column"}
              </div>

              <label className="block text-sm mb-2">
                <span className="text-slate-600">Column name</span>
                <input
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  placeholder="e.g. Address"
                  className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                />
              </label>

              <label className="block text-sm mb-2">
                <span className="text-slate-600">Type</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as CustomColumnType)}
                  className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                >
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              {type === "reference" && (
                <label className="block text-sm mb-2">
                  <span className="text-slate-600">Reference table</span>
                  <select
                    value={refResource}
                    onChange={(e) => setRefResource(e.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  >
                    {referenceTables.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {formError && (
                <div className="text-sm text-red-600 mb-2">{formError}</div>
              )}

              <div className="flex gap-2 mt-1">
                <button
                  onClick={submit}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  {editingKey ? "Save changes" : "Add column"}
                </button>
                {editingKey && (
                  <button
                    onClick={resetForm}
                    className="px-3 py-1.5 bg-slate-200 text-slate-800 rounded text-sm hover:bg-slate-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
