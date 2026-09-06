import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import PhotoField from "../components/PhotoField";
import { StencilRow } from "../components/StencilField";
import { api, Row } from "../api";
import { useLookups, roCol } from "../lib/columns";
import { genericFieldCol } from "../lib/genericColumns";
import type { StorageKind } from "../lib/fieldTypes";

/**
 * Phase 5 Task 22 (Req 18.1/18.2) — the row-selection-driven detail area for
 * whichever capabilities the entity type actually enables. Nothing renders
 * for a type with neither `photo` nor `stencil_diagram` enabled. `PhotoField`
 * is new (Task 22); the stencil/anchor half reuses `StencilField.tsx`'s
 * `StencilRow` — a single-record stencil+anchor editor — completely as-is.
 */
function CapabilityPanel({
  entityType,
  selected,
}: {
  entityType: Row;
  selected: Row | null;
}) {
  const qc = useQueryClient();
  const capabilities: string[] = Array.isArray(entityType.capabilities)
    ? entityType.capabilities
    : [];
  const hasPhoto = capabilities.includes("photo");
  const hasStencil = capabilities.includes("stencil_diagram");
  if (!hasPhoto && !hasStencil) return null;

  if (!selected) {
    return (
      <div className="mb-3 px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
        Select a row to manage its {[hasPhoto && "photo", hasStencil && "stencil"]
          .filter(Boolean)
          .join(" / ")}
        .
      </div>
    );
  }

  return (
    <div className="mb-3 px-3 py-2.5 border border-slate-200 bg-slate-50 rounded space-y-2">
      {hasPhoto && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Photo</p>
          <PhotoField resource="generic-entities" row={selected} />
        </div>
      )}
      {hasStencil && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Stencil diagram
          </p>
          <StencilRow
            resource="generic-entities"
            row={selected}
            onChanged={() => qc.invalidateQueries({ queryKey: ["generic-entities"] })}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Phase 5 Task 20 — operator-facing CRUD over one Entity_Type_Def's
 * Generic_Entity records (Req 16). Reached via `/entities/:typeSlug` (a link
 * per row in `EntityTypeBuilder`'s grid). Columns are derived entirely from
 * the type's Entity_Field_Defs (Req 16.1); every change persists through
 * `EntityGrid`'s normal CRUD path over the `generic-entities` resource
 * (Req 16.2) — see `lib/genericColumns.tsx` for how each field's column/
 * editor is picked from its storage kind.
 */
export default function GenericEntityView() {
  const { typeSlug } = useParams<{ typeSlug: string }>();
  const [selected, setSelected] = useState<Row | null>(null);
  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );

  const { data: entityTypes, isLoading: typesLoading } = useQuery({
    queryKey: ["entity-type-defs"],
    queryFn: () => api.list("entity-type-defs"),
  });
  const entityType = (entityTypes ?? []).find((t) => t.slug === typeSlug) ?? null;

  const { data: allFieldDefs, isLoading: fieldsLoading } = useQuery({
    queryKey: ["entity-field-defs"],
    queryFn: () => api.list("entity-field-defs"),
  });
  const fieldDefs = useMemo(
    () =>
      (allFieldDefs ?? [])
        .filter((f) => f.entity_type_id === entityType?.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [allFieldDefs, entityType?.id]
  );

  const { map: fieldTypeMap, isLoading: fieldTypesLoading } = useLookups([
    "field-type-defs",
  ]);
  const storageKindByFieldTypeId = useMemo(() => {
    const m = new Map<number, StorageKind>();
    (fieldTypeMap["field-type-defs"] ?? []).forEach((ft) =>
      m.set(ft.id, ft.storage_kind)
    );
    return m;
  }, [fieldTypeMap]);

  // Reference-typed fields each need their own dropdown options, loaded from
  // whichever resource their `reference_target_type` names (which resource
  // that is varies per field, unlike the app's other lookup sets).
  const referenceSlugs = useMemo(
    () =>
      Array.from(
        new Set(
          fieldDefs
            .filter((f) => storageKindByFieldTypeId.get(f.field_type_id) === "reference")
            .map((f) => f.reference_target_type as string | null)
            .filter((s): s is string => !!s)
        )
      ),
    [fieldDefs, storageKindByFieldTypeId]
  );
  const { map: referenceMap, isLoading: referenceLoading } = useLookups(referenceSlugs);

  const columns = useMemo(
    () => [
      roCol("id", "ID", 60),
      ...fieldDefs.map((f) =>
        genericFieldCol(
          f,
          storageKindByFieldTypeId.get(f.field_type_id),
          f.reference_target_type ? referenceMap[f.reference_target_type as string] ?? [] : []
        )
      ),
    ],
    [fieldDefs, storageKindByFieldTypeId, referenceMap]
  );

  if (typesLoading) {
    return <div className="text-slate-500 py-8 text-center">Loading…</div>;
  }
  if (!entityType) {
    return (
      <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
        No Entity Type found for “{typeSlug}”. It may have been deleted or
        renamed — check the{" "}
        <a href="/entity-types" className="underline">
          Entity Type Builder
        </a>
        .
      </div>
    );
  }
  if (fieldsLoading || fieldTypesLoading || referenceLoading) {
    return <div className="text-slate-500 py-8 text-center">Loading…</div>;
  }

  return (
    <EntityGrid
      key={entityType.id}
      resource="generic-entities"
      title={entityType.label}
      description={
        fieldDefs.length > 0
          ? `Records of the “${entityType.label}” custom asset type. Fields marked * are meant to be required; columns are managed in the Entity Type Builder.`
          : `Records of the “${entityType.label}” custom asset type. It has no custom fields yet — add some in the Entity Type Builder.`
      }
      columns={columns}
      newRowDefaults={(): Row => ({ entity_type_id: entityType.id, attributes: {} })}
      externalFilter={(row) => row.entity_type_id === entityType.id}
      panel={<CapabilityPanel entityType={entityType} selected={selected} />}
      onSelectionChanged={handleSelection}
    />
  );
}
