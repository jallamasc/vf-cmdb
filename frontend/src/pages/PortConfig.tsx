import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { api } from "../api";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  selectCol,
} from "../lib/columns";

interface DeviceOpt {
  id: number;
  abbreviation: string;
}

/**
 * Post-Phase-6 QA (round 3) — "the devices should have a section to add
 * the number of ports"/bulk port creation. Creating one `DeviceInterface`
 * row at a time was the only option before; this generates a whole range
 * (`startPort`..`startPort+count-1`) for one device in a single action.
 * There is no bulk-create endpoint on the backend, so this loops
 * `api.create` sequentially (one POST per port) — small counts (a switch
 * rarely has more than a few dozen ports) make that entirely fine, and
 * sequential (not parallel) keeps each port's own changelog entry ordered
 * and avoids hammering the same device row's naming/validation logic with
 * concurrent writes.
 */
function BulkPortCreator({
  deviceOpts,
  defaultDeviceId,
  onCreated,
}: {
  deviceOpts: DeviceOpt[];
  defaultDeviceId: number | "";
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<number | "">(defaultDeviceId);
  const [startPort, setStartPort] = useState("1");
  const [count, setCount] = useState("24");
  const [mode, setMode] = useState("access");
  const [progress, setProgress] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      const start = Number(startPort) || 1;
      const n = Math.max(0, Math.min(500, Number(count) || 0));
      for (let i = 0; i < n; i++) {
        setProgress(`Creating port ${i + 1} of ${n}…`);
        await api.create("device-interfaces", {
          network_device_id: deviceId,
          port_number: start + i,
          port_mode: mode,
          admin_status: "up",
        });
      }
      return n;
    },
    onSuccess: (n) => {
      setProgress(`Created ${n} port(s).`);
      onCreated();
    },
    onError: (e: unknown) => setProgress(e instanceof Error ? e.message : "Failed to generate ports"),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        + Generate ports
      </button>
    );
  }

  return (
    <div className="border border-blue-200 bg-blue-50/40 rounded-md p-3 flex items-end gap-3 flex-wrap">
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Device
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value === "" ? "" : Number(e.target.value))}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="">— select device —</option>
          {deviceOpts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.abbreviation}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Start port
        <input
          type="number"
          min={1}
          value={startPort}
          onChange={(e) => setStartPort(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm w-24"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Count
        <input
          type="number"
          min={1}
          max={500}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm w-24"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Mode
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="access">access</option>
          <option value="trunk">trunk</option>
          <option value="aggregation">aggregation</option>
          <option value="disabled">disabled</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          setProgress(null);
          generate.mutate();
        }}
        disabled={generate.isPending || !deviceId || !count}
        className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
      >
        {generate.isPending ? "Generating…" : "Generate"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-2.5 py-1.5 text-sm rounded border border-slate-300 bg-white hover:bg-slate-50"
      >
        Close
      </button>
      {progress && <span className="text-xs text-slate-600 basis-full">{progress}</span>}
    </div>
  );
}

export default function PortConfig() {
  const qc = useQueryClient();
  const { map, isLoading } = useLookups(["network-devices", "vlans"]);

  const deviceOpts = (map["network-devices"] ?? []).map((d) => ({
    id: d.id,
    abbreviation: d.vf_friendly_name || d.vf_long_name || `dev-${d.id}`,
  }));
  const vlanOpts = (map["vlans"] ?? []).map((v) => ({
    id: v.id,
    abbreviation: `${v.vlan_id ?? ""} ${v.name ?? ""}`.trim() || `vlan-${v.id}`,
  }));

  // Post-Phase-6 QA (round 3) — "The device port config should be grouped
  // by Device, this is a very unmanageable list." AG Grid Community (this
  // app's edition — see tech.md) has no row-grouping feature (that's an
  // Enterprise-only module), so this mirrors the SAME "filter by X"
  // idiom `Vlans.tsx` already uses for the identical problem (too many
  // unrelated rows in one flat grid): a device picker that narrows the
  // grid down to one device's ports, plus a default sort on the Device
  // column so even the unfiltered "All devices" view visually clusters
  // each device's ports together instead of interleaving them.
  const [deviceFilter, setDeviceFilter] = useState<number | "">("");

  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      // `sort: "asc"` gives every device's ports a default visual grouping
      // even when "All devices" is selected below. `network_device_id` is
      // now nullable (models.py's own comment: "relaxed to nullable so a
      // data port can be owned by any device class") — the legacy/default
      // path for a network device's own ports, still shown first.
      fkCol("network_device_id", "Device", deviceOpts, { sort: "asc" }),
      // Bug fix (round 4 follow-up) — the polymorphic owner pair
      // (`owner_device_type`/`owner_device_id`) was completely absent from
      // this grid, so a port belonging to a physical server, workstation
      // or generic entity (not a network device) could never be created
      // or edited here at all — `ports.py`'s `interface_owner()` already
      // resolves this pair (winning over `network_device_id` when both
      // are set), the UI just never exposed it. Plain type+id columns,
      // mirroring the SAME polymorphic-reference idiom
      // `IpAssignments.tsx`'s `assigned_to_type`/`assigned_to_id` already
      // uses, rather than a dynamic per-row FK dropdown.
      selectCol(
        "owner_device_type",
        "Owner Type",
        [null, "network-devices", "physical-servers", "workstations", "generic-entities"],
        { width: 170 }
      ),
      numCol("owner_device_id", "Owner ID"),
      numCol("port_number", "Port"),
      selectCol(
        "port_mode",
        "Mode",
        ["access", "trunk", "aggregation", "disabled"],
        { width: 150 }
      ),
      textCol("portgroup", "Port Group"),
      textCol("aggregation_id", "Agg ID"),
      fkCol("pvid_vlan_id", "PVID VLAN", vlanOpts),
      textCol("objective", "Objective", 150),
      textCol("speed", "Speed"),
      textCol("connected_device_type", "Conn Type"),
      numCol("connected_device_id", "Conn ID"),
      textCol("connected_port", "Conn Port"),
      selectCol("admin_status", "Admin", ["up", "down"], { width: 120 }),
      textCol("description", "Description", 180),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="device-interfaces"
      title="Device Port Configuration"
      description="Switch/router interface configuration, grouped by Device. Pick a device below to focus on just its ports, or leave it on “All devices” — the Device column stays sorted so each device's ports still cluster together. A port on a physical server, workstation or generic entity (not a network device) uses Owner Type + Owner ID instead of Device."
      columns={columns}
      newRowDefaults={() => ({
        admin_status: "up",
        port_mode: "access",
        network_device_id: deviceFilter || deviceOpts[0]?.id || null,
      })}
      externalFilter={deviceFilter === "" ? undefined : (row) => row.network_device_id === deviceFilter}
      toolbarExtra={
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-slate-600 flex items-center gap-1.5">
            Device:
            <select
              aria-label="Filter by device"
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value === "" ? "" : Number(e.target.value))}
              className="border border-slate-300 rounded px-2 py-1 text-sm"
            >
              <option value="">All devices</option>
              {deviceOpts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.abbreviation}
                </option>
              ))}
            </select>
          </label>
          <BulkPortCreator
            deviceOpts={deviceOpts}
            defaultDeviceId={deviceFilter}
            onCreated={() => qc.invalidateQueries({ queryKey: ["device-interfaces"] })}
          />
        </div>
      }
    />
  );
}
