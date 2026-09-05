import { useMemo, useState } from "react";
import { Row } from "../api";
import ConnectionDot from "./ConnectionDot";
import { RackPort } from "./RackDiagramSVG";
import { CableRow, ConnectionResolution, interfacePortType, resolveConnection } from "../lib/connections";
import { AnchorRow, resolvePortPosition } from "../lib/anchors";

const BOX_W = 320;
const BOX_H = 220;
const PAD = 12;
const DOT_R = 6;
const GEAR_OFFSET = 10; // gear icon sits this many px up-right of its dot

export interface DeviceInterfaceRow extends Row {
  id: number;
  port_number?: number | null;
  description?: string | null;
  speed?: string | null;
}

interface Props {
  device: Row;
  /** Interfaces belonging to THIS network device (already filtered). */
  ports: DeviceInterfaceRow[];
  stencilHref?: string | null;
  anchors?: AnchorRow[];
  cables?: CableRow[];
  /** Requirement 15: click the dot itself to connect/view/edit a connection. */
  onPortClick?: (port: RackPort, resolution: ConnectionResolution) => void;
  /**
   * Requirement 18.4 — a SEPARATE click target (the small gear glyph) opens
   * the port's own configuration fields (description, mode, VLAN, speed,
   * ...), distinct from the connection dot's connect/view click.
   */
  onSettingsClick?: (iface: DeviceInterfaceRow) => void;
}

/**
 * Phase 4 Task 24 — graphical port-configuration view for a network device
 * (Requirement 18). Same anchor-aware/Convention_Layout pipeline as
 * `PowerDiagramSVG` (NetworkDeviceType carries the same stencil/anchor
 * pair), but each port renders TWO independent click targets: the
 * Connection_Dot itself (connect / view / edit / remove a cable) and a
 * small gear glyph beside it (edit the port's own configuration fields).
 */
export default function PortConfigDiagramSVG({
  device,
  ports,
  stencilHref,
  anchors,
  cables = [],
  onPortClick,
  onSettingsClick,
}: Props) {
  const [hovered, setHovered] = useState<DeviceInterfaceRow | null>(null);

  const sorted = useMemo(
    () => [...ports].sort((a, b) => (a.port_number ?? 0) - (b.port_number ?? 0)),
    [ports]
  );

  const labelFor = (p: DeviceInterfaceRow) =>
    p.description || (p.port_number != null ? `port ${p.port_number}` : `if#${p.id}`);

  const asRackPort = (p: DeviceInterfaceRow): RackPort => ({
    port_kind: "interface",
    port_id: p.id,
    owner_type: "network-devices",
    owner_id: device.id,
    label: labelFor(p),
    port_type: interfacePortType(p),
    unit_number: null,
  });

  const connectionFor = (p: DeviceInterfaceRow): ConnectionResolution => {
    const rp = asRackPort(p);
    return resolveConnection({ type: rp.owner_type, id: rp.owner_id, label: rp.label }, cables);
  };

  const positionFor = (p: DeviceInterfaceRow, index: number) => {
    const key = p.port_number != null ? String(p.port_number) : String(p.id);
    const norm = resolvePortPosition(anchors, key, index, Math.max(sorted.length, 1), "grid");
    return {
      x: PAD + norm.x * (BOX_W - PAD * 2),
      y: PAD + norm.y * (BOX_H - PAD * 2),
    };
  };

  const deviceLabel = device.vf_long_name || device.vf_friendly_name || `Network Device #${device.id}`;

  const dots = sorted.map((p, i) => {
    const { x, y } = positionFor(p, i);
    const conn = connectionFor(p);
    const rackPort = asRackPort(p);
    return (
      <g key={p.id}>
        <ConnectionDot
          cx={x}
          cy={y}
          r={DOT_R}
          portType={rackPort.port_type}
          connected={conn.connected}
          title={
            conn.connected ? `${rackPort.label} → ${conn.farLabel ?? "connected"}` : rackPort.label
          }
          onMouseEnter={() => setHovered(p)}
          onMouseLeave={() => setHovered((h) => (h === p ? null : h))}
          onClick={onPortClick ? () => onPortClick(rackPort, conn) : undefined}
        />
        {onSettingsClick && (
          <text
            x={x + GEAR_OFFSET}
            y={y - GEAR_OFFSET}
            fontSize={10}
            textAnchor="middle"
            style={{ cursor: "pointer" }}
            onClick={() => onSettingsClick(p)}
          >
            <title>{`Edit ${labelFor(p)}'s configuration`}</title>
            ⚙
          </text>
        )}
        {p.port_number != null && (
          <text
            x={x}
            y={y + DOT_R + 12}
            fontSize={8}
            textAnchor="middle"
            fill="#64748b"
            fontFamily="monospace"
          >
            {p.port_number}
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
          ? `${labelFor(hovered)} → ${conn.farLabel ?? "connected"}`
          : labelFor(hovered);
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
      aria-label={`Port configuration for ${deviceLabel}, ${sorted.length} ports`}
    >
      {stencilHref ? (
        <image
          href={stencilHref}
          x={0}
          y={0}
          width={BOX_W}
          height={BOX_H}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <rect
          x={2}
          y={2}
          width={BOX_W - 4}
          height={BOX_H - 4}
          fill="#ecfdf5"
          stroke="#10b981"
          strokeWidth={1.5}
          rx={4}
        />
      )}
      <text x={8} y={14} fontSize={9} fill="#064e3b" fontFamily="sans-serif" fontWeight={600}>
        {deviceLabel}
      </text>
      {dots}
      {hoverLabel}
    </svg>
  );
}
