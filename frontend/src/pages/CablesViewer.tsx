import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { api, Row } from "../api";
import { roCol, textCol, numCol, selectCol } from "../lib/columns";

const ALL = "all" as const;
type Filter = number | typeof ALL;

// FEAT-6 (6C): full cable_type set accepted by the backend.
const CABLE_TYPES = ["copper", "fiber", "power", "patchcord", "structured"];

/**
 * FEAT-6 (6C) — Cables viewer.
 *
 * Lists every cable with its auto-generated label plus the from/to ends, and
 * lets the operator filter by rack or by device. A cable matches a rack when
 * either end's device resolves into that rack; it matches a device when either
 * end references that device. Editing/deleting still flows through the normal
 * CRUD routes (EntityGrid + dataSource), so the changelog and the regenerated
 * label stay intact.
 */
export default function CablesViewer() {
  const { data: cables } = useQuery({
    queryKey: ["cables"],
    queryFn: () => api.list("cables"),
  });
  const { data: racks } = useQuery({
    queryKey: ["racks"],
    queryFn: () => api.list("racks"),
  });
  // Owner rows carry rack_id, used to resolve a cable end to a rack.
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

  const [rackFilter, setRackFilter] = useState<Filter>(ALL);
  const [deviceFilter, setDeviceFilter] = useState<string>(ALL);

  // slug -> Map(id -> rack_id) so we can resolve a cable end to a rack.
  const rackIdByDevice = useMemo(() => {
    const m: Record<string, Map<number, number | null>> = {
      "network-devices": new Map(
        (networkDevices ?? []).map((d) => [d.id, d.rack_id ?? null])
      ),
      "physical-servers": new Map(
        (physicalServers ?? []).map((d) => [d.id, d.rack_id ?? null])
      ),
      workstations: new Map(
        (workstations ?? []).map((d) => [d.id, d.rack_id ?? null])
      ),
    };
    return m;
  }, [networkDevices, physicalServers, workstations]);

  const endRack = (type?: string | null, id?: number | null): number | null => {
    if (!type || id == null) return null;
    return rackIdByDevice[String(type)]?.get(Number(id)) ?? null;
  };

  // Distinct devices referenced by any cable end, for the device filter.
  const deviceOptions = useMemo(() => {
    const set = new Map<string, string>();
    (cables ?? []).forEach((c) => {
      if (c.port_a_type && c.port_a_id != null)
        set.set(`${c.port_a_type}:${c.port_a_id}`, `${c.port_a_type} #${c.port_a_id}`);
      if (c.port_b_type && c.port_b_id != null)
        set.set(`${c.port_b_type}:${c.port_b_id}`, `${c.port_b_type} #${c.port_b_id}`);
    });
    return Array.from(set.entries()).map(([key, label]) => ({ key, label }));
  }, [cables]);

  const filtered = useMemo(() => {
    return (cables ?? []).filter((c) => {
      if (rackFilter !== ALL) {
        const ra = endRack(c.port_a_type, c.port_a_id);
        const rb = endRack(c.port_b_type, c.port_b_id);
        if (ra !== rackFilter && rb !== rackFilter) return false;
      }
      if (deviceFilter !== ALL) {
        const a = `${c.port_a_type}:${c.port_a_id}`;
        const b = `${c.port_b_type}:${c.port_b_id}`;
        if (a !== deviceFilter && b !== deviceFilter) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cables, rackFilter, deviceFilter, rackIdByDevice]);

  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      roCol("label", "Cable Label", 260),
      selectCol("cable_type", "Type", CABLE_TYPES),
      // "From" (A end) and "To" (B end)
      textCol("port_a_type", "From Type", 150),
      numCol("port_a_id", "From ID"),
      textCol("label_a", "From Port", 130),
      textCol("port_b_type", "To Type", 150),
      numCol("port_b_id", "To ID"),
      textCol("label_b", "To Port", 130),
      textCol("media_type", "Media", 120),
      numCol("length_meters", "Length (m)"),
      textCol("notes", "Notes", 200),
    ],
    []
  );

  const nameOf = (r: Row) =>
    r.simple_name || r.code || r.vf_long_name || `Rack ${r.id}`;

  return (
    <EntityGrid
      resource="cables"
      title="Cables"
      description="Every cable connection with its auto-generated label. From = A end, To = B end. Filter by rack or device."
      columns={columns}
      newRowDefaults={{ cable_type: "patchcord" }}
      dataSource={{
        queryKey: ["cables", "filtered", rackFilter, deviceFilter],
        // The grid reads the already-filtered rows; the real ["cables"] cache
        // is what mutations invalidate.
        fetch: async () => filtered,
        select: (d) => d as Row[],
      }}
      toolbarExtra={
        <div className="flex items-end gap-3 mr-2">
          <label className="flex flex-col gap-0.5 text-[11px] text-slate-500">
            <span className="uppercase tracking-wide">Rack</span>
            <select
              value={rackFilter}
              onChange={(e) =>
                setRackFilter(e.target.value === ALL ? ALL : Number(e.target.value))
              }
              className="border border-slate-300 rounded px-2 py-1 text-sm min-w-[9rem]"
            >
              <option value={ALL}>All racks</option>
              {(racks ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {nameOf(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-slate-500">
            <span className="uppercase tracking-wide">Device</span>
            <select
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1 text-sm min-w-[11rem]"
            >
              <option value={ALL}>All devices</option>
              {deviceOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
    />
  );
}
