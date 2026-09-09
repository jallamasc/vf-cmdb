import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ICellRendererParams } from "ag-grid-community";
import EntityGrid from "../components/EntityGrid";
import EntityTypeDetailPanel from "../components/EntityTypeDetailPanel";
import { roCol, textCol, iconCol, useLookups } from "../lib/columns";
import { CAPABILITY_LABELS } from "../lib/capabilities";
import { Row } from "../api";

/**
 * Phase 5 Task 19 — one screen to define an Entity_Type_Def, toggle its
 * Capabilities, and manage its Entity_Field_Defs (Req 15.1), tying Tasks
 * 14/16/17/18 together.
 *
 * Follows `Sites.tsx`'s master/detail shape: the main `EntityGrid` lists
 * every Entity_Type_Def (slug/label/icon/description are plain editable cells —
 * `capabilities` is not a grid column here since it is a JSONB array, not a
 * scalar; it is edited exclusively through the detail panel's toggle
 * group), and `onSelectionChanged` drives `EntityTypeDetailPanel` the same
 * way `SiteCodePanel` is driven from the Sites grid's selection.
 */

// Phase 5 Task 20 — link into the operator-facing generic-entity CRUD grid
// for this type (`/entities/:typeSlug`), the same "read-only + Link"
// idiom `deviceLinkCol` (lib/columns.tsx) uses for the device dashboard.
function recordsLinkCol() {
  return {
    colId: "records_link",
    headerName: "Records",
    editable: false,
    sortable: false,
    filter: false,
    width: 110,
    cellRenderer: (p: ICellRendererParams) => {
      const slug = p.data?.slug;
      if (!slug) return null;
      return (
        <Link to={`/entities/${slug}`} className="text-blue-600 hover:text-blue-800 hover:underline">
          View records →
        </Link>
      );
    },
  };
}

/**
 * Bug fix — "only slug and label are not enough fields to create a type of
 * devices." The row itself only ever needed 4 plain columns (slug/label/
 * icon/description) — Capabilities (9 toggles) and Custom Fields (an
 * unlimited key/label/type/required/order list) are real, substantial
 * configuration, they just lived ENTIRELY inside the detail panel below
 * with no trace in the grid itself, so a type with a rich definition
 * looked identical to a bare, unfinished one at a glance. These two
 * read-only summary columns surface what's actually configured without
 * requiring a click into the panel — the panel is still where you edit
 * them (a JSONB array and a one-to-many list don't fit a single grid
 * cell), this just makes clear there's more than slug/label.
 */
function capabilitiesSummaryCol() {
  return {
    colId: "capabilities_summary",
    headerName: "Capabilities",
    editable: false,
    sortable: false,
    filter: false,
    width: 220,
    valueGetter: (p: { data?: Row }) => {
      const caps = Array.isArray(p.data?.capabilities) ? (p.data!.capabilities as string[]) : [];
      if (caps.length === 0) return "";
      return caps.map((c) => CAPABILITY_LABELS[c as keyof typeof CAPABILITY_LABELS] ?? c).join(", ");
    },
    cellRenderer: (p: ICellRendererParams) =>
      p.value ? (
        <span className="text-xs">{p.value}</span>
      ) : (
        <span className="text-xs text-slate-400 italic">none yet — set below</span>
      ),
  };
}

function fieldsCountCol(countByType: Map<number, number>) {
  return {
    colId: "fields_count",
    headerName: "Fields",
    editable: false,
    sortable: true,
    filter: false,
    width: 100,
    valueGetter: (p: { data?: Row }) => (p.data ? countByType.get(p.data.id as number) ?? 0 : 0),
  };
}

const baseColumns = [
  roCol("id", "ID", 60),
  textCol("label", "Label", 200),
  textCol("slug", "Slug", 170),
  // Phase 6 Task 10 (Req 4.1/4.2) — was a plain free-text field; now the
  // same fuzzy-searchable, preview-showing Icon_Picker as every other
  // registry.
  iconCol(),
  textCol("description", "Description"),
];

// slug/label are NOT NULL — seed a placeholder so "+ Add row" always
// succeeds and the administrator just renames it (same idiom as
// Naming.tsx's newLookupDefaults / ReferenceData.tsx's Field Types panel).
const newEntityTypeDefaults = () => ({
  slug: `entity-type-${Math.random().toString(36).slice(2, 8)}`,
  // Phase 6 Task 4 (Req 3.1/3.3) — `label` is now table-wide unique.
  label: `New Entity Type ${Math.random().toString(36).slice(2, 6)}`,
  capabilities: [],
});

export default function EntityTypeBuilder() {
  const [selected, setSelected] = useState<Row | null>(null);
  // Bug fix — surfaces the "Fields" count column below without an N+1
  // fetch per row: one extra list call for the whole entity-field-defs
  // table, same idiom `Naming.tsx` uses for its per-lookup entry counts.
  const { map, isLoading: fieldsLoading } = useLookups(["entity-field-defs"]);
  const fieldCountByType = useMemo(() => {
    const counts = new Map<number, number>();
    for (const f of map["entity-field-defs"] ?? []) {
      const typeId = f.entity_type_id as number;
      counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
    }
    return counts;
  }, [map]);

  const columns = useMemo(
    () => [...baseColumns, capabilitiesSummaryCol(), fieldsCountCol(fieldCountByType), recordsLinkCol()],
    [fieldCountByType]
  );

  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );

  // Don't block the whole page on the "Fields" count lookup — it's a
  // nice-to-have summary, not something worth delaying entity-type
  // creation/editing for. Counts just read as 0 until it resolves.
  void fieldsLoading;
  return (
    <EntityGrid
      resource="entity-type-defs"
      title="Entity Type Builder"
      description="Define new kinds of managed asset in 2 steps: (1) add a row here for its Label/Slug/Icon/Description — a new row is selected automatically so step 2 opens right away; (2) use the panel below to toggle its Capabilities (rack placement, power/network ports, cabling, IP assignment, Ansible management, photo, stencil diagram, blueprint) and define its Custom Fields. The Capabilities/Fields columns below are a read-only summary of step 2 — edit them in the panel, not here."
      columns={columns}
      newRowDefaults={newEntityTypeDefaults}
      requiredFields={[
        { field: "slug", label: "Slug" },
        { field: "label", label: "Label" },
      ]}
      panel={<EntityTypeDetailPanel entityType={selected} />}
      onSelectionChanged={handleSelection}
    />
  );
}
