import { useMemo, useState } from "react";
import { Row } from "../api";
import ConnectionDot from "./ConnectionDot";
import { CableRow, ConnectionResolution, resolveConnection } from "../lib/connections";

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
  // Phase 5 Task 21 — a rack-placed Generic_Entity (admin-defined asset
  // type), regardless of which specific Entity_Type_Def it is.
  generic: { fill: "#e9d5ff", stroke: "#c084fc" }, // purple-200 / purple-400
  empty: { fill: "#f8fafc", stroke: "#e2e8f0" }, // slate-50 / slate-200
};

// FEAT-6 (6A/6C): connector-dot colour by port type.
export const PORT_TYPE_HEX: Record<string, string> = {
  copper: "#2563eb", // blue-600
  fiber: "#f97316", // orange-500
  power: "#eab308", // yellow-500
};

// Phase 4 Req 20: shared by ConnectionDot so every graphical view (rack,
// patch panel, power) colours its port dots identically.
export function portColor(portType?: string | null): string {
  return PORT_TYPE_HEX[(portType ?? "").toLowerCase()] ?? "#94a3b8"; // slate-400 fallback
}

// Geometry constants for the SVG rack elevation.
const U_HEIGHT = 19; // px per rack unit
const RAIL_X = 50; // left rail x-position (device rect starts here)
const DEVICE_W = 200; // device rectangle width
const SVG_W = 300; // overall svg width
const TOP_PAD = 4; // padding above 1U row
const BOTTOM_PAD = 4;
const DOT_R = 3.5; // connector-dot radius

function typeColors(deviceType?: string | null) {
  return TYPE_HEX[deviceType ?? "empty"] ?? TYPE_HEX.empty;
}

function truncate(label: string, max: number) {
  if (label.length <= max) return label;
  return label.slice(0, Math.max(0, max - 1)) + "…";
}

// A port drawn on the back face, already resolved to the rack + its owner U.
// Phase 4 Task 21: "patch_panel_port" widens this beyond rack-mounted device
// ports so ConnectPanel/ConnectionInfoPanel/api.portCandidates stay generic
// across every graphical view (rack, patch panel, ...).
export interface RackPort {
  port_kind: "interface" | "outlet" | "patch_panel_port";
  port_id: number;
  owner_type: string | null;
  owner_id: number | null;
  label: string;
  port_type: string; // copper | fiber | power
  /** The rack U where the owning device sits (base U). */
  unit_number: number | null;
}

interface Props {
  rack: Row;
  units: Row[];
  /** FEAT-6 (6A): which face to render. Defaults to "front". */
  face?: "front" | "back";
  /** FEAT-6 (6A/6C): ports owned by devices in THIS rack, for the back face. */
  ports?: RackPort[];
  /**
   * Phase 4 Req 20 — every cable in scope (the caller may pass all cables;
   * only the ones touching a port drawn here matter), so each back-face dot
   * can resolve whether it's connected and, if so, to what.
   */
  cables?: CableRow[];
  /**
   * FEAT-6 (6B) / Phase 4 Req 14 — `rack_units.id` -> resolved stencil href
   * for the CURRENT face. Keyed per mounted unit (not by the coarse
   * `device_type` string) because two devices sharing the same coarse type
   * ("switch") can be different models with different stencils. The caller
   * (RackView) resolves each unit's actual device-type row and rebuilds this
   * map when the face toggles.
   */
  stencilHrefByUnit?: Record<number, string>;
  /**
   * FEAT-6 (6C) / Phase 4 Req 20 — clicking a back-face port dot. `resolution`
   * is that port's `resolveConnection` result, so the caller can decide
   * whether to open the Connect panel (unconnected) or the connection info
   * panel (connected) without recomputing it.
   */
  onPortClick?: (port: RackPort, resolution: ConnectionResolution) => void;
  /**
   * Phase 4 Req 13 — clicking a front-face U slot, empty or occupied. `unit`
   * is the owning `rack_units` row for an occupied slot's BASE U, or null for
   * an empty slot (opens RackSlotEditor to add/edit/remove equipment there).
   */
  onSlotClick?: (info: { unitNumber: number; unit: Row | null }) => void;
}

/**
 * Professional SVG rack elevation diagram (Visio-style), front OR back face.
 *
 * Front (default):
 * - U positions numbered from the bottom (1U) up to `rack.total_units`.
 * - Devices drawn as colour-coded rectangles (or an embedded stencil SVG when
 *   a stencil is configured for the device type), scaled by their U height.
 * Back:
 * - Same rectangles, dimmed, with one connector dot per owned port, coloured
 *   by port type (copper=blue, fiber=orange, power=yellow). Hover shows the
 *   port label; clicking a dot bubbles the port to `onPortClick`.
 */
