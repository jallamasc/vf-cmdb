import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";

interface Props {
  rackId: number;
  unitNumber: number;
  /** The occupied slot's `rack_units` row (base U), or null when empty. */
  unit: Row | null;
  onClose: () => void;
}

// Device resources that can be mounted in a rack, and the coarse
// `device_type` discriminator RackDiagramSVG colours slots by.
const DEVICE_TABLES: { slug: string; deviceType: string; label: string }[] = [
  { slug: "network-devices", deviceType: "switch", label: "Network Device" },
  { slug: "physical-servers", deviceType: "server", label: "Physical Server" },
  { slug: "power-devices", deviceType: "pdu", label: "Power Device" },
  { slug: "patch-panels", deviceType: "patchpanel", label: "Patch Panel" },
];

function deviceLabel(row: Row): string {
  return (
    row.vf_long_name ||
    row.vf_short_name ||
    row.simple_name ||
    row.model ||
    row.panel_id_label ||
    `#${row.id}`
  );
}

/**
 * Phase 4 Req 13 — add, edit or remove the equipment mounted at one rack U
 * slot, straight from the rack view. Writes go through the same generic CRUD
 * endpoints every other page uses (device table + `rack-units`), so
 * changelog and naming stay authoritative — this is a UI convenience, not a
 * parallel write path.
 */
export default function RackSlotEditor({ rackId, unitNumber, unit, onClose }: Props) {
  const qc = useQueryClient();
  const isEmpty = unit == null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">
            {isEmpty ? `Add equipment at U${unitNumber}` : `U${unitNumber} — ${unit?.label || unit?.device_table || "device"}`}
          </h2>
        </div>
        {isEmpty ? (
          <AddEquipmentForm
            rackId={rackId}
            unitNumber={unitNumber}
            onDone={onClose}
            qc={qc}
          />
        ) : (
          <EditOrRemoveForm unit={unit as Row} onDone={onClose} qc={qc} />
        )}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function AddEquipmentForm({
  rackId,
  unitNumber,
  onDone,
  qc,
}: {
  rackId: number;
  unitNumber: number;
  onDone: () => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [table, setTable] = useState(DEVICE_TABLES[0].slug);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existingId, setExistingId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const deviceType = DEVICE_TABLES.find((d) => d.slug === table)?.deviceType ?? "empty";

  const { data: rows } = useQuery({
    queryKey: [table],
    queryFn: () => api.list(table),
  });
  const unplaced = useMemo(
    () => (rows ?? []).filter((r) => r.rack_id == null),
    [rows]
  );

  const place = useMutation({
    mutationFn: async () => {
      let deviceId: number;
      if (mode === "new") {
        const created = await api.create(table, {});
        deviceId = created.id;
      } else {
        if (existingId === "") throw new Error("Pick a device to place.");
        deviceId = Number(existingId);
      }
      await api.update(table, deviceId, { rack_id: rackId, rack_unit: unitNumber });
      await api.create("rack-units", {
        rack_id: rackId,
        unit_number: unitNumber,
        device_type: deviceType,
        device_id: deviceId,
        device_table: table,
        height_units: 1,
      });
      return deviceId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rack-units"] });
      qc.invalidateQueries({ queryKey: [table] });
      onDone();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="px-5 py-4 space-y-3">
      <label className="block text-xs text-slate-500 uppercase tracking-wide">
        Device type
        <select
          value={table}
          onChange={(e) => {
            setTable(e.target.value);
            setExistingId("");
          }}
          className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          {DEVICE_TABLES.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "new"}
            onChange={() => setMode("new")}
          />
          Create new
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "existing"}
            onChange={() => setMode("existing")}
          />
          Assign existing unplaced device
        </label>
      </div>

      {mode === "existing" && (
        <select
          value={existingId}
          onChange={(e) => setExistingId(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="">— select a device —</option>
          {unplaced.map((r) => (
            <option key={r.id} value={r.id}>
              {deviceLabel(r)}
            </option>
          ))}
        </select>
      )}
      {mode === "existing" && unplaced.length === 0 && (
        <p className="text-xs text-slate-400">
          No unplaced {DEVICE_TABLES.find((d) => d.slug === table)?.label.toLowerCase()}s
          — every one is already mounted somewhere.
        </p>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="button"
        disabled={place.isPending}
        onClick={() => place.mutate()}
        className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
      >
        {place.isPending ? "Placing…" : "Place in rack"}
      </button>
    </div>
  );
}

function EditOrRemoveForm({
  unit,
  onDone,
  qc,
}: {
  unit: Row;
  onDone: () => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [label, setLabel] = useState<string>(unit.label ?? "");
  const [height, setHeight] = useState<number>(unit.height_units ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api.update("rack-units", unit.id, { label: label || null, height_units: height }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rack-units"] });
      onDone();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      // Clear the device's own rack reference first (Req 13.4), then the
      // rack_units row. rack_unit is silently ignored by tables that don't
      // have that column (e.g. power devices).
      if (unit.device_table && unit.device_id != null) {
        await api.update(unit.device_table, unit.device_id, {
          rack_id: null,
          rack_unit: null,
        });
      }
      await api.remove("rack-units", unit.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rack-units"] });
      if (unit.device_table) qc.invalidateQueries({ queryKey: [unit.device_table] });
      onDone();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="px-5 py-4 space-y-3">
      <label className="block text-xs text-slate-500 uppercase tracking-wide">
        Label
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs text-slate-500 uppercase tracking-wide">
        Height (U)
        <input
          type="number"
          min={1}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value) || 1)}
          className="mt-1 w-24 border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </label>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
        >
          Save
        </button>
        {!confirmRemove ? (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            className="px-3 py-1.5 text-sm rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            Remove from rack
          </button>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            Remove this device from the rack?
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              className="px-2 py-1 text-xs rounded bg-rose-600 text-white disabled:opacity-50"
            >
              Yes, remove
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="px-2 py-1 text-xs rounded border border-slate-300"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
