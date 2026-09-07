import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
 *
 * Phase 5 Task 32 (Req 26.2) — also shows the selected record's linked usage
 * / management IP when the type has the ip_assignment Capability. Read-only:
 * both are already required (and thus already linked) on every record with
 * this capability by the time it can be selected here — see
 * `CreateWithIpForm` below for how a brand-new record links them.
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
  const hasIpAssignment = capabilities.includes("ip_assignment");

  const { data: usageIp } = useQuery({
    queryKey: ["ip-assignments", selected?.ip_id],
    queryFn: () => api.get("ip-assignments", selected!.ip_id),
    enabled: hasIpAssignment && selected?.ip_id != null,
  });
  const { data: managementIp } = useQuery({
    queryKey: ["ip-assignments", selected?.management_ip_id],
    queryFn: () => api.get("ip-assignments", selected!.management_ip_id),
    enabled: hasIpAssignment && selected?.management_ip_id != null,
  });

  if (!hasPhoto && !hasStencil && !hasIpAssignment) return null;

  if (!selected) {
    return (
      <div className="mb-3 px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
        Select a row to manage its{" "}
        {[hasPhoto && "photo", hasStencil && "stencil", hasIpAssignment && "IP assignment"]
          .filter(Boolean)
          .join(" / ")}
        .
      </div>
    );
  }

  const addressOf = (ip: Row | undefined) =>
    ip?.ipv4_address || ip?.ipv6_address || (ip ? `#${ip.id}` : "—");

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
      {hasIpAssignment && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            IP assignment
          </p>
          <p className="text-sm text-slate-700">
            Usage: <span className="font-mono">{addressOf(usageIp)}</span>
            {"  ·  "}
            Management: <span className="font-mono">{addressOf(managementIp)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Phase 5 Task 32 (Req 26.1) — a Generic_Entity whose Entity_Type_Def has the
 * ip_assignment Capability must be created with BOTH a usage IP and a
 * management IP already linked; `crud._validate_generic_entity_ip_assignment`
 * rejects a create/update missing either once the capability is on.
 * `EntityGrid`'s own "+ Add row" (a single synchronous defaults object,
 * POSTed immediately) can't supply that — the two IpAssignment rows have to
 * exist first — so for this capability it's replaced with this small guided
 * form: create the usage IP, the management IP, then the record referencing
 * both, then point each IpAssignment's `assigned_to_type`/`assigned_to_id`
 * back at the new record (the same polymorphic linkage every other
 * `ip_assignments` row uses, e.g. `DeviceDashboard.tsx`'s IpAssignmentsTab).
 */
function CreateWithIpForm({ entityType }: { entityType: Row }) {
  const qc = useQueryClient();
  const [usageIp, setUsageIp] = useState("");
  const [managementIp, setManagementIp] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const usage = await api.create("ip-assignments", {
        ipv4_address: usageIp.trim(),
        status: "active",
        is_primary: true,
      });
      const management = await api.create("ip-assignments", {
        ipv4_address: managementIp.trim(),
        status: "active",
        is_primary: false,
      });
      const entity = await api.create("generic-entities", {
        entity_type_id: entityType.id,
        attributes: {},
        ip_id: usage.id,
        management_ip_id: management.id,
      });
      await Promise.all([
        api.update("ip-assignments", usage.id, {
          assigned_to_type: "generic-entities",
          assigned_to_id: entity.id,
        }),
        api.update("ip-assignments", management.id, {
          assigned_to_type: "generic-entities",
          assigned_to_id: entity.id,
        }),
      ]);
      return entity;
    },
    onSuccess: () => {
      setStatus("Created");
      setUsageIp("");
      setManagementIp("");
      qc.invalidateQueries({ queryKey: ["generic-entities"] });
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Create failed"),
  });

  return (
    <div className="mb-3 px-3 py-2.5 border border-slate-200 bg-slate-50 rounded space-y-2">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        Create a record — usage + management IP required
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={usageIp}
          onChange={(e) => setUsageIp(e.target.value)}
          placeholder="Usage IP, e.g. 10.0.0.5"
          className="border border-slate-300 rounded px-2 py-1 text-sm flex-1 min-w-[10rem]"
        />
        <input
          value={managementIp}
          onChange={(e) => setManagementIp(e.target.value)}
          placeholder="Management IP, e.g. 10.0.1.5"
          className="border border-slate-300 rounded px-2 py-1 text-sm flex-1 min-w-[10rem]"
        />
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || !usageIp.trim() || !managementIp.trim()}
          className="px-2.5 py-1 text-sm rounded bg-slate-800 text-white disabled:opacity-50"
        >
          {create.isPending ? "Creating…" : "Create record"}
        </button>
      </div>
      {status && <span className="text-xs text-slate-500">{status}</span>}
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

  // Phase 5 Task 32 (Req 26.1) — a bare "+ Add row" can't satisfy the
  // ip_assignment Capability's requirement that both IPs are linked from
  // the start, so it's hidden in favor of `CreateWithIpForm` above the grid.
  const hasIpAssignment = Array.isArray(entityType.capabilities)
    ? entityType.capabilities.includes("ip_assignment")
    : false;

  return (
    <>
      {hasIpAssignment && <CreateWithIpForm entityType={entityType} />}
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
        allowAdd={!hasIpAssignment}
        externalFilter={(row) => row.entity_type_id === entityType.id}
        panel={<CapabilityPanel entityType={entityType} selected={selected} />}
        onSelectionChanged={handleSelection}
      />
    </>
  );
}
