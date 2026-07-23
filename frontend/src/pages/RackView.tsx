import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";
import { lookupLabel } from "../lib/columns";
import RackDiagramSVG, { TYPE_COLORS } from "../components/RackDiagramSVG";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function useList(slug: string) {
  return useQuery({ queryKey: [slug], queryFn: () => api.list(slug) });
}

const ALL = "all";

function rackName(r: Row): string {
  return r.simple_name || r.code || r.vf_long_name || `Rack #${r.id}`;
}

// A labelled cascading filter dropdown.
function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: number; label: string }[];
  allLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="border border-slate-300 rounded px-2 py-1.5 text-sm min-w-[11rem] bg-white disabled:bg-slate-100 disabled:text-slate-400"
      >
        <option value={ALL}>{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device details modal
// ---------------------------------------------------------------------------
function DeviceDetails({
  unit,
  rack,
  onClose,
}: {
  unit: Row;
  rack: Row;
  onClose: () => void;
}) {
  const rows: [string, any][] = [
    ["Label", unit.label],
    ["Device type", unit.device_type],
    ["Rack", rackName(rack)],
    ["Position", `U${unit.unit_number}`],
    ["Height", `${unit.height_units || 1}U`],
    ["Source table", unit.device_table],
    ["Device ID", unit.device_id],
    ["Side", unit.side],
    ["Notes", unit.notes],
  ];
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">
            {unit.label || unit.device_table || unit.device_type || "Device"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <dl className="px-4 py-3 divide-y divide-slate-100">
          {rows
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-1.5 text-sm">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-slate-800 font-medium text-right">{String(v)}</dd>
              </div>
            ))}
        </dl>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rack card
// ---------------------------------------------------------------------------
function RackCard({
  rack,
  units,
  siteName,
  dcName,
  floorName,
  selectedUnitId,
  onDeviceClick,
}: {
  rack: Row;
  units: Row[];
  siteName: string;
  dcName: string;
  floorName: string;
  selectedUnitId: number | null;
  onDeviceClick: (u: Row) => void;
}) {
  const crumbs = [siteName, dcName, floorName].filter(Boolean).join(" / ");
  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-sm p-3 flex flex-col items-center">
      <div className="w-full text-center mb-2">
        <div className="font-semibold text-slate-800 text-sm truncate" title={rackName(rack)}>
          {rackName(rack)}
          <span className="text-slate-400 font-normal ml-1">· {rack.total_units || 42}U</span>
        </div>
        {crumbs && (
          <div className="text-[11px] text-slate-500 truncate" title={crumbs}>
            {crumbs}
          </div>
        )}
      </div>
      <RackDiagramSVG
        rack={rack}
        units={units}
        selectedUnitId={selectedUnitId}
        onDeviceClick={onDeviceClick}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function RackView() {
  const sites = useList("sites");
  const datacenters = useList("datacenters");
  const floors = useList("datacenter-floors");
  const racksQ = useList("racks");
  const unitsQ = useList("rack-units");

  const [siteId, setSiteId] = useState<string>(ALL);
  const [dcId, setDcId] = useState<string>(ALL);
  const [floorId, setFloorId] = useState<string>(ALL);
  const [rackId, setRackId] = useState<string>(ALL);
  const [selected, setSelected] = useState<{ unit: Row; rack: Row } | null>(null);

  const siteList = sites.data ?? [];
  const dcList = datacenters.data ?? [];
  const floorList = floors.data ?? [];
  const rackList = racksQ.data ?? [];
  const unitList = unitsQ.data ?? [];

  // Lookup maps.
  const dcById = useMemo(() => new Map(dcList.map((d) => [d.id, d])), [dcList]);
  const floorById = useMemo(() => new Map(floorList.map((f) => [f.id, f])), [floorList]);
  const siteById = useMemo(() => new Map(siteList.map((s) => [s.id, s])), [siteList]);

  // --- Cascading option lists -------------------------------------------
  const dcOptions = useMemo(
    () =>
      dcList
        .filter((d) => siteId === ALL || String(d.site_id) === siteId)
        .map((d) => ({ id: d.id, label: `${d.name}${d.code ? ` (${d.code})` : ""}` })),
    [dcList, siteId],
  );

  const floorOptions = useMemo(
    () =>
      floorList
        .filter((f) => {
          if (dcId !== ALL) return String(f.datacenter_id) === dcId;
          if (siteId !== ALL) {
            const dc = dcById.get(f.datacenter_id);
            return dc && String(dc.site_id) === siteId;
          }
          return true;
        })
        .map((f) => ({ id: f.id, label: `${f.name}${f.code ? ` (${f.code})` : ""}` })),
    [floorList, dcId, siteId, dcById],
  );

  // Resolve the datacenter/site a rack belongs to (via its floor).
  const rackDcId = (r: Row): number | undefined => {
    const f = r.datacenter_floor_id != null ? floorById.get(r.datacenter_floor_id) : undefined;
    return f?.datacenter_id ?? undefined;
  };

  const rackOptions = useMemo(
    () =>
      rackList
        .filter((r) => {
          if (siteId !== ALL && String(r.site_id) !== siteId) return false;
          if (dcId !== ALL && String(rackDcId(r) ?? "") !== dcId) return false;
          if (floorId !== ALL && String(r.datacenter_floor_id) !== floorId) return false;
          return true;
        })
        .map((r) => ({ id: r.id, label: rackName(r) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rackList, siteId, dcId, floorId, floorById],
  );

  // --- Racks actually displayed -----------------------------------------
  const shownRacks = useMemo(
    () =>
      rackList.filter((r) => {
        if (rackId !== ALL) return String(r.id) === rackId;
        if (siteId !== ALL && String(r.site_id) !== siteId) return false;
        if (dcId !== ALL && String(rackDcId(r) ?? "") !== dcId) return false;
        if (floorId !== ALL && String(r.datacenter_floor_id) !== floorId) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rackList, rackId, siteId, dcId, floorId, floorById],
  );

  const unitsByRack = useMemo(() => {
    const map = new Map<number, Row[]>();
    unitList.forEach((u) => {
      if (!map.has(u.rack_id)) map.set(u.rack_id, []);
      map.get(u.rack_id)!.push(u);
    });
    return map;
  }, [unitList]);

  // Cascade resets when a parent filter changes.
  const onSite = (v: string) => {
    setSiteId(v);
    setDcId(ALL);
    setFloorId(ALL);
    setRackId(ALL);
  };
  const onDc = (v: string) => {
    setDcId(v);
    setFloorId(ALL);
    setRackId(ALL);
  };
  const onFloor = (v: string) => {
    setFloorId(v);
    setRackId(ALL);
  };

  const isLoading = racksQ.isLoading || sites.isLoading;

  // Resolve label breadcrumbs for a rack.
  const crumbsFor = (r: Row) => {
    const site = r.site_id != null ? siteById.get(r.site_id) : undefined;
    const dc = dcById.get(rackDcId(r) ?? -1);
    const floor = r.datacenter_floor_id != null ? floorById.get(r.datacenter_floor_id) : undefined;
    return {
      siteName: site ? lookupLabel(site) : "",
      dcName: dc ? dc.name : "",
      floorName: floor ? floor.name : "",
    };
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Rack Elevation View</h1>
        <p className="text-sm text-slate-500">
          Filter by the physical hierarchy and browse professional front-elevation
          diagrams. Click any device to see its details.
        </p>
      </div>

      {/* Cascading hierarchy filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-end border border-slate-200 bg-slate-50 rounded-lg p-3">
        <FilterSelect
          label="Site"
          value={siteId}
          onChange={onSite}
          allLabel="All Sites"
          options={siteList.map((s) => ({ id: s.id, label: lookupLabel(s) }))}
        />
        <FilterSelect
          label="Datacenter"
          value={dcId}
          onChange={onDc}
          allLabel="All Datacenters"
          options={dcOptions}
        />
        <FilterSelect
          label="Floor"
          value={floorId}
          onChange={onFloor}
          allLabel="All Floors"
          options={floorOptions}
        />
        <FilterSelect
          label="Rack"
          value={rackId}
          onChange={setRackId}
          allLabel="All Racks"
          options={rackOptions}
        />
        <div className="ml-auto text-sm text-slate-500 self-center">
          {shownRacks.length} rack{shownRacks.length === 1 ? "" : "s"} shown
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-5 text-xs">
        {Object.entries(TYPE_COLORS)
          .filter(([k]) => k !== "empty")
          .map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded border ${c}`} />
              {k}
            </span>
          ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-slate-500">Loading racks…</div>
      ) : rackList.length === 0 ? (
        <p className="text-slate-500">
          No racks defined yet. Add racks from the Physical Hierarchy section.
        </p>
      ) : shownRacks.length === 0 ? (
        <p className="text-slate-500">No racks match the selected filters.</p>
      ) : (
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          {shownRacks.map((r) => {
            const { siteName, dcName, floorName } = crumbsFor(r);
            return (
              <RackCard
                key={r.id}
                rack={r}
                units={unitsByRack.get(r.id) ?? []}
                siteName={siteName}
                dcName={dcName}
                floorName={floorName}
                selectedUnitId={selected && selected.rack.id === r.id ? selected.unit.id : null}
                onDeviceClick={(unit) => setSelected({ unit, rack: r })}
              />
            );
          })}
        </div>
      )}

      {selected && (
        <DeviceDetails
          unit={selected.unit}
          rack={selected.rack}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
