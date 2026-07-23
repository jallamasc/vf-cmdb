import { useState } from "react";
import EntityGrid from "../components/EntityGrid";
import { textCol, roCol } from "../lib/columns";

interface RefTable {
  slug: string;
  label: string;
  description: string;
  columns: ReturnType<typeof textCol>[];
  newRowDefaults?: Record<string, unknown>;
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
      textCol("notes", "Notes", 240),
    ],
    newRowDefaults: { label: "New address" },
  },
  {
    slug: "rack-types",
    label: "Rack Types",
    description:
      "Reusable rack models (height in U, code) picked when creating racks on the Physical Hierarchy page.",
    columns: [
      roCol("id", "ID", 70),
      textCol("name", "Name", 200),
      textCol("code", "Code", 120),
      textCol("total_units", "Height (U)", 120),
      textCol("case_enforcement", "Case Enforcement", 160),
      textCol("description", "Description", 260),
    ],
    newRowDefaults: { name: "New rack type", total_units: 42 },
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
        />
      </div>
    </div>
  );
}
