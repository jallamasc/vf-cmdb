import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";

const PORT_MODES = ["access", "trunk", "aggregation", "disabled"] as const;
const ADMIN_STATUSES = ["up", "down"] as const;

interface Props {
  /** The DeviceInterface row being configured. */
  iface: Row;
  onClose: () => void;
}

function vlanLabel(v: Row): string {
  return `${v.vlan_id ?? ""} ${v.name ?? ""}`.trim() || `vlan-${v.id}`;
}

/**
 * Phase 4 Task 24 / Requirement 18.4 — edit a port's OWN configuration
 * fields (description, mode, VLAN, speed, ...), opened by the gear glyph on
 * `PortConfigDiagramSVG`. Deliberately separate from the Connect flow: this
 * panel never touches `connected_device_type`/`connected_device_id`/
 * `connected_port` — those are the Cable_Sync/Connect_Panel's job, kept out
 * of this panel so the two concerns (who am I, vs who am I wired to) don't
 * collide on the same form.
 */
export default function PortSettingsPanel({ iface, onClose }: Props) {
  const qc = useQueryClient();
  const { data: vlans } = useQuery({ queryKey: ["vlans"], queryFn: () => api.list("vlans") });

  const [description, setDescription] = useState(iface.description ?? "");
  const [portNumber, setPortNumber] = useState<string>(
    iface.port_number != null ? String(iface.port_number) : ""
  );
  const [portMode, setPortMode] = useState(iface.port_mode ?? "");
  const [portgroup, setPortgroup] = useState(iface.portgroup ?? "");
  const [aggregationId, setAggregationId] = useState(iface.aggregation_id ?? "");
  const [pvidVlanId, setPvidVlanId] = useState<string>(
    iface.pvid_vlan_id != null ? String(iface.pvid_vlan_id) : ""
  );
  const [objective, setObjective] = useState(iface.objective ?? "");
  const [speed, setSpeed] = useState(iface.speed ?? "");
  const [adminStatus, setAdminStatus] = useState(iface.admin_status ?? "up");
  const [notes, setNotes] = useState(iface.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.update("device-interfaces", iface.id, {
        description: description || null,
        port_number: portNumber === "" ? null : Number(portNumber),
        port_mode: portMode || null,
        portgroup: portgroup || null,
        aggregation_id: aggregationId || null,
        pvid_vlan_id: pvidVlanId === "" ? null : Number(pvidVlanId),
        objective: objective || null,
        speed: speed || null,
        admin_status: adminStatus,
        notes: notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["device-interfaces"] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  const field = (label: string, input: React.ReactNode) => (
    <label className="block text-xs text-slate-500 uppercase tracking-wide">
      {label}
      {input}
    </label>
  );

  const inputClass = "mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">
            Port settings — {iface.description || `port ${iface.port_number ?? iface.id}`}
          </h2>
        </div>

        <div className="px-5 py-4 space-y-3">
          {field(
            "Description",
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          )}
          {field(
            "Port Number",
            <input
              type="number"
              value={portNumber}
              onChange={(e) => setPortNumber(e.target.value)}
              className={inputClass}
            />
          )}
          {field(
            "Mode",
            <select
              value={portMode}
              onChange={(e) => setPortMode(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {PORT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {field(
            "Port Group",
            <input
              value={portgroup}
              onChange={(e) => setPortgroup(e.target.value)}
              className={inputClass}
            />
          )}
          {field(
            "Aggregation ID",
            <input
              value={aggregationId}
              onChange={(e) => setAggregationId(e.target.value)}
              className={inputClass}
            />
          )}
          {field(
            "PVID VLAN",
            <select
              value={pvidVlanId}
              onChange={(e) => setPvidVlanId(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {(vlans ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {vlanLabel(v)}
                </option>
              ))}
            </select>
          )}
          {field(
            "Objective",
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className={inputClass}
            />
          )}
          {field(
            "Speed",
            <input value={speed} onChange={(e) => setSpeed(e.target.value)} className={inputClass} />
          )}
          {field(
            "Admin Status",
            <select
              value={adminStatus}
              onChange={(e) => setAdminStatus(e.target.value)}
              className={inputClass}
            >
              {ADMIN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {field(
            "Notes",
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
              rows={2}
            />
          )}
        </div>

        {error && (
          <p className="px-5 py-2 text-sm text-rose-600 border-t border-slate-200">{error}</p>
        )}

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
