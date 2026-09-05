import { useMemo, useState } from "react";
import { Row } from "../api";
import ConnectionDot from "./ConnectionDot";
import { RackPort } from "./RackDiagramSVG";
import { CableRow, ConnectionResolution, resolveConnection } from "../lib/connections";

// Geometry constants for the patch-panel grid (Convention_Layout — Phase 4
// Req 16.2). Patch panels don't have a per-model stencil/anchor concept in
// this schema (no Device_Type_Lookup for them), so every panel renders as a
// simple numbered port grid, wrapping at MAX_PER_ROW the way a physical
// 24-port panel wraps to a second row at 48 ports.
const MAX_PER_ROW = 24;
const COL_W = 22; // px between port centers
const ROW_H = 46; // px between row centers
const MARGIN_X = 24;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 20;
const DOT_R = 6;

export interface PatchPanelPortRow {
  id: number;
  port_number: number;
  label?: string | null;
}

interface Props {
  panel: Row;
  /** Ports belonging to THIS panel (already filtered by patch_panel_id). */
  ports: PatchPanelPortRow[];
  /** Every cable in scope, so each dot can resolve connected/unconnected. */
  cables?: CableRow[];
  /** Clicking a port dot; resolution is that port's resolveConnection result. */
  onPortClick?: (port: RackPort, resolution: ConnectionResolution) => void;
}

/**
 * Phase 4 Task 21 — graphical patch-panel view: one Connection_Dot per
 * `PatchPanelPort`, laid out in numbered rows (wrapping at `MAX_PER_ROW`),
 * using the same shared `ConnectionDot` + `resolveConnection` pipeline as the
 * rack back face.
 *
 * A patch-panel port's owner (for cabling purposes) is the PANEL itself, not
 * the individual port — mirrored from `backend/app/ports.py`'s
 * `candidate_ports()` — so `resolveConnection` disambiguates by the port's
 * own label, exactly like a multi-outlet PDU.
 */
export default function PatchPanelDiagramSVG({ panel, ports, cables = [], onPortClick }: Props) {
  const [hovered, setHovered] = useState<PatchPanelPortRow | null>(null);

  const sorted = useMemo(
    () => [...ports].sort((a, b) => a.port_number - b.port_number),
    [ports]
  );

  const cols = Math.min(MAX_PER_ROW, Math.max(1, sorted.length));
  const rows = Math.max(1, Math.ceil(sorted.length / MAX_PER_ROW));
  const width = MARGIN_X * 2 + (cols - 1) * COL_W + DOT_R * 2 + 20;
  const height = MARGIN_TOP + MARGIN_BOTTOM + (rows - 1) * ROW_H + ROW_H;

  const asRackPort = (p: PatchPanelPortRow): RackPort => ({
    port_kind: "patch_panel_port",
    port_id: p.id,
    owner_type: "patch-panels",
    owner_id: panel.id,
    label: p.label || `port ${p.port_number}`,
    port_type: "copper",
    unit_number: null,
  });

  const connectionFor = (p: PatchPanelPortRow): ConnectionResolution =>
    resolveConnection(
      { type: "patch-panels", id: panel.id, label: p.label || `port ${p.port_number}` },
      cables
    );

  const dots = sorted.map((p, i) => {
    const row = Math.floor(i / MAX_PER_ROW);
    const col = i % MAX_PER_ROW;
    const cx = MARGIN_X + DOT_R + col * COL_W;
    const cy = MARGIN_TOP + row * ROW_H;
    const conn = connectionFor(p);
    const rackPort = asRackPort(p);
    return (
      <g key={p.id}>
        <ConnectionDot
          cx={cx}
          cy={cy}
          r={DOT_R}
          portType="copper"
          connected={conn.connected}
          title={
            conn.connected
              ? `${rackPort.label} → ${conn.farLabel ?? "connected"}`
              : rackPort.label
          }
          onMouseEnter={() => setHovered(p)}
          onMouseLeave={() => setHovered((h) => (h === p ? null : h))}
          onClick={onPortClick ? () => onPortClick(rackPort, conn) : undefined}
        />
        <text
          x={cx}
          y={cy + DOT_R + 12}
          fontSize={8}
          textAnchor="middle"
          fill="#64748b"
          fontFamily="monospace"
        >
          {p.port_number}
        </text>
      </g>
    );
  });

  const hoverLabel = hovered
    ? (() => {
        const idx = sorted.indexOf(hovered);
        const row = Math.floor(idx / MAX_PER_ROW);
        const col = idx % MAX_PER_ROW;
        const cx = MARGIN_X + DOT_R + col * COL_W;
        const cy = MARGIN_TOP + row * ROW_H;
        const conn = connectionFor(hovered);
        const text = conn.connected
          ? `${hovered.label || `port ${hovered.port_number}`} → ${conn.farLabel ?? "connected"}`
          : hovered.label || `port ${hovered.port_number}`;
        return (
          <g pointerEvents="none">
            <rect
              x={cx - Math.min(width - 8, text.length * 3 + 8) / 2}
              y={cy - DOT_R - 20}
              width={Math.min(width - 8, text.length * 6 + 12)}
              height={14}
              rx={3}
              fill="#0f172a"
              opacity={0.9}
            />
            <text
              x={cx - Math.min(width - 8, text.length * 6 + 12) / 2 + 6}
              y={cy - DOT_R - 9}
              fontSize={9}
              fill="#f8fafc"
              fontFamily="sans-serif"
            >
              {text}
            </text>
          </g>
        );
      })()
    : null;

  const panelLabel = panel.panel_id_label || `Patch Panel #${panel.id}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, height: "auto" }}
      role="img"
      aria-label={`Patch panel ${panelLabel}, ${sorted.length} ports`}
    >
      <rect
        x={4}
        y={4}
        width={width - 8}
        height={height - 8}
        fill="#f1f5f9"
        stroke="#475569"
        strokeWidth={1.5}
        rx={4}
      />
      <text x={12} y={16} fontSize={9} fill="#334155" fontFamily="sans-serif" fontWeight={600}>
        {panelLabel}
      </text>
      {dots}
      {hoverLabel}
    </svg>
  );
}
