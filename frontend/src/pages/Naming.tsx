import { useState } from "react";
import EntityGrid from "../components/EntityGrid";
import { textCol, roCol, numCol } from "../lib/columns";

const LOOKUPS: { slug: string; label: string }[] = [
  { slug: "organizations", label: "Organizations" },
  { slug: "clouds", label: "Clouds" },
  { slug: "regions", label: "Regions" },
  { slug: "campuses", label: "Campuses" },
  { slug: "buildings", label: "Buildings" },
  { slug: "floor-sections", label: "Floor / Sections" },
  { slug: "compute-device-types", label: "Compute Device Types" },
  { slug: "brands", label: "Brands" },
  { slug: "device-roles", label: "Device Roles" },
  { slug: "network-device-types", label: "Network Device Types" },
  { slug: "network-subtypes", label: "Network Subtypes" },
  { slug: "os-families", label: "OS Families" },
  { slug: "os-versions", label: "OS Versions" },
  { slug: "app-types", label: "App Types" },
  { slug: "cluster-types", label: "Cluster Types" },
  { slug: "storage-device-types", label: "Storage Device Types" },
  { slug: "network-id-types", label: "Network ID Types" },
];

const columns = [
  roCol("id", "ID", 70),
  textCol("full_name", "Full Name", 220),
  textCol("abbreviation", "Abbreviation", 150),
  numCol("max_length", "Max Length"),
  textCol("notes", "Notes", 300),
];

export default function Naming() {
  const [active, setActive] = useState(LOOKUPS[0].slug);
  const activeLabel = LOOKUPS.find((l) => l.slug === active)?.label ?? "";
  return (
    <div className="flex flex-col h-full">
      <h1 className="text-xl font-semibold mb-1">Naming Conventions</h1>
      <p className="text-sm text-slate-500 mb-3">
        The reference lookups that drive every auto-generated name. Editing an
        abbreviation changes how new names are generated.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {LOOKUPS.map((l) => (
          <button
            key={l.slug}
            onClick={() => setActive(l.slug)}
            className={`px-2.5 py-1 rounded text-xs ${
              active === l.slug
                ? "bg-blue-600 text-white"
                : "bg-slate-200 hover:bg-slate-300"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="flex-1">
        <EntityGrid
          key={active}
          resource={active}
          title={activeLabel}
          columns={columns}
        />
      </div>
    </div>
  );
}