export default function RackDiagramSVG({
  rack,
  units,
  face = "front",
  ports = [],
  cables = [],
  stencilHrefByUnit = {},
  onPortClick,
  onSlotClick,
}: Props) {
  const total: number = rack.total_units || 42;
  const height = total * U_HEIGHT + TOP_PAD + BOTTOM_PAD;
  const isBack = face === "back";
  const [hovered, setHovered] = useState<RackPort | null>(null);

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
      const clickableEmpty = !isBack && onSlotClick;
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
          // Req 8.1 — a dashed border reads as "available" at a glance,
          // distinct from every occupied device's solid-bordered rectangle.
          strokeDasharray="3,2"
          style={clickableEmpty ? { cursor: "pointer" } : undefined}
          onClick={
            clickableEmpty ? () => onSlotClick?.({ unitNumber: u, unit: null }) : undefined
          }
        >
          {/* Req 8.2 — every slot gets a hover tooltip, not just clickable ones. */}
          <title>{clickableEmpty ? `Add equipment at U${u}` : `Empty — U${u}`}</title>
        </rect>
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
    // Phase 4 Req 14: the caller resolves this per-unit href for whichever
    // face is currently showing (front stencil_url / back stencil_url_back),
    // so the same lookup works unchanged on either face.
    const stencil = stencilHrefByUnit[u.id];
    const clickableSlot = !isBack && onSlotClick;
    deviceRects.push(
      <g
        key={`dev-${u.id}`}
        opacity={isBack && !stencil ? 0.55 : 1}
        style={clickableSlot ? { cursor: "pointer" } : undefined}
        onClick={
          clickableSlot ? () => onSlotClick?.({ unitNumber: baseU, unit: u }) : undefined
        }
      >
        {/* Req 8.2 — every occupied slot gets a hover tooltip with the
            device's name, on both faces, not just the front-face clickable
            case. */}
        <title>
          {clickableSlot
            ? `Edit or remove ${label}`
            : `${label}${h > 1 ? ` (${h}U)` : ""}`}
        </title>
        {stencil ? (
          // FEAT-6 (6B) / Req 14: realistic per-model graphic, either face.
          <image
            href={stencil}
            x={RAIL_X}
            y={y}
            width={DEVICE_W}
            height={rectH}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
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
        )}
        {!stencil && (
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
        )}
      </g>
    );
  });

  // FEAT-6 (6A/6C): connector dots on the back face, laid out left-to-right
  // within the owning device's base-U row.
  // Phase 4 Req 20: is this port cabled, and to what? Label disambiguates
  // ports that share an owner (e.g. two interfaces on the same switch).
  const connectionFor = (p: RackPort): ConnectionResolution =>
    resolveConnection({ type: p.owner_type, id: p.owner_id, label: p.label }, cables);

  const portDots: JSX.Element[] = [];
  if (isBack && ports.length) {
    const byUnit = new Map<number, RackPort[]>();
    ports.forEach((p) => {
      if (p.unit_number == null) return;
      const arr = byUnit.get(p.unit_number) ?? [];
      arr.push(p);
      byUnit.set(p.unit_number, arr);
    });
    byUnit.forEach((list, unit) => {
      const y = yForU(unit) + U_HEIGHT / 2;
      list.forEach((p, i) => {
        const cx = RAIL_X + 12 + i * (DOT_R * 2 + 4);
        if (cx > RAIL_X + DEVICE_W - 6) return; // don't overflow the device
        const conn = connectionFor(p);
        portDots.push(
          <ConnectionDot
            key={`port-${p.port_kind}-${p.port_id}`}
            cx={cx}
            cy={y}
            r={DOT_R}
            portType={p.port_type}
            connected={conn.connected}
            title={
              conn.connected
                ? `${p.label} (${p.port_type}) → ${conn.farLabel ?? "connected"}`
                : `${p.label} (${p.port_type})`
            }
            onMouseEnter={() => setHovered(p)}
            onMouseLeave={() => setHovered((h) => (h === p ? null : h))}
            onClick={onPortClick ? () => onPortClick(p, conn) : undefined}
          />
        );
      });
    });
  }

  // Floating hover label for the currently-hovered port. Shows the far end
  // too when the port is already connected (Phase 4 Req 20).
  const hoverText = hovered
    ? (() => {
        const conn = connectionFor(hovered);
        return conn.connected ? `${hovered.label} → ${conn.farLabel ?? "connected"}` : hovered.label;
      })()
    : "";
  const hoverLabel =
    isBack && hovered ? (
      <g pointerEvents="none">
        <rect
          x={RAIL_X + 8}
          y={yForU(hovered.unit_number ?? 1) - 12}
          width={Math.min(DEVICE_W - 8, hoverText.length * 6 + 12)}
          height={14}
          rx={3}
          fill="#0f172a"
          opacity={0.9}
        />
        <text
          x={RAIL_X + 14}
          y={yForU(hovered.unit_number ?? 1) - 1}
          fontSize={9}
          fill="#f8fafc"
          fontFamily="sans-serif"
        >
          {hoverText}
        </text>
      </g>
    ) : null;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${height}`}
      width="100%"
      style={{ maxWidth: SVG_W, height: "auto" }}
      role="img"
      aria-label={`Rack elevation, ${total}U, ${face} face`}
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
      {portDots}
      {hoverLabel}
    </svg>
  );
}
