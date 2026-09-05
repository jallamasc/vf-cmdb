import { portColor } from "./RackDiagramSVG";

const DEFAULT_R = 3.5;

export interface ConnectionDotProps {
  cx: number;
  cy: number;
  r?: number;
  /** copper | fiber | power — drives the dot colour. */
  portType?: string | null;
  /** True when this port already has a cable. */
  connected: boolean;
  /** Tooltip text (usually the port label, plus far-end info when connected). */
  title?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Phase 4 Req 20 — shared, stateless connector-dot glyph for every graphical
 * view (rack back face, patch panel, power device, port-config). A connected
 * port renders as a solid dot with a faint halo ring so cabled ports read as
 * "occupied" at a glance; an unconnected port renders hollow (outline only),
 * inviting a click to cable it. Both states use the same port-type colour
 * (copper=blue, fiber=orange, power=yellow) as `RackDiagramSVG.PORT_TYPE_HEX`.
 *
 * Purely presentational: the caller resolves `connected` (via
 * `lib/connections.ts#resolveConnection`) and supplies the click handler that
 * opens either the Connect panel (unconnected) or the connection info panel
 * (connected).
 */
export default function ConnectionDot({
  cx,
  cy,
  r = DEFAULT_R,
  portType,
  connected,
  title,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: ConnectionDotProps) {
  const color = portColor(portType);
  return (
    <g
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {connected && (
        <circle
          cx={cx}
          cy={cy}
          r={r + 2}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.35}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={connected ? color : "#ffffff"}
        stroke={color}
        strokeWidth={connected ? 0.5 : 1.5}
      />
      {title && <title>{title}</title>}
    </g>
  );
}
