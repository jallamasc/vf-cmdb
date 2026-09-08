import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ICellRendererParams } from "ag-grid-community";
import { useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { StencilPanel } from "../components/StencilField";
import HardwareSpecPanel, { hasHardwareSpecFields } from "../components/HardwareSpecPanel";
import { api, Row } from "../api";
import { textCol, roCol, numCol, selectCol, flagCol, iconCol } from "../lib/columns";
import { regionAbbreviationsForCountry, countriesForRegion } from "../lib/regionGeo";
import OsNameEditor from "../components/OsNameEditor";
import { familyLabelByVersionId, latestNPerFamily } from "../lib/osVersionGrouping";

// Naming-convention modifications (item 4) — link into the dedicated
// per-region detail page (`RegionDetail.tsx`), the same "read-only + Link"
// idiom `recordsLinkCol` (EntityTypeBuilder.tsx) / `deviceLinkCol`
// (lib/columns.tsx) already use elsewhere, rather than replacing the
// editable Full Name cell itself.
function regionDetailLinkCol() {
  return {
    colId: "region_detail_link",
    headerName: "Details",
    editable: false,
    sortable: false,
    filter: false,
    width: 110,
    cellRenderer: (p: ICellRendererParams) => {
      const id = p.data?.id;
      if (id == null) return null;
      return (
        <Link
          to={`/regions/${id}`}
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          View details →
        </Link>
      );
    },
  };
}

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
 * Defaults for a brand-new lookup row. ``full_name`` is NOT NULL and now
 * table-wide unique (case-insensitive), so a random suffix keeps repeated
 * "Add row" clicks from colliding. ``abbreviation`` is no longer sent —
 * it's always forced server-side from ``full_name`` (Bug fix, post-Phase-6
 * QA — see ``crud.py``'s ``_auto_abbreviate``).
 */
const newLookupDefaults = () => ({
  full_name: `New entry ${Math.random().toString(36).slice(2, 6)}`,
});

// Phase 6 Task 10 (Req 4.1/4.2) — every lookup now has an `icon` column,
// picked via the wide fuzzy-searchable Icon_Picker (`iconCol`), not just
// the 4 device-type lookups' old narrower allow-list.
const baseColumns = [
  roCol("id", "ID", 70),
  iconCol(),
  textCol("full_name", "Full Name", 220),
  // Bug fix (post-Phase-6 QA) — the abbreviation is now ALWAYS forced,
  // server-side, from Full Name (crud.py's `_auto_abbreviate`, default
  // consonant-stripping — "Hoymeaseguro" -> "hm"-style), so it's read-only
  // here instead of a freeform text cell an operator could still overtype.
  roCol("abbreviation", "Abbreviation", 150),
  // Naming-convention modifications (item 1) — Max Length now bounds the
  // abbreviation's own length (backend rejects a longer one), so it's a
  // constrained 1-9 dropdown instead of a freeform number that could
  // silently be set to something meaningless like 42.
  selectCol("max_length", "Max Length", [null, 1, 2, 3, 4, 5, 6, 7, 8, 9], { width: 120 }),
  textCol("description", "Description", 300),
];

// FEAT-6 (6B): device-type grids also expose the stencil_url column.
// Phase 5 Task 12 (Req 10): the regions lookup gets a flag column, derived
// from its abbreviation via `regionGeo`'s country mapping (see Task 11's
// documented country-level-only approximation).
const columnsFor = (slug: string) => {
  if (STENCIL_RESOURCES.has(slug)) {
    return [...baseColumns, textCol("stencil_url", "Stencil URL", 260)];
  }
  // Naming-convention modifications (item 5) — OsFamily.full_name gets a
  // curated OS/platform-name picker (Android, Ubuntu, Cisco IOS, ...)
  // instead of a plain free-text cell, so creating a well-known OS means
  // picking it rather than hand-typing it. Everything else about the
  // lookup grid stays the same as `baseColumns`.
  if (slug === "os-families") {
    return baseColumns.map((col) =>
      col.field === "full_name"
        ? { ...col, cellEditor: OsNameEditor, cellEditorPopup: true }
        : col
    );
  }
  if (slug === "regions") {
    return [
      flagCol("abbreviation", "🏳", (row) => countriesForRegion(String(row.abbreviation ?? ""))[0]),
      // Bug fix (post-Phase-6 QA) — moved next to the flag, right up
      // front, instead of after every other column (off-screen without
      // scrolling, which is why "clicking a region" only ever seemed to
      // select/focus it rather than visibly offering a detail page).
      regionDetailLinkCol(),
      ...baseColumns,
      // Bug-fix (post-Phase-6 QA) — surfaced here so "click a region's map
      // marker" has visible detail to focus on, and so an operator can also
      // type a coordinate directly as an alternative to the map's
      // click-to-place editor (Req 7.3).
      numCol("latitude", "Latitude"),
      numCol("longitude", "Longitude"),
    ];
  }
  return baseColumns;
};

/**
 * Phase 5 Task 29 (Req 24.1/24.2) — inline, expandable stencil management for
 * whichever device-type row is currently selected in the grid below, reusing
 * `StencilField.tsx`'s single-record `StencilRow` (via the shared
 * `StencilPanel` wrapper, promoted there in Phase 6 Task 27) exactly the way
 * `GenericEntityView.tsx`'s `CapabilityPanel` already does. Replaces the old
 * always-open `<StencilField resource={active} />` block, which rendered
 * every row of the resource in a second, disconnected list above the grid
 * that already listed them (Requirement 24.2's "standalone stencil-only
 * admin page").
 */
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
  // Bug-fix (post-Phase-6 QA, Req 7.2/9.2) — the id of the region whose own
  // marker was clicked, narrowing the list to that EXACT region (takes
  // priority over the coarser country-polygon filter below).
  const [focusedRegionId, setFocusedRegionId] = useState<number | null>(null);
  // Phase 6 Task 19 (Req 7.3) — click-to-place mode for the selected
  // region's real-world location.
  const [placingLocation, setPlacingLocation] = useState(false);

  // Naming-convention modifications (item 6) — OS Versions default to
  // showing only the latest 4 per family (endoflife.date syncs EVERY
  // release ever tracked, which balloons into 100+ rows); an operator can
  // lift the cap to see the full history.
  const [showAllOsVersions, setShowAllOsVersions] = useState(false);
  const placeRegionPoint = useMutation({
    mutationFn: ({ id, lat, lng }: { id: number; lat: number; lng: number }) =>
      api.update("regions", id, { latitude: lat, longitude: lng }),
    onSuccess: () => {
      setPlacingLocation(false);
      qc.invalidateQueries({ queryKey: ["regions"] });
    },
  });

  // Phase 6 Task 30 (Req 12.1) — manual "Sync now" trigger for the
  // endoflife.date sync, shown only on the OS Families/Versions lookups.
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const syncOsData = useMutation({
    mutationFn: () => api.syncOsData(),
    onSuccess: (result) => {
      const parts = [
        `+${result.families_created.length} famil${result.families_created.length === 1 ? "y" : "ies"}`,
        `+${result.versions_created.length} version${result.versions_created.length === 1 ? "" : "s"}`,
      ];
      if (result.skipped_conflicts.length) parts.push(`${result.skipped_conflicts.length} skipped (name conflict)`);
      if (result.products_unreachable.length) parts.push(`${result.products_unreachable.length} unreachable`);
      setSyncStatus(parts.join(", "));
      qc.invalidateQueries({ queryKey: ["os-families"] });
      qc.invalidateQueries({ queryKey: ["os-versions"] });
    },
    onError: (e: unknown) => setSyncStatus(e instanceof Error ? e.message : "Sync failed"),
  });

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

  // Naming-convention modifications (item 6) — OS Versions grouping data,
  // derived from whichever family a version's own abbreviation matches
  // (there's no real FK — see `lib/osVersionGrouping.ts`).
  const osFamilies = (results[ALL_LOOKUPS.findIndex((l) => l.slug === "os-families")]?.data as Row[]) ?? [];
  const osVersions = (results[ALL_LOOKUPS.findIndex((l) => l.slug === "os-versions")]?.data as Row[]) ?? [];
  const osVersionFamilyLabels = useMemo(
    () => familyLabelByVersionId(osVersions, osFamilies),
    [osVersions, osFamilies]
  );
  const latestOsVersionIds = useMemo(
    () => latestNPerFamily(osVersions, osFamilies, 4),
    [osVersions, osFamilies]
  );

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
                          setFocusedRegionId(null);
                          setSelected(null);
                          setPlacingLocation(false);
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
          {/* Phase 6 Task 30 (Req 12.1) — manual endoflife.date sync,
              only on the OS Families/Versions lookups. */}
          {(active === "os-families" || active === "os-versions") && (
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSyncStatus(null);
                  syncOsData.mutate();
                }}
                disabled={syncOsData.isPending}
                className="px-2.5 py-1 text-sm rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                {syncOsData.isPending ? "Syncing from endoflife.date…" : "Sync now (endoflife.date)"}
              </button>
              {syncStatus && <span className="text-xs text-slate-500">{syncStatus}</span>}
            </div>
          )}
          {/* Naming-convention modifications (item 6) — OS Versions
              default to the latest 4 per family; endoflife.date syncs
              EVERY release it has ever tracked, which otherwise balloons
              this list into 100+ rows with no way to tell what's current. */}
          {active === "os-versions" && (
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAllOsVersions((v) => !v)}
                className="px-2.5 py-1 text-sm rounded border border-slate-300 bg-white hover:bg-slate-50"
              >
                {showAllOsVersions
                  ? "Show only the latest 4 per OS"
                  : "Show all versions"}
              </button>
              <span className="text-xs text-slate-500">
                {showAllOsVersions
                  ? `Showing all ${osVersions.length} version(s).`
                  : `Showing the ${latestOsVersionIds.size} most recent version(s), up to 4 per OS family.`}
              </span>
            </div>
          )}
          {/* Phase 5 Task 11 (Req 9) — region map, only on the regions lookup. */}
          {active === "regions" && (
            <Suspense
              fallback={<div className="text-sm text-slate-400 mb-3">Loading map…</div>}
            >
              {/* Phase 6 Task 19 (Req 7.3) — set/edit the selected region's
                  real-world point by clicking the map. */}
              {selected && (
                <div className="mb-2 flex items-center gap-2">
                  {/* Bug fix (post-Phase-6 QA) — clicking a region's map
                      marker only ever focused/selected it; this makes the
                      detail page directly reachable from that same click,
                      right where the operator is looking, instead of only
                      via a column that could be scrolled off-screen. */}
                  <Link
                    to={`/regions/${selected.id}`}
                    className="px-2.5 py-1 text-sm rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
                  >
                    Open detail page for “{selected.full_name ?? selected.abbreviation}” →
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPlacingLocation((v) => !v)}
                    className="px-2.5 py-1 text-sm rounded border border-slate-300 bg-white hover:bg-slate-50"
                  >
                    {placingLocation
                      ? "Cancel"
                      : `Set location on map for “${selected.full_name ?? selected.abbreviation}”`}
                  </button>
                  {placeRegionPoint.isPending && (
                    <span className="text-xs text-slate-500">Saving…</span>
                  )}
                </div>
              )}
              <RegionMap
                regions={(results[ALL_LOOKUPS.findIndex((l) => l.slug === "regions")]?.data as Row[]) ?? []}
                selectedCountry={mapCountry}
                onSelectCountry={(country) => {
                  setMapCountry(country);
                  setFocusedRegionId(null);
                }}
                focusedRegionId={focusedRegionId}
                onSelectRegion={(region) => {
                  setFocusedRegionId(region?.id ?? null);
                  setMapCountry(null);
                  // Bug-fix (post-Phase-6 QA) — clicking a marker also
                  // selects that region the same way clicking its grid row
                  // would, so "Set location on map" and any future
                  // per-region panel react to it immediately.
                  setSelected(region);
                }}
                placementMode={placingLocation}
                onPlacePoint={
                  selected
                    ? (lat, lng) => placeRegionPoint.mutate({ id: selected.id, lat, lng })
                    : undefined
                }
              />
            </Suspense>
          )}
          <EntityGrid
            key={active}
            resource={active}
            title={activeLabel}
            columns={
              active === "os-versions"
                ? [
                    ...columnsFor(active),
                    // Naming-convention modifications (item 6) — a computed,
                    // sortable "OS Family" column so the list reads as
                    // organized even without native AG-Grid row grouping.
                    {
                      colId: "os_family_label",
                      headerName: "OS Family",
                      editable: false,
                      sortable: true,
                      width: 160,
                      valueGetter: (p: { data?: Row }) =>
                        p.data ? osVersionFamilyLabels.get(p.data.id as number) ?? "" : "",
                    },
                  ]
                : columnsFor(active)
            }
            // full_name + abbreviation are NOT NULL on every naming lookup and
            // the abbreviation must be globally unique — seed a placeholder so
            // "Add row" always succeeds and the user just renames it.
            newRowDefaults={newLookupDefaults}
            requiredFields={[{ field: "full_name", label: "Full Name" }]}
            externalFilter={
              active === "regions"
                ? focusedRegionId != null
                  ? (row) => row.id === focusedRegionId
                  : mapCountry
                  ? (row) =>
                      regionAbbreviationsForCountry(mapCountry, [String(row.abbreviation ?? "")])
                        .length > 0
                  : undefined
                : active === "os-versions" && !showAllOsVersions
                ? (row) => latestOsVersionIds.has(row.id as number)
                : undefined
            }
            // Phase 5 Task 29 (Req 24.1/24.2) — inline, expandable stencil
            // management for the selected row, replacing the old standalone
            // "list every row" stencil panel. Phase 6 Task 37 (Req 13.2)
            // adds the hardware-spec fields + online lookup panel right
            // below it, on the SAME 4 device-type resources.
            panel={
              selected || STENCIL_RESOURCES.has(active) ? (
                <div className="space-y-3">
                  {STENCIL_RESOURCES.has(active) && (
                    <>
                      <StencilPanel
                        resource={active}
                        label={activeLabel}
                        selected={selected}
                        onChanged={() => qc.invalidateQueries({ queryKey: [active] })}
                      />
                      {hasHardwareSpecFields(active) &&
                        (selected ? (
                          <HardwareSpecPanel
                            resource={active}
                            row={selected}
                            onChanged={() => qc.invalidateQueries({ queryKey: [active] })}
                          />
                        ) : (
                          <div className="px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
                            Select a {activeLabel} row below to manage its hardware specs.
                          </div>
                        ))}
                    </>
                  )}
                </div>
              ) : undefined
            }
            onSelectionChanged={handleSelection}
          />
        </div>
      </div>
    </div>
  );
}
