import { useMemo } from "react";
import { Row } from "../api";

// Hex colour map for SVG fills, keyed by device type. Mirrors the Tailwind
// TYPE_COLORS used elsewhere in the app but expressed as concrete hex codes so
// they can be used directly as SVG fill/stroke values.
export const TYPE_HEX: Record<string, { fill: string; stroke: string }> = {
  server: { fill: "#bfdbfe", stroke: "#60a5fa" }, // blue-200 / blue-400
  switch: { fill: "#a7f3d0", stroke: "#34d399" }, // emerald-200 / emerald-400
  router: { fill: "#99f6e4", stroke: "#2dd4bf" }, // teal-200 / teal-400
  firewall: { fill: "#fecdd3", stroke: "#fb7185" }, // rose-200 / rose-400
  pdu: { fill: "#fde68a", stroke: "#fbbf24" }, // amber-200 / amber-400
  ups: { fill: "#fed7aa", stroke: "#fb923c" }, // orange-200 / orange-400
  patchpanel: { fill: "#ddd6fe", stroke: "#a78bfa" }, // violet-200 / violet-400
  storage: { fill: "#a5f3fc", stroke: "#22d3ee" }, // cyan-200 / cyan-400
  empty: { fill: "#f8fafc", stroke: "#e2e8f0" }, // slate-50 / slate-200
};

// Geometry constants for the SVG rack elevation.
const U_HEIGHT = 19; // px per rack unit
const RAIL_X = 50; // left rail x-position (device rect starts here)
const DEVICE_W = 200; // device rectangle width
const SVG_W = 300; // overall svg width
const TOP_PAD = 4; // padding above 1U row
const BOTTOM_PAD = 4;

function typeColors(deviceType?: string | null) {
  return TYPE_HEX[deviceType ?? "empty"] ?? TYPE_HEX.empty;
}

function truncate(label: string, max: number) {
  if (label.length <= max) return label;
  return label.slice(0, Math.max(0, max - 1)) + "…";
}

interface Props {
  rack: Row;
  units: Row[];
}

/**
 * Professional SVG rack elevation diagram (Visio-style).
 *
 * - U positions numbered from the bottom (1U) upward to `rack.total_units`.
 * - Devices drawn as colour-coded rectangles scaled by their U height.
 * - Empty U slots rendered as light-gray background rows.
 * - Outer frame + side rails; U labels down the left column.
 */
export default function RackDiagramSVG({ rack, units }: Props) {
  const total: number = rack.total_units || 42;
  const height = total * U_HEIGHT + TOP_PAD + BOTTOM_PAD;

  // Map every occupied U -> the device occupying it (accounting for height).
  const occupancy = useMemo(() => {
    const map = new Map<number, Row>();
    units.forEach((u) => {
      const h = u.height_units || 1;
      for (let i = 0; i < h; i++) map.set(u.unit_number + i, u);
    });
    return map;
  }, [units]);

  // Convert a U number (1..total) to the Y coordinate of the TOP of that U row.
  // U 1 sits at the bottom; higher U numbers are higher up (smaller Y).
  const yForU = (u: number) => TOP_PAD + (total - u) * U_HEIGHT;

  const emptyRows: JSX.Element[] = [];
  const uLabels: JSX.Element[] = [];
  for (let u = 1; u <= total; u++) {
    const y = yForU(u);
    if (!occupancy.get(u)) {
      const c = TYPE_HEX.empty;
      emptyRows.push(
        <rect
          key={`empty-${u}`}
          x={RAIL_X}
          y={y}
          width={DEVICE_W}
          height={U_HEIGHT}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth={0.5}
        />
      );
    }
    // U number label on the left, right-aligned to the rail.
    uLabels.push(
      <text
        key={`lbl-${u}`}
        x={RAIL_X - 6}
        y={y + U_HEIGHT / 2 + 3}
        fontSize={8}
        textAnchor="end"
        fill="#94a3b8"
        fontFamily="monospace"
      >
        {u}
      </text>
    );
  }

  // Draw device rectangles (only once, at the base U of each device).
  const deviceRects: JSX.Element[] = [];
  const seen = new Set<number>();
  units.forEach((u) => {
    if (seen.has(u.id)) return;
    seen.add(u.id);
    const h = u.height_units || 1;
    const baseU = u.unit_number;
    const topU = baseU + h - 1; // highest U occupied
    if (baseU < 1 || topU > total) return; // out of range guard
    const y = yForU(topU); // top of the block
    const rectH = h * U_HEIGHT;
    const c = typeColors(u.device_type);
    const rawLabel = u.label || u.device_table || u.device_type || "device";
    const label = truncate(String(rawLabel), 26);
    deviceRects.push(
      <g key={`dev-${u.id}`}>
        <rect
          x={RAIL_X}
          y={y}
          width={DEVICE_W}
          height={rectH}
          fill={c.fill}
          stroke={c.stroke}
          strokeWidth={1}
          rx={2}
        />
        <text
          x={RAIL_X + DEVICE_W / 2}
          y={y + rectH / 2 + 3}
          fontSize={9}
          textAnchor="middle"
          fill="#1e293b"
          fontFamily="sans-serif"
        >
          {label}
          {h > 1 ? ` (${h}U)` : ""}
        </text>
      </g>
    );
  });

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${height}`}
      width="100%"
      style={{ maxWidth: SVG_W, height: "auto" }}
      role="img"
      aria-label={`Rack elevation, ${total}U`}
    >
      {/* Outer frame */}
      <rect
        x={RAIL_X - 8}
        y={TOP_PAD - 2}
        width={DEVICE_W + 16}
        height={total * U_HEIGHT + 4}
        fill="none"
        stroke="#475569"
        strokeWidth={2}
        rx={3}
      />
      {/* Side rails */}
      <line
        x1={RAIL_X - 2}
        y1={TOP_PAD - 2}
        x2={RAIL_X - 2}
        y2={TOP_PAD + total * U_HEIGHT + 2}
        stroke="#94a3b8"
        strokeWidth={1}
      />
      <line
        x1={RAIL_X + DEVICE_W + 2}
        y1={TOP_PAD - 2}
        x2={RAIL_X + DEVICE_W + 2}
        y2={TOP_PAD + total * U_HEIGHT + 2}
        stroke="#94a3b8"
        strokeWidth={1}
      />
      {emptyRows}
      {uLabels}
      {deviceRects}
    </svg>
  );
}
