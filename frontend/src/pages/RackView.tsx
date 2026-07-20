import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";

const TYPE_COLORS: Record<string, string> = {
  server: "bg-blue-200 border-blue-400",
  switch: "bg-emerald-200 border-emerald-400",
  router: "bg-teal-200 border-teal-400",
  firewall: "bg-rose-200 border-rose-400",
  pdu: "bg-amber-200 border-amber-400",
  ups: "bg-orange-200 border-orange-400",
  patchpanel: "bg-violet-200 border-violet-400",
  storage: "bg-cyan-200 border-cyan-400",
  empty: "bg-slate-50 border-slate-200",
};

function RackDiagram({ rack, units }: { rack: Row; units: Row[] }) {
  const total = rack.total_units || 42;
  // map unit_number -> occupying unit (accounting for height)
  const occupancy = useMemo(() => {
    const map = new Map<number, Row>();
    units.forEach((u) => {
      const h = u.height_units || 1;
      for (let i = 0; i < h; i++) map.set(u.unit_number + i, u);
    });
    return map;
  }, [units]);

  const rows = [];
  for (let u = total; u >= 1; u--) {
    const dev = occupancy.get(u);
    const isTop = dev && dev.unit_number + (dev.height_units || 1) - 1 === u;
    const color = TYPE_COLORS[dev?.device_type ?? "empty"] ?? TYPE_COLORS.empty;
    rows.push(
      <div key={u} className={`flex items-stretch border-b border-slate-100`}>
        <div className="w-10 text-[10px] text-slate-400 text-right pr-2 py-1 font-mono select-none">
          {u}
        </div>
        <div className={`flex-1 border ${color} px-2 py-1 text-xs`}>
          {dev && isTop ? (
            <span className="font-medium">
              {dev.label || dev.device_table || dev.device_type}
              {dev.height_units > 1 ? ` (${dev.height_units}U)` : ""}
            </span>
          ) : dev ? (
            <span className="text-slate-400">↑</span>
          ) : (
            <span className="text-slate-300">empty</span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="bg-slate-800 p-3 rounded-lg inline-block w-96">
      <div className="text-center text-white text-sm mb-2 font-medium">
        {rack.simple_name || rack.vf_long_name || `Rack ${rack.id}`}
        <span className="text-slate-400 text-xs ml-2">{total}U</span>
      </div>
      <div className="bg-white rounded overflow-hidden">{rows}</div>
    </div>
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
  const [selected, setSelected] = useState<number | "all">("all");

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

  const shown =
    selected === "all" ? racks : racks.filter((r) => r.id === selected);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Rack Elevation View</h1>
          <p className="text-sm text-slate-500">
            Front elevation of each rack, unit by unit. Colour indicates device
            type.
          </p>
        </div>
        <select
          value={selected}
          onChange={(e) =>
            setSelected(e.target.value === "all" ? "all" : Number(e.target.value))
          }
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="all">All racks</option>
          {racks.map((r) => (
            <option key={r.id} value={r.id}>
              {r.simple_name || r.vf_long_name || `Rack ${r.id}`}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        {Object.entries(TYPE_COLORS)
          .filter(([k]) => k !== "empty")
          .map(([k, c]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded border ${c}`} />
              {k}
            </span>
          ))}
      </div>

      <div className="flex flex-wrap gap-6">
        {shown.map((r) => (
          <RackDiagram
            key={r.id}
            rack={r}
            units={(allUnits ?? []).filter((u) => u.rack_id === r.id)}
          />
        ))}
      </div>
    </div>
  );
}
