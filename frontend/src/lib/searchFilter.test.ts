// Phase 4 Task 6 — per-section fuzzy search integration behavior, isolated
// from AG Grid: EntityGrid wires `doesExternalFilterPass` to
// `fuzzyMatchesAny(search, Object.values(row))`. This test exercises that
// exact composition against representative row shapes.
import { describe, it, expect } from "vitest";
import { fuzzyMatchesAny } from "./fuzzy";

const rows = [
  { id: 1, name: "Core Switch", zone: "management" },
  { id: 2, name: "Edge Router", zone: "dmz" },
  { id: 3, name: "Backup Firewall", zone: "dmz" },
];

function filterRows(query: string) {
  return rows.filter((r) => fuzzyMatchesAny(query, Object.values(r)));
}

describe("EntityGrid per-section fuzzy search composition", () => {
  it("shows all rows for an empty query", () => {
    expect(filterRows("")).toHaveLength(3);
  });

  it("narrows to rows matching any column fuzzily", () => {
    const result = filterRows("core sw");
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("matches on a non-name column too (e.g. zone)", () => {
    const result = filterRows("dmz");
    expect(result.map((r) => r.id).sort()).toEqual([2, 3]);
  });

  it("returns no rows when nothing matches", () => {
    expect(filterRows("zzzzz-nomatch")).toHaveLength(0);
  });
});
