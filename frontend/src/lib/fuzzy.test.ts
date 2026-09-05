import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzyFilter, fuzzyMatchesAny } from "./fuzzy";

describe("fuzzyScore", () => {
  it("matches an empty query against anything with score 0", () => {
    expect(fuzzyScore("", "Switch")).toBe(0);
  });

  it("matches a subsequence in order", () => {
    expect(fuzzyScore("swi", "Switch")).not.toBeNull();
    expect(fuzzyScore("sch", "Switch")).not.toBeNull(); // s-w-i-t-c-h subsequence
  });

  it("does not match out-of-order characters", () => {
    expect(fuzzyScore("wsi", "Switch")).toBeNull();
  });

  it("is case and accent insensitive", () => {
    expect(fuzzyScore("BOGOTA", "Bogotá")).not.toBeNull();
  });

  it("ranks a tighter/contiguous match better (lower score) than a spread-out one", () => {
    const tight = fuzzyScore("swi", "Switch");
    const spread = fuzzyScore("swi", "Firewall Switch Interface");
    expect(tight).not.toBeNull();
    expect(spread).not.toBeNull();
    expect((tight as number) < (spread as number)).toBe(true);
  });
});

describe("fuzzyFilter", () => {
  const items = ["Switch", "Router", "Firewall", "Storage Array"];

  it("returns only matching items, best first", () => {
    const result = fuzzyFilter("rt", items, (x) => x);
    expect(result.map((r) => r.item)).toContain("Router");
    expect(result.every((r) => items.includes(r.item))).toBe(true);
  });

  it("returns everything for an empty query", () => {
    const result = fuzzyFilter("", items, (x) => x);
    expect(result.length).toBe(items.length);
  });

  it("returns nothing when no item matches", () => {
    const result = fuzzyFilter("zzzqqq", items, (x) => x);
    expect(result.length).toBe(0);
  });
});

describe("fuzzyMatchesAny", () => {
  it("matches when at least one value matches", () => {
    expect(fuzzyMatchesAny("swi", ["id-1", "Switch", null])).toBe(true);
  });

  it("does not match when no value matches", () => {
    expect(fuzzyMatchesAny("zzzqqq", ["id-1", "Switch"])).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(fuzzyMatchesAny("", ["anything"])).toBe(true);
  });
});
