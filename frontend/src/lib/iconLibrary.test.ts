import { describe, it, expect } from "vitest";
import { resolveIcon, ICON_LIBRARY_NAMES, ICON_LIBRARY } from "./iconLibrary";

describe("iconLibrary", () => {
  it("resolves every catalogued name to a distinct component", () => {
    const resolved = new Set(ICON_LIBRARY_NAMES.map((n) => resolveIcon(n)));
    expect(resolved.size).toBe(ICON_LIBRARY_NAMES.length);
  });

  it("every catalogued name has a real entry in ICON_LIBRARY", () => {
    for (const name of ICON_LIBRARY_NAMES) {
      expect(ICON_LIBRARY[name]).toBeTruthy();
    }
  });

  it("falls back to the generic icon for an unknown/missing name", () => {
    const fallback = resolveIcon("NotARealIcon");
    expect(fallback).toBe(resolveIcon(null));
    expect(fallback).toBe(resolveIcon(undefined));
  });
});
