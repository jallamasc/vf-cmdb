import { describe, it, expect } from "vitest";
import {
  resolveAnchor,
  linearLayout,
  gridLayout,
  resolvePortPosition,
  AnchorRow,
} from "./anchors";

const anchors: AnchorRow[] = [
  { id: 1, owner_resource: "network-device-types", owner_id: 1, face: "back", port_key: "24", x: 0.7, y: 0.3 },
  { id: 2, owner_resource: "network-device-types", owner_id: 1, face: "back", port_key: "1", x: 0.05, y: 0.3 },
];

describe("resolveAnchor", () => {
  it("finds a mapped anchor by port_key", () => {
    expect(resolveAnchor(anchors, "24")).toEqual({ x: 0.7, y: 0.3 });
  });

  it("matches a numeric port key against the string port_key", () => {
    expect(resolveAnchor(anchors, 1)).toEqual({ x: 0.05, y: 0.3 });
  });

  it("returns null when no anchor matches", () => {
    expect(resolveAnchor(anchors, "999")).toBeNull();
  });

  it("returns null for an empty/undefined anchor list", () => {
    expect(resolveAnchor(undefined, "1")).toBeNull();
    expect(resolveAnchor([], "1")).toBeNull();
  });
});

describe("linearLayout", () => {
  it("centers a single item", () => {
    expect(linearLayout(0, 1)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("spreads items evenly across the row, first and last inset from the edge", () => {
    const first = linearLayout(0, 3);
    const last = linearLayout(2, 3);
    expect(first.x).toBeGreaterThan(0);
    expect(last.x).toBeLessThan(1);
    expect(last.x).toBeGreaterThan(first.x);
  });
});

describe("gridLayout", () => {
  it("centers a single item", () => {
    expect(gridLayout(0, 1)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("distributes items across multiple rows when count exceeds one row", () => {
    const p0 = gridLayout(0, 9, 3);
    const p3 = gridLayout(3, 9, 3); // first item of the second row
    expect(p3.y).toBeGreaterThan(p0.y);
  });

  it("keeps every coordinate within the 0..1 box", () => {
    for (let i = 0; i < 12; i++) {
      const p = gridLayout(i, 12);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });
});

describe("resolvePortPosition", () => {
  it("prefers a mapped anchor over the computed fallback", () => {
    const pos = resolvePortPosition(anchors, "24", 5, 10, "grid");
    expect(pos).toEqual({ x: 0.7, y: 0.3 });
  });

  it("falls back to linear layout when unmapped", () => {
    const pos = resolvePortPosition(anchors, "unmapped-port", 0, 1, "linear");
    expect(pos).toEqual({ x: 0.5, y: 0.5 });
  });

  it("falls back to grid layout when unmapped and layout='grid'", () => {
    const pos = resolvePortPosition([], "unmapped-port", 0, 1, "grid");
    expect(pos).toEqual({ x: 0.5, y: 0.5 });
  });
});
