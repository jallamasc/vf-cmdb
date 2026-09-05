import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { PORT_TYPE_HEX, RackPort } from "./RackDiagramSVG";
import { ConnectionResolution } from "../lib/connections";

interface Props {
  /** The back-face port the user clicked (already known to be connected). */
  source: RackPort;
  /** resolveConnection(source, cables) — must have `connected: true`. */
  resolution: ConnectionResolution;
  /** Display name of the far-end owner device, resolved by the caller. */
  farEndOwnerName: string;
  /** Rack id the far end lives in, for the "Jump to far end" deep link. */
  farEndRackId: number | null;
  onClose: () => void;
  /** Switch to editing this connection (caller re-opens ConnectPanel in edit mode). */
  onEdit: () => void;
}

// Requirement 15.4: jump to the far end's OWN graphical view, not always the
// rack view. A patch-panel-port's/power-outlet's/network-device-interface's
// owner has its own dedicated view now; physical-servers and workstations
// (which have interfaces but no dedicated port-config view in this spec)
// still fall back to the rack view, which IS their correct own view.
function normalizeType(t: string | null | undefined): string {
  return (t ?? "").trim().toLowerCase().replace(/_/g, "-");
}

function farEndRoute(
  resolution: ConnectionResolution,
  farEndRackId: number | null
): string | null {
  const farEnd = resolution.farEnd;
  const type = normalizeType(farEnd?.type);
  if (farEnd?.id != null && type === "patch-panels") {
    return `/patch-panel-view?panelId=${farEnd.id}`;
  }
  if (farEnd?.id != null && type === "power-devices") {
    return `/power-device-view?deviceId=${farEnd.id}`;
  }
  if (farEnd?.id != null && type === "network-devices") {
    return `/port-config-view?deviceId=${farEnd.id}`;
  }
  if (farEndRackId != null) return `/racks?rackId=${farEndRackId}`;
  return null;
}

/**
 * Phase 4 Req 20 — view/edit/remove panel for an ALREADY-connected port.
 *
 * Shown when a connected `ConnectionDot` is clicked. Displays the far end
 * (owner + its own port label) with a deep link to jump straight to the far
 * end's OWN graphical view (Requirement 15.4), and offers Edit (re-cable to
 * a different destination) or Remove (delete the cable outright).
 */
export default function ConnectionInfoPanel({
  source,
  resolution,
  farEndOwnerName,
  farEndRackId,
  onClose,
  onEdit,
}: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => api.remove("cables", Number(resolution.cable!.id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cables"] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  });

  const swatch = (portType: string) => (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full border border-slate-600"
      style={{ backgroundColor: PORT_TYPE_HEX[portType?.toLowerCase()] ?? "#94a3b8" }}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">Connection</h2>
          <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
            {swatch(source.port_type)}
            <span className="font-medium">{resolution.ownLabel ?? source.label}</span>
            <span>on {source.owner_type}</span>
          </p>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
              Connected to
            </p>
            <p className="text-sm text-slate-800 flex items-center gap-1.5">
              {swatch(resolution.cable?.cable_type ?? source.port_type)}
              <span className="font-medium">{farEndOwnerName}</span>
              <span className="text-slate-500">· {resolution.farLabel ?? "—"}</span>
            </p>
            {resolution.cable?.cable_type && (
              <p className="text-[11px] text-slate-400 mt-1">
                Cable type: {resolution.cable.cable_type}
                {resolution.cable.label ? ` · ${resolution.cable.label}` : ""}
              </p>
            )}
          </div>

          {(() => {
            const route = farEndRoute(resolution, farEndRackId);
            if (!route) return null;
            const label = route.startsWith("/patch-panel-view")
              ? "Jump to far end's patch panel →"
              : route.startsWith("/power-device-view")
              ? "Jump to far end's power device →"
              : route.startsWith("/port-config-view")
              ? "Jump to far end's port config →"
              : "Jump to far end's rack →";
            return (
              <Link
                to={route}
                onClick={onClose}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {label}
              </Link>
            );
          })()}
        </div>

        {error && (
          <p className="px-5 py-2 text-sm text-rose-600 border-t border-slate-200">
            {error}
          </p>
        )}

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 rounded disabled:opacity-50"
          >
            Remove connection
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="px-3 py-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
