import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";
import RackDiagramSVG, { TYPE_HEX } from "../components/RackDiagramSVG";

// Tailwind classes for the legend swatches (kept in sync with TYPE_HEX).
const TYPE_COLORS: Record<string, string> = {
  server: "bg-blue-200 border-blue-400",
  switch: "bg-emerald-200 border-emerald-400",
  router: "bg-teal-200 border-teal-400",
  firewall: "bg-rose-200 border-rose-400",
  pdu: "bg-amber-200 border-amber-400",
  ups: "bg-orange-200 border-orange-400",
  patchpanel: "bg-violet-200 border-violet-400",
  storage: "bg-cyan-200 border-cyan-400",
};

const ALL = "all" as const;
type Filter = number | typeof ALL;

function nameOf(row: Row | undefined, fallback: string) {
  if (!row) return fallback;
  return (
    row.name ||
    row.simple_name ||
    row.vf_long_name ||
    row.code ||
    `${fallback} ${row.id}`
  );
}

function Dropdown({
  label,
  value,
  onChange,
  options,
  allLabel,
  disabled,
}: {
  label: string;
  value: Filter;
  onChange: (v: Filter) => void;
  options: { id: number; label: string }[];
  allLabel: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      <span className="font-medium uppercase tracking-wide">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === ALL ? ALL : Number(e.target.value))
        }
        className="border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-700 min-w-[10rem] disabled:opacity-50 disabled:bg-slate-50"
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function RackView() {
  const { data: racks, isLoading } = useQuery({
    queryKey: ["racks"],
    queryFn: () => api.list("racks"),
  });
  const { data: allUnits } = useQuery({
    queryKey: ["rack-units"],
    queryFn: () => api.list("rack-units"),
  });
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: () => api.list("sites"),
  });
  const { data: datacenters } = useQuery({
    queryKey: ["datacenters"],
    queryFn: () => api.list("datacenters"),
  });
  const { data: floors } = useQuery({
    queryKey: ["datacenter-floors"],
    queryFn: () => api.list("datacenter-floors"),
  });

  const [site, setSite] = useState<Filter>(ALL);
  const [dc, setDc] = useState<Filter>(ALL);
  const [floor, setFloor] = useState<Filter>(ALL);
  const [rack, setRack] = useState<Filter>(ALL);

  // Lookup maps for labelling rack cards with their DC/Floor/Rack breadcrumb.
  const dcById = useMemo(
    () => new Map((datacenters ?? []).map((d) => [d.id, d])),
    [datacenters]
  );
  const floorById = useMemo(
    () => new Map((floors ?? []).map((f) => [f.id, f])),
    [floors]
  );
  const siteById = useMemo(
    () => new Map((sites ?? []).map((s) => [s.id, s])),
    [sites]
  );

  // Cascading option lists — each level filtered by the parent selection.
  const dcOptions = useMemo(
    () =>
      (datacenters ?? [])
        .filter((d) => site === ALL || d.site_id === site)
        .map((d) => ({ id: d.id, label: nameOf(d, "Datacenter") })),
    [datacenters, site]
  );

  const floorOptions = useMemo(
    () =>
      (floors ?? [])
        .filter((f) => {
          if (dc !== ALL) return f.datacenter_id === dc;
          if (site !== ALL) {
            const parent = dcById.get(f.datacenter_id);
            return parent && parent.site_id === site;
          }
          return true;
        })
        .map((f) => ({ id: f.id, label: nameOf(f, "Floor") })),
    [floors, dc, site, dcById]
  );

  const rackOptions = useMemo(
    () =>
      (racks ?? [])
        .filter((r) => matchesHierarchy(r, ALL))
        .map((r) => ({ id: r.id, label: nameOf(r, "Rack") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [racks, site, dc, floor, dcById, floorById]
  );

  // Determine whether a rack matches the currently-selected hierarchy filters.
  // `overrideRack` lets rackOptions ignore the rack-level filter itself.
  function matchesHierarchy(r: Row, overrideRack: Filter): boolean {
    const rk = overrideRack === ALL ? rack : overrideRack;
    if (rk !== ALL && r.id !== rk) return false;
    if (floor !== ALL && r.datacenter_floor_id !== floor) return false;
    if (dc !== ALL) {
      const fl = floorById.get(r.datacenter_floor_id);
      if (!fl || fl.datacenter_id !== dc) return false;
    }
    if (site !== ALL) {
      // A rack belongs to a site directly, or via its floor->datacenter.
      const fl = floorById.get(r.datacenter_floor_id);
      const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
      const siteViaFloor = dcParent?.site_id;
      if (r.site_id !== site && siteViaFloor !== site) return false;
    }
    return true;
  }

  if (isLoading) return <div className="text-slate-500">Loading racks…</div>;
  if (!racks || racks.length === 0)
    return (
      <div>
        <h1 className="text-xl font-semibold mb-2">Rack View</h1>
        <p className="text-slate-500">
          No racks defined yet. Add racks from the Sites &amp; Physical section.
        </p>
      </div>
    );

  const shown = racks.filter((r) => matchesHierarchy(r, ALL));

  const breadcrumb = (r: Row) => {
    const fl = floorById.get(r.datacenter_floor_id);
    const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
    const st =
      siteById.get(r.site_id) ||
      (dcParent ? siteById.get(dcParent.site_id) : undefined);
    const parts = [
      st ? nameOf(st, "Site") : null,
      dcParent ? nameOf(dcParent, "DC") : null,
      fl ? nameOf(fl, "Floor") : null,
    ].filter(Boolean);
    return parts.join(" / ");
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Rack Elevation View</h1>
        <p className="text-sm text-slate-500">
          Front elevation of each rack, unit by unit. Colour indicates device
          type.
        </p>
      </div>

      {/* Cascading hierarchy filters */}
      <div className="flex flex-wrap gap-4 mb-5 items-end bg-slate-50 border border-slate-200 rounded-lg p-4">
        <Dropdown
          label="Site"
          value={site}
          allLabel="All Sites"
          options={(sites ?? []).map((s) => ({
            id: s.id,
            label: nameOf(s, "Site"),
          }))}
          onChange={(v) => {
            setSite(v);
            setDc(ALL);
            setFloor(ALL);
            setRack(ALL);
          }}
        />
        <Dropdown
          label="Datacenter"
          value={dc}
          allLabel="All Datacenters"
          options={dcOptions}
          onChange={(v) => {
            setDc(v);
            setFloor(ALL);
            setRack(ALL);
          }}
        />
        <Dropdown
          label="Floor"
          value={floor}
          allLabel="All Floors"
          options={floorOptions}
          onChange={(v) => {
            setFloor(v);
            setRack(ALL);
          }}
        />
        <Dropdown
          label="Rack"
          value={rack}
          allLabel="All Racks"
          options={rackOptions}
          onChange={setRack}
        />
        <div className="text-xs text-slate-500 pb-2">
          Showing <span className="font-semibold">{shown.length}</span> rack
          {shown.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-5 text-xs">
        {Object.entries(TYPE_COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded border ${c}`} />
            {k}
          </span>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-slate-500">
          No racks match the selected filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {shown.map((r) => (
            <div
              key={r.id}
              className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
            >
              <div className="mb-2">
                <div className="text-sm font-semibold text-slate-800">
                  {nameOf(r, "Rack")}
                  <span className="text-slate-400 text-xs ml-2 font-normal">
                    {r.total_units || 42}U
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {breadcrumb(r) || "Unassigned location"}
                </div>
              </div>
              <RackDiagramSVG
                rack={r}
                units={(allUnits ?? []).filter((u) => u.rack_id === r.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
