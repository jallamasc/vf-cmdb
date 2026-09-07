import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveDeviceTypeIcon,
  resolveCategoryIcon,
  isRecentlyActive,
  DEVICE_TYPE_ICON_NAMES,
} from "./deviceIcons";
import { render } from "@testing-library/react";
import { createElement } from "react";

describe("resolveDeviceTypeIcon", () => {
  it("resolves every allow-listed name to a distinct icon", () => {
    const resolved = new Set(DEVICE_TYPE_ICON_NAMES.map((n) => resolveDeviceTypeIcon(n)));
    expect(resolved.size).toBe(DEVICE_TYPE_ICON_NAMES.length);
  });

  it("falls back to a generic icon for an unknown/missing name", () => {
    const fallback = resolveDeviceTypeIcon("NotARealIcon");
    expect(fallback).toBe(resolveDeviceTypeIcon(null));
    expect(fallback).toBe(resolveDeviceTypeIcon(undefined));
  });
});

// Phase 6 Task 28 (Req 11.1) — Diagram Fallback Icons.
describe("resolveCategoryIcon", () => {
  it("resolves every known rack_units.device_type category to a real icon", () => {
    const categories = ["server", "switch", "router", "firewall", "pdu", "ups", "patchpanel", "storage", "generic"];
    const resolved = categories.map((c) => resolveCategoryIcon(c));
    resolved.forEach((Icon) => expect(Icon).toBeDefined());
  });

  it("falls back to Box for an unknown/missing category, never HelpCircle", () => {
    const unknown = resolveCategoryIcon("some-unmapped-category");
    const missing = resolveCategoryIcon(null);
    expect(unknown).toBe(missing);
    // The default resolveDeviceTypeIcon fallback (HelpCircle) renders a
    // literal <circle> — unsafe to mix into RackDiagramSVG's back face,
    // which counts <circle> elements as connector dots. Confirm the
    // category fallback is a DIFFERENT component.
    expect(unknown).not.toBe(resolveDeviceTypeIcon("some-unmapped-category"));
  });

  it("never renders a <circle> SVG primitive, for any category (including the fallback)", () => {
    const categories = ["server", "switch", "router", "firewall", "pdu", "ups", "patchpanel", "storage", "generic", "unmapped"];
    categories.forEach((c) => {
      const Icon = resolveCategoryIcon(c);
      const { container } = render(createElement(Icon));
      expect(container.querySelectorAll("circle").length).toBe(0);
    });
  });
});

describe("isRecentlyActive", () => {
  afterEach(() => vi.useRealTimers());

  it("is false when there is no timestamp", () => {
    expect(isRecentlyActive(null)).toBe(false);
    expect(isRecentlyActive(undefined)).toBe(false);
  });

  it("is false for an unparseable timestamp", () => {
    expect(isRecentlyActive("not-a-date")).toBe(false);
  });

  it("is true within the default 24h window and false just outside it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));

    const within = new Date("2026-01-01T06:00:00Z").toISOString(); // 18h ago
    const outside = new Date("2025-12-31T23:00:00Z").toISOString(); // 25h ago

    expect(isRecentlyActive(within)).toBe(true);
    expect(isRecentlyActive(outside)).toBe(false);
  });
});
