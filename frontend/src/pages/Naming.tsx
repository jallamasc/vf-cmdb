import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { api } from "../api";
import { textCol, roCol, numCol } from "../lib/columns";

interface Lookup {
  slug: string;
  label: string;
}

// Naming-convention dictionaries grouped into meaningful categories so large
// sets stay manageable. Every slug here is a true abbreviation → full-name
// mapping that drives the auto-naming engine.
const CATEGORIES: { name: string; description: string; lookups: Lookup[] }[] = [
  {
    name: "Organization & Location",
    description: "Hierarchy that builds site names.",
    lookups: [
      { slug: "organizations", label: "Organizations" },
      { slug: "clouds", label: "Clouds" },
      { slug: "regions", label: "Regions" },
      { slug: "campuses", label: "Campuses" },
      { slug: "buildings", label: "Buildings" },
      { slug: "floor-sections", label: "Floor / Sections" },
    ],
  },
  {
    name: "Network Devices",
    description: "Types used when naming network gear.",
    lookups: [
      { slug: "network-device-types", label: "Network Device Types" },
      { slug: "network-subtypes", label: "Network Subtypes" },
      { slug: "network-id-types", label: "Network ID Types" },
    ],
  },
  {
    name: "Compute",
    description: "Servers, VMs, containers and apps.",
    lookups: [
      { slug: "compute-device-types", label: "Compute Device Types" },
      { slug: "cluster-types", label: "Cluster Types" },
      { slug: "app-types", label: "App Types" },
    ],
  },
  {
    name: "Operating Systems",
    description: "OS families and versions.",
    lookups: [
      { slug: "os-families", label: "OS Families" },
      { slug: "os-versions", label: "OS Versions" },
    ],
  },
  {
    name: "Roles & Hardware",
    description: "Device roles and manufacturer brands.",
    lookups: [
      { slug: "device-roles", label: "Device Roles" },
      { slug: "brands", label: "Brands" },
    ],
  },
  {
    name: "Storage",
    description: "Storage device categories.",
    lookups: [{ slug: "storage-device-types", label: "Storage Device Types" }],
  },
];

const ALL_LOOKUPS = CATEGORIES.flatMap((c) => c.lookups);

const columns = [
  roCol("id", "ID", 70),
  textCol("full_name", "Full Name", 220),
  textCol("abbreviation", "Abbreviation", 150),
  numCol("max_length", "Max Length"),
  textCol("notes", "Notes", 300),
];

export default function Naming() {
  const [active, setActive] = useState(ALL_LOOKUPS[0].slug);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Fetch every lookup once to show per-category / per-lookup entry counts.
  // Shares the react-query cache with the grid below (same query keys).
  const results = useQueries({
    queries: ALL_LOOKUPS.map((l) => ({
      queryKey: [l.slug],
      queryFn: () => api.list(l.slug),
    })),
  });
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    ALL_LOOKUPS.forEach((l, i) => {
      c[l.slug] = (results[i].data as unknown[] | undefined)?.length ?? 0;
    });
    return c;
  }, [results]);

  const q = search.trim().toLowerCase();
  const matches = (l: Lookup) =>
    q === "" || l.label.toLowerCase().includes(q) || l.slug.includes(q);

  const activeLabel =
    ALL_LOOKUPS.find((l) => l.slug === active)?.label ?? "";

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-xl font-semibold mb-1">Naming Conventions</h1>
      <p className="text-sm text-slate-500 mb-3">
        The abbreviation → full-name dictionaries that drive every
        auto-generated name. Editing an abbreviation changes how new names are
        generated. (Physical addresses and other non-naming lists live under{" "}
        <span className="font-medium">Reference Data</span>.)
      </p>

      <div className="flex gap-5 flex-1 min-h-0">
        {/* Category navigator */}
        <div className="w-72 shrink-0 overflow-auto pr-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search naming conventions…"
            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm mb-3"
          />
          {CATEGORIES.map((cat) => {
            const visible = cat.lookups.filter(matches);
            if (visible.length === 0) return null;
            const total = cat.lookups.reduce(
              (sum, l) => sum + (counts[l.slug] ?? 0),
              0
            );
            const isCollapsed = collapsed[cat.name] && q === "";
            return (
              <div key={cat.name} className="mb-2">
                <button
                  onClick={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [cat.name]: !prev[cat.name],
                    }))
                  }
                  className="w-full flex items-center justify-between px-2 py-1.5 text-left rounded hover:bg-slate-100"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-xs">
                      {isCollapsed ? "▶" : "▼"}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {cat.name}
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {total} entries
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="mt-1 space-y-0.5">
                    {visible.map((l) => (
                      <button
                        key={l.slug}
                        onClick={() => setActive(l.slug)}
                        className={`w-full flex items-center justify-between pl-6 pr-2 py-1.5 rounded text-sm ${
                          active === l.slug
                            ? "bg-blue-600 text-white"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span>{l.label}</span>
                        <span
                          className={`text-[11px] rounded-full px-1.5 ${
                            active === l.slug
                              ? "bg-blue-500 text-white"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {counts[l.slug] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {CATEGORIES.every((c) => c.lookups.filter(matches).length === 0) && (
            <div className="text-sm text-slate-400 px-2 py-3">
              No conventions match “{search}”.
            </div>
          )}
        </div>

        {/* Active lookup grid */}
        <div className="flex-1 min-w-0">
          <EntityGrid
            key={active}
            resource={active}
            title={activeLabel}
            columns={columns}
          />
        </div>
      </div>
    </div>
  );
}
