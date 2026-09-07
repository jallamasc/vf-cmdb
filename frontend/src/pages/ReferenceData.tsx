import { useState } from "react";
import EntityGrid from "../components/EntityGrid";
import type { RequiredField } from "../components/EntityGrid";
import { textCol, roCol, flagCol, selectCol, boolCol, iconCol } from "../lib/columns";
import { STORAGE_KIND_VALUES } from "../lib/fieldTypes";

interface RefTable {
  slug: string;
  label: string;
  description: string;
  columns: ReturnType<typeof textCol>[];
  newRowDefaults?: Record<string, unknown> | (() => Record<string, unknown>);
  /** Columns the database declares NOT NULL. */
  requiredFields?: RequiredField[];
}

// Reference data = lookup lists that are NOT naming conventions. They hold
// real-world values (addresses, etc.) referenced by other records but play no
// part in the auto-naming engine.
const TABLES: RefTable[] = [
  {
    slug: "site-addresses",
    label: "Site Addresses",
    description:
      "Physical addresses referenced by Sites. Editing here updates the Address dropdown on the Sites page.",
    columns: [
      roCol("id", "ID", 70),
      textCol("label", "Label", 220),
      textCol("street", "Street", 200),
      textCol("city", "City", 140),
      textCol("state_region", "State / Region", 160),
      textCol("postal_code", "Postal Code", 130),
      textCol("country", "Country", 140),
      flagCol("country", "🏳", undefined, 50),
      textCol("description", "Description", 240),
    ],
    newRowDefaults: { label: "New address" },
    requiredFields: [{ field: "label", label: "Label" }],
  },
  {
    slug: "rack-types",
    label: "Rack Types",
    description:
      "Reusable rack models (height in U, code) picked when creating racks on the Physical Hierarchy page.",
    columns: [
      roCol("id", "ID", 70),
      iconCol(),
      textCol("name", "Name", 200),
      textCol("code", "Code", 120),
      textCol("total_units", "Height (U)", 120),
      textCol("case_enforcement", "Case Enforcement", 160),
      textCol("description", "Description", 260),
    ],
    // Phase 6 Task 4 (Req 3.1/3.3) — `name` is now table-wide unique;
    // randomize the placeholder so a second "Add row" click doesn't collide.
    newRowDefaults: () => ({
      name: `New rack type ${Math.random().toString(36).slice(2, 6)}`,
      total_units: 42,
    }),
    requiredFields: [{ field: "name", label: "Name" }],
  },
  {
    // Phase 5 Task 15 (Req 11.2) — named field types available when
    // defining custom fields on an Entity_Type_Def (Sub-phase C). The 6
    // builtin rows (one per storage kind) are seeded and protected from
    // deletion by the backend; an administrator can add further named
    // types on top of the same fixed storage kinds here.
    slug: "field-type-defs",
    label: "Field Types",
    description:
      "Field types available when defining custom fields for a custom entity type. The 6 builtin rows (one per storage kind) can't be deleted, but you can add new named types on top of the same storage kinds — e.g. a \"MAC Address\" type backed by \"text\".",
    columns: [
      roCol("id", "ID", 70),
      iconCol(),
      textCol("slug", "Slug", 160),
      textCol("label", "Label", 180),
      selectCol("storage_kind", "Storage Kind", [...STORAGE_KIND_VALUES]),
      roCol("builtin", "Builtin", 90),
      textCol("description", "Description", 240),
    ],
    newRowDefaults: () => ({
      slug: `custom-${Math.random().toString(36).slice(2, 6)}`,
      // Phase 6 Task 4 (Req 3.1/3.3) — `label` is now table-wide unique.
      label: `New field type ${Math.random().toString(36).slice(2, 6)}`,
      storage_kind: "text",
    }),
    requiredFields: [
      { field: "slug", label: "Slug", hint: "Slugs are globally unique." },
      { field: "label", label: "Label" },
      { field: "storage_kind", label: "Storage Kind" },
    ],
  },
  {
    // Phase 5 Task 24 (Req 20.1/20.2) — hide (or explicitly re-show) a
    // named field/column on a named hardcoded entity's grid, without a
    // code change. Absence of a row means "visible" — only add one to
    // deviate from that default. `entity_slug`/`field_key` are free text
    // (not FK/enum-constrained — see the model docstring for why), so a
    // typo just has no effect rather than erroring.
    slug: "field-visibility-overrides",
    label: "Field Visibility",
    description:
      "Hide (or explicitly re-show) a named column on a named entity's grid. Use the exact resource slug (e.g. \"network-devices\") and field/column name (e.g. \"serial_number\") — a typo has no effect, it just won't match any real column.",
    columns: [
      roCol("id", "ID", 70),
      textCol("entity_slug", "Entity Slug", 180),
      textCol("field_key", "Field Key", 180),
      boolCol("visible", "Visible"),
    ],
    newRowDefaults: { entity_slug: "network-devices", field_key: "", visible: false },
    requiredFields: [
      { field: "entity_slug", label: "Entity Slug" },
      { field: "field_key", label: "Field Key" },
    ],
  },
];

export default function ReferenceData() {
  const [active, setActive] = useState(TABLES[0].slug);
  const table = TABLES.find((t) => t.slug === active) ?? TABLES[0];

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-xl font-semibold mb-1">Reference Data</h1>
      <p className="text-sm text-slate-500 mb-3">
        Non-naming reference lists (addresses and similar). These are kept
        separate from <span className="font-medium">Naming Conventions</span>{" "}
        because they are not abbreviation dictionaries used for auto-naming.
      </p>

      {TABLES.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {TABLES.map((t) => (
            <button
              key={t.slug}
              onClick={() => setActive(t.slug)}
              className={`px-2.5 py-1 rounded text-xs ${
                active === t.slug
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200 hover:bg-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1">
        <EntityGrid
          key={table.slug}
          resource={table.slug}
          title={table.label}
          description={table.description}
          columns={table.columns}
          newRowDefaults={table.newRowDefaults ?? {}}
          requiredFields={table.requiredFields ?? []}
        />
      </div>
    </div>
  );
}
