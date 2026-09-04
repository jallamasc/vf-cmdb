import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";
import RackDiagramSVG, { PORT_TYPE_HEX, RackPort } from "../components/RackDiagramSVG";
import ConnectPanel from "../components/ConnectPanel";

// Device resources whose ports we resolve into the back-face view. Maps the
// kebab-case slug (as stored in owner_device_type / rack_units.device_table) to
// the resource whose rows carry rack_id + rack_unit for the owner.
const PORT_OWNER_RESOURCES = [
  "network-devices",
  "physical-servers",
  "workstations",
] as const;

// copper vs fiber from an interface speed string (mirrors the backend rule).
function interfacePortType(iface: Row): string {
  const speed = String(iface.speed ?? "").toLowerCase();
  if (["sfp", "fiber", "fibre", "lc", "sr", "lr", "optical"].some((t) => speed.includes(t)))
    return "fiber";
  return "copper";
}

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
  // FEAT-6 (6A/6C): port + owner data, only used on the back face.
  const { data: interfaces } = useQuery({
    queryKey: ["device-interfaces"],
    queryFn: () => api.list("device-interfaces"),
  });
  const { data: powerOutlets } = useQuery({
    queryKey: ["power-outlets"],
    queryFn: () => api.list("power-outlets"),
  });
  const { data: networkDevices } = useQuery({
    queryKey: ["network-devices"],
    queryFn: () => api.list("network-devices"),
  });
  const { data: physicalServers } = useQuery({
    queryKey: ["physical-servers"],
    queryFn: () => api.list("physical-servers"),
  });
  const { data: workstations } = useQuery({
    queryKey: ["workstations"],
    queryFn: () => api.list("workstations"),
  });

  const [site, setSite] = useState<Filter>(ALL);
  const [dc, setDc] = useState<Filter>(ALL);
  const [floor, setFloor] = useState<Filter>(ALL);
  const [rack, setRack] = useState<Filter>(ALL);
  const [face, setFace] = useState<"front" | "back">("front");
  // FEAT-6 (6C): the source port the Connect panel is open for.
  const [connectSource, setConnectSource] = useState<RackPort | null>(null);

  // Owner lookup: slug -> Map(id -> owner row) for rack/U resolution (rule A).
  const ownerById = useMemo(() => {
    const m: Record<string, Map<number, Row>> = {
      "network-devices": new Map((networkDevices ?? []).map((d) => [d.id, d])),
      "physical-servers": new Map((physicalServers ?? []).map((d) => [d.id, d])),
      workstations: new Map((workstations ?? []).map((d) => [d.id, d])),
    };
    return m;
  }, [networkDevices, physicalServers, workstations]);

  // Resolve an interface's owner (owner pair wins, else network_device_id).
  const interfaceOwner = (iface: Row): { slug: string; id: number } | null => {
    if (iface.owner_device_type && iface.owner_device_id)
      return { slug: String(iface.owner_device_type), id: Number(iface.owner_device_id) };
    if (iface.network_device_id)
      return { slug: "network-devices", id: Number(iface.network_device_id) };
    return null;
  };

  // FEAT-6 (6A/6C): all back-face ports grouped by rack_id, each carrying the
  // owner's base U so the diagram can place its connector dot.
  const portsByRack = useMemo(() => {
    const byRack = new Map<number, RackPort[]>();
    const push = (rackId: number | null | undefined, p: RackPort) => {
      if (!rackId) return;
      const arr = byRack.get(rackId) ?? [];
      arr.push(p);
      byRack.set(rackId, arr);
    };
    // Interfaces: resolve owner -> its rack_id + rack_unit.
    (interfaces ?? []).forEach((iface) => {
      const owner = interfaceOwner(iface);
      if (!owner) return;
      const ownerRow = ownerById[owner.slug]?.get(owner.id);
      if (!ownerRow || !ownerRow.rack_id) return;
      push(ownerRow.rack_id, {
        port_kind: "interface",
        port_id: iface.id,
        owner_type: owner.slug,
        owner_id: owner.id,
        label:
          iface.description ||
          (iface.port_number != null ? `port ${iface.port_number}` : `if#${iface.id}`),
        port_type: interfacePortType(iface),
        unit_number: ownerRow.rack_unit ?? null,
      });
    });
    // Power outlets: carry rack_id directly. They have no rack_unit column, so
    // pin them to U1 (bottom) as a sensible default for the power face.
    (powerOutlets ?? []).forEach((po) => {
      push(po.rack_id, {
        port_kind: "outlet",
        port_id: po.id,
        owner_type: "power-devices",
        owner_id: po.power_device_id ?? null,
        label: po.label || (po.port_number != null ? `outlet ${po.port_number}` : `po#${po.id}`),
        port_type: "power",
        unit_number: 1,
      });
    });
    return byRack;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interfaces, powerOutlets, ownerById]);

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
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Rack Elevation View</h1>
          <p className="text-sm text-slate-500">
            {face === "front"
              ? "Front elevation of each rack, unit by unit. Colour indicates device type."
              : "Back of rack. Coloured dots are ports (blue=copper, orange=fiber, yellow=power). Click a port to connect it."}
          </p>
        </div>
        {/* FEAT-6 (6A): Front/Back face toggle */}
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {(["front", "back"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFace(f)}
              className={
                "px-4 py-1.5 capitalize " +
                (face === f
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              {f}
            </button>
          ))}
        </div>
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

      {/* Legend — device types (front) or port types (back) */}
      <div className="flex flex-wrap gap-3 mb-5 text-xs">
        {face === "front"
          ? Object.entries(TYPE_COLORS).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={`inline-block w-3 h-3 rounded border ${c}`} />
                {k}
              </span>
            ))
          : Object.entries(PORT_TYPE_HEX).map(([k, hex]) => (
              <span key={k} className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded-full border border-slate-700"
                  style={{ backgroundColor: hex }}
                />
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
                face={face}
                ports={face === "back" ? portsByRack.get(r.id) ?? [] : []}
                onPortClick={face === "back" ? setConnectSource : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {/* FEAT-6 (6C): connect a clicked back-face port to a destination */}
      {connectSource && (
        <ConnectPanel
          source={connectSource}
          onClose={() => setConnectSource(null)}
        />
      )}
    </div>
  );
}
