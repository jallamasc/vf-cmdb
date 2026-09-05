// Phase 4 Req 19 — shared anchor resolution + Convention_Layout fallback,
// used by every graphical view (rack back face, patch panels, power devices,
// port configuration) so there is exactly one implementation of "does this
// port have a precisely mapped position, and if not, where does it go".
import { Row } from "../api";

export interface NormalizedPoint {
  x: number;
  y: number;
}

/** A stencil_anchors row, as returned by the backend. */
export type AnchorRow = Row & {
  owner_resource: string;
  owner_id: number;
  face: "front" | "back";
  port_key: string;
  x: number;
  y: number;
  label?: string | null;
};

/**
 * Look up a mapped Anchor for a port by its identifier. Comparison is by
 * exact string match on `port_key` (identifiers are already normalized to
 * strings on both the write side — AnchorEditor — and every read site).
 */
export function resolveAnchor(
  anchors: AnchorRow[] | undefined,
  portKey: string | number
): NormalizedPoint | null {
  if (!anchors || anchors.length === 0) return null;
  const key = String(portKey);
  const hit = anchors.find((a) => a.port_key === key);
  return hit ? { x: hit.x, y: hit.y } : null;
}

/**
 * Convention_Layout fallback: place item `index` (0-based) of `count` total
 * items in an evenly-spaced single row across the 0..1 box, vertically
 * centered. Mirrors the layout RackDiagramSVG already used for back-face
 * ports, generalized so other views (patch panel single-row layouts) can
 * reuse it.
 */
export function linearLayout(index: number, count: number): NormalizedPoint {
  if (count <= 1) return { x: 0.5, y: 0.5 };
  // Small inset so a dot at the extreme index is not drawn on the very edge.
  const inset = 0.06;
  const span = 1 - inset * 2;
  const x = inset + (index / (count - 1)) * span;
  return { x, y: 0.5 };
}

/**
 * Convention_Layout fallback: place item `index` of `count` total items in a
 * grid across the 0..1 box. `cols` defaults to a roughly-square layout
 * (ceil(sqrt(count))), which suits patch panel ports / power outlets / port
 * configuration grids where items don't naturally fall in a single row.
 */
export function gridLayout(
  index: number,
  count: number,
  cols?: number
): NormalizedPoint {
  if (count <= 1) return { x: 0.5, y: 0.5 };
  const columns = Math.max(1, cols ?? Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const row = Math.floor(index / columns);
  const col = index % columns;
  const insetX = columns > 1 ? 0.08 : 0;
  const insetY = rows > 1 ? 0.12 : 0;
  const x = columns > 1 ? insetX + (col / (columns - 1)) * (1 - insetX * 2) : 0.5;
  const y = rows > 1 ? insetY + (row / (rows - 1)) * (1 - insetY * 2) : 0.5;
  return { x, y };
}

export type LayoutKind = "linear" | "grid";

/**
 * The single entry point every graphical view should call: try a mapped
 * Anchor first (Req 19.3), and fall back to a computed layout when none
 * exists (Req 19.4) — so a device with no anchors mapped still renders
 * correctly, and only the models worth the effort need precise mapping.
 */
export function resolvePortPosition(
  anchors: AnchorRow[] | undefined,
  portKey: string | number,
  index: number,
  count: number,
  layout: LayoutKind = "linear",
  cols?: number
): NormalizedPoint {
  const mapped = resolveAnchor(anchors, portKey);
  if (mapped) return mapped;
  return layout === "grid" ? gridLayout(index, count, cols) : linearLayout(index, count);
}
