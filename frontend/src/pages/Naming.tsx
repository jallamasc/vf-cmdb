import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { StencilRow } from "../components/StencilField";
import { api, Row } from "../api";
import { textCol, roCol, numCol, selectCol, flagCol } from "../lib/columns";
import { DEVICE_TYPE_ICON_NAMES } from "../lib/deviceIcons";
import { regionAbbreviationsForCountry, countriesForRegion } from "../lib/regionGeo";

// FEAT-6 (6B) / Phase 4 Task 22: device-type resources that carry a
// stencil_url + stencil upload. The backend has treated power-device-types
// identically to the other three since Task 13 (STENCIL_RESOURCES in
// special.py, stencil_url/stencil_url_back columns via migration 0009) —
// this set is the only place the frontend hadn't caught up yet.
const STENCIL_RESOURCES = new Set([
  "network-device-types",
  "compute-device-types",
  "storage-device-types",
  "power-device-types",
]);

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
  {
    name: "Power",
    description: "UPS/PDU models used when naming power gear.",
    lookups: [{ slug: "power-device-types", label: "Power Device Types" }],
  },
];

const ALL_LOOKUPS = CATEGORIES.flatMap((c) => c.lookups);

// Phase 5 Task 11 — code-split: `world-atlas`'s bundled topojson is ~100KB,
// so it (and react-simple-maps/d3) only load when the operator actually
// opens the "regions" lookup, not on every page load.
const RegionMap = lazy(() => import("../components/RegionMap"));

/**
 * Defaults for a brand-new lookup row. ``full_name`` and ``abbreviation`` are
 * NOT NULL and the abbreviation is globally unique (case-insensitive), so a
 * random suffix keeps repeated "Add row" clicks from colliding.
 */
const newLookupDefaults = () => ({
  full_name: "New entry",
  abbreviation: `new-${Math.random().toString(36).slice(2, 6)}`,
});

const baseColumns = [
  roCol("id", "ID", 70),
  textCol("full_name", "Full Name", 220),
  textCol("abbreviation", "Abbreviation", 150),
  numCol("max_length", "Max Length"),
  textCol("notes", "Notes", 300),
];

// FEAT-6 (6B): device-type grids also expose the stencil_url column.
// Phase 5 Task 9: ...and an "Icon" picker (Req 6.2) constrained to the
// lucide-react names `deviceTypeIconCol` (lib/columns.tsx) knows how to
// render, so a typo can never silently produce a missing icon elsewhere.
// Phase 5 Task 12 (Req 10): the regions lookup gets a flag column, derived
// from its abbreviation via `regionGeo`'s country mapping (see Task 11's
// documented country-level-only approximation).
const columnsFor = (slug: string) => {
  if (STENCIL_RESOURCES.has(slug)) {
    return [
      ...baseColumns,
      textCol("stencil_url", "Stencil URL", 260),
      selectCol("icon", "Icon", [null, ...DEVICE_TYPE_ICON_NAMES]),
    ];
  }
  if (slug === "regions") {
    return [
      flagCol("abbreviation", "🏳", (row) => countriesForRegion(String(row.abbreviation ?? ""))[0]),
      ...baseColumns,
    ];
  }
  return baseColumns;
};

/**
 * Phase 5 Task 29 (Req 24.1/24.2) — inline, expandable stencil management for
 * whichever device-type row is currently selected in the grid below, reusing
 * `StencilField.tsx`'s single-record `StencilRow` exactly the way
 * `GenericEntityView.tsx`'s `CapabilityPanel` already does. Replaces the old
 * always-open `<StencilField resource={active} />` block, which rendered
 * every row of the resource in a second, disconnected list above the grid
 * that already listed them (Requirement 24.2's "standalone stencil-only
 * admin page").
 */
function StencilPanel({
  resource,
  label,
  selected,
  onChanged,
}: {
  resource: string;
  label: string;
  selected: Row | null;
  onChanged: () => void;
}) {
  if (!selected) {
    return (
      <div className="mb-3 px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
        Select a {label} row below to manage its stencil.
      </div>
    );
  }
  return (
    <details className="mb-3 border border-slate-200 rounded-lg" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
        Stencil — {selected.full_name ? String(selected.full_name) : `#${selected.id}`}
      </summary>
      <div className="px-3 pb-3">
        <StencilRow resource={resource} row={selected} onChanged={onChanged} />
      </div>
    </details>
  );
}

export default function Naming() {
  const qc = useQueryClient();
  const [active, setActive] = useState(ALL_LOOKUPS[0].slug);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Phase 5 Task 29 (Req 24.1) — the row currently selected in the active
  // grid, driving the inline stencil panel below. Cleared on every lookup
  // switch alongside `mapCountry`.
  const [selected, setSelected] = useState<Row | null>(null);
  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );
  // Phase 5 Task 11 (Req 9) — RegionMap-driven narrowing, only relevant on
  // the "regions" lookup; cleared whenever the operator switches away.
  const [mapCountry, setMapCountry] = useState<string | null>(null);

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
                        onClick={() => {
                          setActive(l.slug);
                          setMapCountry(null);
                          setSelected(null);
                        }}
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
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Phase 5 Task 11 (Req 9) — region map, only on the regions lookup. */}
          {active === "regions" && (
            <Suspense
              fallback={<div className="text-sm text-slate-400 mb-3">Loading map…</div>}
            >
              <RegionMap
                regions={(results[ALL_LOOKUPS.findIndex((l) => l.slug === "regions")]?.data as Row[]) ?? []}
                selectedCountry={mapCountry}
                onSelectCountry={setMapCountry}
              />
            </Suspense>
          )}
          <EntityGrid
            key={active}
            resource={active}
            title={activeLabel}
            columns={columnsFor(active)}
            // full_name + abbreviation are NOT NULL on every naming lookup and
            // the abbreviation must be globally unique — seed a placeholder so
            // "Add row" always succeeds and the user just renames it.
            newRowDefaults={newLookupDefaults}
            requiredFields={[
              { field: "full_name", label: "Full Name" },
              {
                field: "abbreviation",
                label: "Abbreviation",
                hint: "Abbreviations are globally unique (case-insensitive).",
              },
            ]}
            externalFilter={
              active === "regions" && mapCountry
                ? (row) =>
                    regionAbbreviationsForCountry(mapCountry, [String(row.abbreviation ?? "")])
                      .length > 0
                : undefined
            }
            // Phase 5 Task 29 (Req 24.1/24.2) — inline, expandable stencil
            // management for the selected row, replacing the old standalone
            // "list every row" stencil panel.
            panel={
              STENCIL_RESOURCES.has(active) ? (
                <StencilPanel
                  resource={active}
                  label={activeLabel}
                  selected={selected}
                  onChanged={() => qc.invalidateQueries({ queryKey: [active] })}
                />
              ) : undefined
            }
            onSelectionChanged={handleSelection}
          />
        </div>
      </div>
    </div>
  );
}
