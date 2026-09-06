import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveDeviceTypeIcon, isRecentlyActive, DEVICE_TYPE_ICON_NAMES } from "./deviceIcons";

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
