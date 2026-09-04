import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, PortCandidate } from "../api";
import { PORT_TYPE_HEX, RackPort } from "./RackDiagramSVG";

// FEAT-6 (6C): the cable_type set the backend accepts.
const CABLE_TYPES = ["copper", "fiber", "power", "patchcord", "structured"] as const;

interface Props {
  /** The back-face port the user clicked. */
  source: RackPort;
  onClose: () => void;
}

/**
 * FEAT-6 (6C) — modal for cabling a clicked source port to a destination port.
 *
 * Fetches connectable candidates (same rack first, then datacenter/site) from
 * GET /ports/candidates, then creates a Cable through the normal CRUD route so
 * changelog + the auto-generated Cable_Label apply. Source → A end,
 * destination → B end.
 */
export default function ConnectPanel({ source, onClose }: Props) {
  const qc = useQueryClient();
  const [cableType, setCableType] = useState<string>(
    source.port_type === "power" ? "power" : "copper"
  );
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: qErr } = useQuery({
    queryKey: [
      "port-candidates",
      source.owner_type,
      source.owner_id,
      source.port_kind,
      source.port_id,
    ],
    queryFn: () =>
      api.portCandidates({
        source_type: String(source.owner_type),
        source_id: Number(source.owner_id),
        source_port_kind: source.port_kind,
        source_port_id: source.port_id,
      }),
    enabled: source.owner_type != null && source.owner_id != null,
  });

  const connect = useMutation({
    mutationFn: (dest: PortCandidate) =>
      api.create("cables", {
        cable_type: cableType,
        port_a_type: source.owner_type,
        port_a_id: source.owner_id,
        port_b_type: dest.owner_type,
        port_b_id: dest.owner_id,
        label_a: source.label,
        label_b: dest.label,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cables"] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  const candidates = data?.candidates ?? [];
  const sameRack = candidates.filter((c) => c.same_rack);
  const otherScope = candidates.filter((c) => !c.same_rack);

  const swatch = (portType: string) => (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full border border-slate-600"
      style={{ backgroundColor: PORT_TYPE_HEX[portType?.toLowerCase()] ?? "#94a3b8" }}
    />
  );

  const candidateRow = (c: PortCandidate) => (
    <li key={`${c.port_kind}-${c.port_id}`}>
      <button
        type="button"
        disabled={connect.isPending}
        onClick={() => connect.mutate(c)}
        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded hover:bg-slate-100 disabled:opacity-50"
      >
        {swatch(c.port_type)}
        <span className="font-medium text-slate-800">{c.owner_name}</span>
        <span className="text-slate-500">· {c.label}</span>
        <span className="ml-auto text-[11px] text-slate-400">{c.port_type}</span>
      </button>
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">Connect port</h2>
          <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
            {swatch(source.port_type)}
            <span className="font-medium">{source.label}</span>
            <span>on {source.owner_type}</span>
          </p>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <label className="text-xs text-slate-500 uppercase tracking-wide">
            Cable type
          </label>
          <select
            value={cableType}
            onChange={(e) => setCableType(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            {CABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-y-auto px-2 py-2 flex-1">
          {isLoading && (
            <p className="text-sm text-slate-500 px-3 py-2">Finding ports…</p>
          )}
          {isError && (
            <p className="text-sm text-rose-600 px-3 py-2">
              {qErr instanceof Error ? qErr.message : "Could not load candidates."}
            </p>
          )}
          {!isLoading && !isError && candidates.length === 0 && (
            <p className="text-sm text-slate-500 px-3 py-2">
              No connectable ports found in the same rack, datacenter or site.
            </p>
          )}
          {sameRack.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-slate-400">
                Same rack
              </p>
              <ul>{sameRack.map(candidateRow)}</ul>
            </>
          )}
          {otherScope.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-slate-400">
                Same {data?.scope ?? "datacenter"}
              </p>
              <ul>{otherScope.map(candidateRow)}</ul>
            </>
          )}
        </div>

        {error && (
          <p className="px-5 py-2 text-sm text-rose-600 border-t border-slate-200">
            {error}
          </p>
        )}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
