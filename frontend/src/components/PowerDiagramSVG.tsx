import { useMemo, useState } from "react";
import { Row } from "../api";
import ConnectionDot from "./ConnectionDot";
import { RackPort } from "./RackDiagramSVG";
import { CableRow, ConnectionResolution, resolveConnection } from "../lib/connections";
import { AnchorRow, resolvePortPosition } from "../lib/anchors";

const BOX_W = 260;
const BOX_H = 200;
const PAD = 10;
const DOT_R = 6;

export interface PowerOutletRow {
  id: number;
  port_number?: number | null;
  label?: string | null;
}

interface Props {
  device: Row;
  /** Outlets belonging to THIS power device (already filtered by power_device_id). */
  outlets: PowerOutletRow[];
  /**
   * Requirement 17.2/17.3 — the device type's stencil href for the current
   * face, or undefined/null when none is configured (Convention_Layout
   * fallback grid is used either way; the stencil is purely a visual behind
   * the same dots).
   */
  stencilHref?: string | null;
  /** Anchors for the device's type + current face, if any have been mapped. */
  anchors?: AnchorRow[];
  cables?: CableRow[];
  onPortClick?: (port: RackPort, resolution: ConnectionResolution) => void;
}

/**
 * Phase 4 Task 23 — graphical power-device view (Requirement 17). Renders
 * the device type's stencil when one is configured, else a plain frame;
 * either way, one Connection_Dot per `PowerOutlet`, positioned via a mapped
 * Anchor when one exists and a grid Convention_Layout otherwise — exactly
 * the same `lib/anchors.ts#resolvePortPosition` pipeline the design doc
 * specifies for Port_Config_View, reused here since PowerDeviceType (unlike
 * PatchPanel) DOES carry a Device_Type_Lookup stencil/anchor concept.
 */
export default function PowerDiagramSVG({
  device,
  outlets,
  stencilHref,
  anchors,
  cables = [],
  onPortClick,
}: Props) {
  const [hovered, setHovered] = useState<PowerOutletRow | null>(null);

  const sorted = useMemo(
    () => [...outlets].sort((a, b) => (a.port_number ?? 0) - (b.port_number ?? 0)),
    [outlets]
  );

  const asRackPort = (o: PowerOutletRow): RackPort => ({
    port_kind: "outlet",
    port_id: o.id,
    owner_type: "power-devices",
    owner_id: device.id,
    label: o.label || (o.port_number != null ? `outlet ${o.port_number}` : `po#${o.id}`),
    port_type: "power",
    unit_number: null,
  });

  const connectionFor = (o: PowerOutletRow): ConnectionResolution => {
    const rp = asRackPort(o);
    return resolveConnection({ type: rp.owner_type, id: rp.owner_id, label: rp.label }, cables);
  };

  const positionFor = (o: PowerOutletRow, index: number) => {
    const key = o.port_number != null ? String(o.port_number) : String(o.id);
    const norm = resolvePortPosition(anchors, key, index, Math.max(sorted.length, 1), "grid");
    return {
      x: PAD + norm.x * (BOX_W - PAD * 2),
      y: PAD + norm.y * (BOX_H - PAD * 2),
    };
  };

  const deviceLabel = device.vf_long_name || device.model || `Power Device #${device.id}`;

  const dots = sorted.map((o, i) => {
    const { x, y } = positionFor(o, i);
    const conn = connectionFor(o);
    const rackPort = asRackPort(o);
    return (
      <g key={o.id}>
        <ConnectionDot
          cx={x}
          cy={y}
          r={DOT_R}
          portType="power"
          connected={conn.connected}
          title={
            conn.connected ? `${rackPort.label} → ${conn.farLabel ?? "connected"}` : rackPort.label
          }
          onMouseEnter={() => setHovered(o)}
          onMouseLeave={() => setHovered((h) => (h === o ? null : h))}
          onClick={onPortClick ? () => onPortClick(rackPort, conn) : undefined}
        />
        {o.port_number != null && (
          <text
            x={x}
            y={y + DOT_R + 12}
            fontSize={8}
            textAnchor="middle"
            fill="#64748b"
            fontFamily="monospace"
          >
            {o.port_number}
          </text>
        )}
      </g>
    );
  });

  const hoverLabel = hovered
    ? (() => {
        const idx = sorted.indexOf(hovered);
        const { x, y } = positionFor(hovered, idx);
        const conn = connectionFor(hovered);
        const text = conn.connected
          ? `${hovered.label || `outlet ${hovered.port_number}`} → ${conn.farLabel ?? "connected"}`
          : hovered.label || `outlet ${hovered.port_number}`;
        const w = Math.min(BOX_W - 8, text.length * 6 + 12);
        return (
          <g pointerEvents="none">
            <rect x={x - w / 2} y={y - DOT_R - 20} width={w} height={14} rx={3} fill="#0f172a" opacity={0.9} />
            <text x={x - w / 2 + 6} y={y - DOT_R - 9} fontSize={9} fill="#f8fafc" fontFamily="sans-serif">
              {text}
            </text>
          </g>
        );
      })()
    : null;

  return (
    <svg
      viewBox={`0 0 ${BOX_W} ${BOX_H}`}
      width="100%"
      style={{ maxWidth: BOX_W, height: "auto" }}
      role="img"
      aria-label={`Power device ${deviceLabel}, ${sorted.length} outlets`}
    >
      {stencilHref ? (
        <image
          href={stencilHref}
          x={0}
          y={0}
          width={BOX_W}
          height={BOX_H}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Req 8.2 — hovering the device itself, not just an outlet. */}
          <title>{deviceLabel}</title>
        </image>
      ) : (
        <rect
          x={2}
          y={2}
          width={BOX_W - 4}
          height={BOX_H - 4}
          fill="#fef3c7"
          stroke="#d97706"
          strokeWidth={1.5}
          rx={4}
        >
          <title>{deviceLabel}</title>
        </rect>
      )}
      <text x={8} y={14} fontSize={9} fill="#78350f" fontFamily="sans-serif" fontWeight={600}>
        {deviceLabel}
      </text>
      {dots}
      {hoverLabel}
    </svg>
  );
}
