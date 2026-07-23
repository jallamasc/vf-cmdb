import { useMemo } from "react";
import { Row } from "../api";

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------
// Tailwind utility classes (used by the RackView legend) and their hex
// equivalents (used inside the SVG, which cannot resolve Tailwind classes).
export const TYPE_COLORS: Record<string, string> = {
  server: "bg-blue-200 border-blue-400",
  switch: "bg-emerald-200 border-emerald-400",
  router: "bg-teal-200 border-teal-400",
  firewall: "bg-rose-200 border-rose-400",
  pdu: "bg-amber-200 border-amber-400",
  ups: "bg-orange-200 border-orange-400",
  patchpanel: "bg-violet-200 border-violet-400",
  storage: "bg-cyan-200 border-cyan-400",
  empty: "bg-slate-50 border-slate-200",
};

// fill / stroke / text hex colours per device type.
export const TYPE_HEX: Record<string, { fill: string; stroke: string; text: string }> = {
  server: { fill: "#bfdbfe", stroke: "#3b82f6", text: "#1e3a8a" },
  switch: { fill: "#a7f3d0", stroke: "#10b981", text: "#065f46" },
  router: { fill: "#99f6e4", stroke: "#14b8a6", text: "#115e59" },
  firewall: { fill: "#fecdd3", stroke: "#f43f5e", text: "#9f1239" },
  pdu: { fill: "#fde68a", stroke: "#f59e0b", text: "#92400e" },
  ups: { fill: "#fed7aa", stroke: "#f97316", text: "#9a3412" },
  patchpanel: { fill: "#ddd6fe", stroke: "#8b5cf6", text: "#5b21b6" },
  storage: { fill: "#a5f3fc", stroke: "#06b6d4", text: "#155e75" },
  empty: { fill: "#f8fafc", stroke: "#e2e8f0", text: "#94a3b8" },
};

const DEFAULT_HEX = { fill: "#e2e8f0", stroke: "#94a3b8", text: "#334155" };

function hexFor(type?: string) {
  return TYPE_HEX[type ?? "empty"] ?? DEFAULT_HEX;
}

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------
const U_PX = 19; // pixels per rack unit
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 12;
const SVG_WIDTH = 300;
const LABEL_COL = 44; // left gutter for U numbers
const DEVICE_X = 50; // left edge of device rectangles
const DEVICE_W = 200; // device rectangle width
const RAIL_LEFT = 47;
const RAIL_RIGHT = 251;

// Rough character-width heuristic so labels stay inside their rectangles.
function truncateLabel(label: string, widthPx: number, fontPx: number): string {
  const maxChars = Math.max(3, Math.floor((widthPx - 8) / (fontPx * 0.58)));
  if (label.length <= maxChars) return label;
  if (maxChars <= 1) return label.slice(0, 1);
  return label.slice(0, maxChars - 1) + "…";
}

function deviceLabel(u: Row): string {
  return (u.label || u.device_table || u.device_type || "device") as string;
}

export interface RackDiagramSVGProps {
  rack: Row;
  units: Row[];
  selectedUnitId?: number | null;
  onDeviceClick?: (unit: Row) => void;
}

/**
 * Professional Visio-style SVG rack-elevation diagram.
 *
 * - Numbered U positions (1U at the bottom, ascending upward).
 * - Device rectangles colour-coded by device type, spanning their U height.
 * - Truncated device labels centred inside each rectangle.
 * - Click a device to trigger ``onDeviceClick``.
 */
export default function RackDiagramSVG({
  rack,
  units,
  selectedUnitId,
  onDeviceClick,
}: RackDiagramSVGProps) {
  const total = Math.max(1, rack.total_units || 42);
  const rackHeight = total * U_PX;
  const svgHeight = rackHeight + MARGIN_TOP + MARGIN_BOTTOM;

  // Top-Y of a given U (1-indexed, U1 at the bottom).
  const yTop = (u: number) => MARGIN_TOP + (total - u) * U_PX;

  // Which U positions are covered by a device (for empty-slot rendering).
  const occupied = useMemo(() => {
    const set = new Set<number>();
    units.forEach((u) => {
      const h = u.height_units || 1;
      for (let i = 0; i < h; i++) set.add((u.unit_number || 0) + i);
    });
    return set;
  }, [units]);

  // Only render valid devices (within rack bounds).
  const devices = useMemo(
    () =>
      units
        .filter((u) => u.unit_number >= 1 && u.unit_number <= total)
        .sort((a, b) => a.unit_number - b.unit_number),
    [units, total],
  );

  return (
    <svg
      viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
      width="100%"
      style={{ maxWidth: SVG_WIDTH, height: "auto" }}
      role="img"
      aria-label={`Rack elevation, ${total}U`}
      className="select-none"
    >
      {/* Outer rack frame */}
      <rect
        x={DEVICE_X - 8}
        y={MARGIN_TOP - 6}
        width={DEVICE_W + 16}
        height={rackHeight + 12}
        rx={4}
        fill="#1e293b"
        stroke="#0f172a"
        strokeWidth={2}
      />

      {/* Empty U slots + U-number labels */}
      {Array.from({ length: total }, (_, i) => total - i).map((u) => {
        const empty = !occupied.has(u);
        return (
          <g key={`u-${u}`}>
            {empty && (
              <rect
                x={DEVICE_X}
                y={yTop(u)}
                width={DEVICE_W}
                height={U_PX}
                fill={TYPE_HEX.empty.fill}
                stroke={TYPE_HEX.empty.stroke}
                strokeWidth={0.5}
              />
            )}
            <text
              x={LABEL_COL - 6}
              y={yTop(u) + U_PX / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={8}
              fontFamily="monospace"
              fill="#94a3b8"
            >
              {u}
            </text>
          </g>
        );
      })}

      {/* Mounting rails */}
      <line x1={RAIL_LEFT} y1={MARGIN_TOP} x2={RAIL_LEFT} y2={MARGIN_TOP + rackHeight} stroke="#475569" strokeWidth={2} />
      <line x1={RAIL_RIGHT} y1={MARGIN_TOP} x2={RAIL_RIGHT} y2={MARGIN_TOP + rackHeight} stroke="#475569" strokeWidth={2} />

      {/* Devices */}
      {devices.map((u) => {
        const h = Math.max(1, u.height_units || 1);
        const topU = Math.min(total, u.unit_number + h - 1);
        const y = yTop(topU);
        const height = h * U_PX;
        const colors = hexFor(u.device_type);
        const isSelected = selectedUnitId != null && u.id === selectedUnitId;
        const fontPx = h > 1 ? 11 : 9.5;
        const suffix = h > 1 ? ` (${h}U)` : "";
        // Reserve room for the "(NU)" suffix so the combined text never overflows.
        const suffixPx = suffix.length * fontPx * 0.58;
        const label = truncateLabel(deviceLabel(u), DEVICE_W - suffixPx, fontPx);
        return (
          <g
            key={`dev-${u.id ?? `${u.unit_number}-${u.device_type}`}`}
            onClick={() => onDeviceClick?.(u)}
            style={{ cursor: onDeviceClick ? "pointer" : "default" }}
          >
            <rect
              x={DEVICE_X}
              y={y + 1}
              width={DEVICE_W}
              height={height - 2}
              rx={2}
              fill={colors.fill}
              stroke={isSelected ? "#0f172a" : colors.stroke}
              strokeWidth={isSelected ? 2.5 : 1}
            />
            <text
              x={DEVICE_X + DEVICE_W / 2}
              y={y + height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontPx}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight={600}
              fill={colors.text}
            >
              {label}
              {suffix}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
