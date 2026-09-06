import { useCallback, useState } from "react";
import EntityGrid from "../components/EntityGrid";
import EntityTypeDetailPanel from "../components/EntityTypeDetailPanel";
import { roCol, textCol } from "../lib/columns";
import { Row } from "../api";

/**
 * Phase 5 Task 19 — one screen to define an Entity_Type_Def, toggle its
 * Capabilities, and manage its Entity_Field_Defs (Req 15.1), tying Tasks
 * 14/16/17/18 together.
 *
 * Follows `Sites.tsx`'s master/detail shape: the main `EntityGrid` lists
 * every Entity_Type_Def (slug/label/icon/notes are plain editable cells —
 * `capabilities` is not a grid column here since it is a JSONB array, not a
 * scalar; it is edited exclusively through the detail panel's toggle
 * group), and `onSelectionChanged` drives `EntityTypeDetailPanel` the same
 * way `SiteCodePanel` is driven from the Sites grid's selection.
 */

const columns = [
  roCol("id", "ID", 60),
  textCol("slug", "Slug", 170),
  textCol("label", "Label", 200),
  textCol("icon", "Icon (lucide name)", 180),
  textCol("notes", "Notes"),
];

// slug/label are NOT NULL — seed a placeholder so "+ Add row" always
// succeeds and the administrator just renames it (same idiom as
// Naming.tsx's newLookupDefaults / ReferenceData.tsx's Field Types panel).
const newEntityTypeDefaults = () => ({
  slug: `entity-type-${Math.random().toString(36).slice(2, 8)}`,
  label: "New Entity Type",
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
