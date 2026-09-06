import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";
import EntityGrid, { friendlyError } from "./EntityGrid";
import { useLookups, textCol, roCol, fkCol, boolCol, numCol } from "../lib/columns";
import { CAPABILITY_VALUES, CAPABILITY_LABELS } from "../lib/capabilities";

/**
 * Phase 5 Task 19 — the detail area for whichever Entity_Type_Def row is
 * selected in the Entity Type Builder's main grid (`EntityTypeBuilder.tsx`).
 *
 * Two independent editors, both scoped to the selected row:
 *
 * * A capability toggle group. Nothing is written until "Save capabilities"
 *   is pressed (mirrors `SiteCodePanel`'s "nothing written until Save" UX),
 *   since toggling several boxes before committing is the common case.
 * * A nested `EntityGrid` over `entity-field-defs`, narrowed to this type's
 *   rows via `externalFilter` (the same exact-match mechanism `Naming.tsx`
 *   uses for its region map, not the fuzzy search box — see EntityGrid's
 *   `externalFilter` doc). `sort_order` is a plain editable number column:
 *   the administrator reorders fields by typing the order they want, rather
 *   than a drag-and-drop control (no such library is in this app's
 *   dependencies, and a numeric column is consistent with the rest of the
 *   grid-editing UX already used everywhere else).
 */

interface Props {
  entityType: Row | null;
}

export default function EntityTypeDetailPanel({ entityType }: Props) {
  const qc = useQueryClient();
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const entityTypeId = entityType?.id ?? null;

  // Adopt the persisted capabilities whenever a different row is selected
  // or the grid refetches the current one.
  useEffect(() => {
    setMessage("");
    setSelectedCaps(
      Array.isArray(entityType?.capabilities) ? [...entityType.capabilities] : []
    );
  }, [entityTypeId, entityType?.capabilities]);

  const saveMut = useMutation({
    mutationFn: (capabilities: string[]) =>
      api.update("entity-type-defs", entityType!.id, { capabilities }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-type-defs"] });
      setMessage("Capabilities saved.");
    },
    onError: (e: Error) => setMessage(friendlyError(e.message)),
  });

  const { map: lookupMap, isLoading: fieldTypesLoading } = useLookups([
    "field-type-defs",
  ]);

  const fieldColumns = useMemo(
    () => [
      roCol("id", "ID", 60),
      textCol("key", "Key", 140),
      textCol("label", "Label", 160),
      fkCol("field_type_id", "Field Type", lookupMap["field-type-defs"] ?? []),
      boolCol("required", "Required"),
      { ...numCol("sort_order", "Order"), sort: "asc" as const },
      textCol("reference_target_type", "Reference Target", 170),
    ],
    [lookupMap]
  );

  if (!entityType) {
    return (
      <div className="mb-3 px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
        <span className="font-medium text-slate-600">Type details</span> —
        select an Entity Type above to toggle its capabilities and manage its
        fields.
      </div>
    );
  }

  const persistedCaps = Array.isArray(entityType.capabilities)
    ? entityType.capabilities
    : [];
  const dirty =
    JSON.stringify([...selectedCaps].sort()) !==
    JSON.stringify([...persistedCaps].sort());

  const toggleCap = (cap: string) => {
    setMessage("");
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  return (
    <div className="mb-3 px-3 py-2.5 border border-slate-200 bg-slate-50 rounded">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
        <span className="text-sm font-medium text-slate-700">
          Capabilities for “{entityType.label}”
        </span>
        <button
          onClick={() => saveMut.mutate(selectedCaps)}
          disabled={!dirty || saveMut.isPending}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveMut.isPending ? "Saving…" : "Save capabilities"}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-2">
        {CAPABILITY_VALUES.map((cap) => (
          <label
            key={cap}
            className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedCaps.includes(cap)}
              onChange={() => toggleCap(cap)}
            />
            {CAPABILITY_LABELS[cap]}
          </label>
        ))}
      </div>

      {message && (
        <p
          className={`text-xs mb-2 ${
            saveMut.isError ? "text-red-700" : "text-green-700"
          }`}
        >
          {message}
        </p>
      )}

      <div className="border-t border-slate-200 pt-2">
        <p className="text-sm font-medium text-slate-700 mb-1.5">
          Fields on “{entityType.label}”
        </p>
        {fieldTypesLoading ? (
          <div className="text-sm text-slate-500">Loading field types…</div>
        ) : (
          <EntityGrid
            key={entityType.id}
            resource="entity-field-defs"
            title=""
            columns={fieldColumns}
            minHeight={260}
            newRowDefaults={() => ({
              entity_type_id: entityType.id,
              key: `field_${Math.random().toString(36).slice(2, 6)}`,
              label: "New Field",
              sort_order: 0,
            })}
            requiredFields={[
              { field: "key", label: "Key" },
              { field: "label", label: "Label" },
              {
                field: "field_type_id",
                label: "Field Type",
                hint: "Create a Field Type first in Reference Data.",
              },
            ]}
            externalFilter={(row) => row.entity_type_id === entityType.id}
            footerHint={null}
          />
        )}
      </div>
    </div>
  );
}
