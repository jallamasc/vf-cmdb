import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import type { ICellRendererParams } from "ag-grid-community";
import EntityGrid from "../components/EntityGrid";
import EntityTypeDetailPanel from "../components/EntityTypeDetailPanel";
import { roCol, textCol, iconCol } from "../lib/columns";
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

const columns = [
  roCol("id", "ID", 60),
  textCol("slug", "Slug", 170),
  textCol("label", "Label", 200),
  // Phase 6 Task 10 (Req 4.1/4.2) — was a plain free-text field; now the
  // same fuzzy-searchable, preview-showing Icon_Picker as every other
  // registry.
  iconCol(),
  textCol("description", "Description"),
  recordsLinkCol(),
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

  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );

  return (
    <EntityGrid
      resource="entity-type-defs"
      title="Entity Type Builder"
      description="Define new kinds of managed asset. Select a row below to toggle which built-in capabilities it participates in (rack placement, power/network ports, cabling, IP assignment, Ansible management, photo, stencil diagram, blueprint) and to manage its custom fields."
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
