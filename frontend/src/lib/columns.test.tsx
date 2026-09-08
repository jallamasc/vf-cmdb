// Phase 5 Task 9 — deviceTypeIconCol: icon resolution + animated active dot.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import {
  deviceTypeIconCol,
  flagCol,
  namingComputedCol,
  generatedCol,
  modeToggleCol,
  lookupLabel,
} from "./columns";

const TYPES = [
  { id: 1, full_name: "24-port switch", abbreviation: "sw24", icon: "Router" },
  { id: 2, full_name: "Unlabeled type", abbreviation: "unl", icon: null },
];

function renderCell(col: ReturnType<typeof deviceTypeIconCol>, value: unknown, data: Record<string, unknown>) {
  const Renderer = col.cellRenderer as (p: any) => JSX.Element;
  return render(<Renderer value={value} data={data} />);
}

describe("deviceTypeIconCol", () => {
  afterEach(() => vi.useRealTimers());

  it("renders an svg icon for a known type", () => {
    const col = deviceTypeIconCol("device_type_id", "", TYPES);
    const { container } = renderCell(col, 1, { device_type_id: 1 });
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the fallback icon when the type has no icon set", () => {
    const col = deviceTypeIconCol("device_type_id", "", TYPES);
    const { container } = renderCell(col, 2, { device_type_id: 2 });
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("shows the animated dot when activeField is recent", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    const col = deviceTypeIconCol("device_type_id", "", TYPES, "last_fact_sync_at");
    const { container } = renderCell(col, 1, {
      device_type_id: 1,
      last_fact_sync_at: new Date("2026-01-01T23:00:00Z").toISOString(),
    });
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("hides the animated dot when activeField is stale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    const col = deviceTypeIconCol("device_type_id", "", TYPES, "last_fact_sync_at");
    const { container } = renderCell(col, 1, {
      device_type_id: 1,
      last_fact_sync_at: new Date("2025-12-01T00:00:00Z").toISOString(),
    });
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });
});

describe("flagCol", () => {
  it("uses a distinct colId from the shared field, so it doesn't collide with a textCol", () => {
    const col = flagCol("country", "🏳");
    expect(col.colId).toBe("country_flag");
    expect(col.field).toBe("country");
  });

  it("reads the country straight off the row by default", () => {
    const col = flagCol("country", "🏳");
    const { container } = renderCell(col, "Colombia", { country: "Colombia" });
    const img = container.querySelector("img");
    expect(img?.getAttribute("title")).toBe("Colombia");
  });

  it("uses resolveCountryName when provided instead of the raw field", () => {
    const col = flagCol("abbreviation", "🏳", () => "Canada");
    const { container } = renderCell(col, "CAN", { abbreviation: "CAN" });
    const img = container.querySelector("img");
    expect(img?.getAttribute("title")).toBe("Canada");
  });
});

describe("namingComputedCol (Phase 5 Task 28, Req 23.1/23.2/23.3)", () => {
  it("is read-only and Phase 6 Task 11 generated-cell-styled on a row in auto mode", () => {
    const col = namingComputedCol("vf_long_name", "VF Long Name");
    const params = { data: { naming_mode: "auto" } } as any;
    expect((col.editable as (p: any) => boolean)(params)).toBe(false);
    expect((col.cellClass as (p: any) => string)(params)).toBe("vf-generated-cell");
  });

  it("is editable and unstyled on a row in manual mode", () => {
    const col = namingComputedCol("vf_long_name", "VF Long Name");
    const params = { data: { naming_mode: "manual" } } as any;
    expect((col.editable as (p: any) => boolean)(params)).toBe(true);
    expect((col.cellClass as (p: any) => string)(params)).toBe("");
  });

  it("defaults to read-only when the row has no naming_mode at all", () => {
    const col = namingComputedCol("vf_long_name", "VF Long Name");
    const params = { data: {} } as any;
    expect((col.editable as (p: any) => boolean)(params)).toBe(false);
  });
});

describe("generatedCol / modeToggleCol (Phase 6 Task 11, Req 5.2)", () => {
  it("generatedCol is always read-only with the amber generated-cell style", () => {
    const col = generatedCol("simple_name", "Site Code", 160);
    expect(col.editable).toBe(false);
    expect(col.cellClass).toBe("vf-generated-cell");
    expect(col.width).toBe(160);
  });

  it("modeToggleCol keeps selectCol's editor but styles the cell distinctly", () => {
    const col = modeToggleCol("site_code_type", "Code Mode", ["auto", "custom", "theme"]);
    expect(col.cellClass).toBe("vf-mode-toggle-cell");
    expect(col.cellEditorParams).toEqual({ values: ["auto", "custom", "theme"] });
  });
});

// Naming-convention modifications (item 10) — FANTASTICNAME-REALNAME in
// dropdown labels wherever a row has a theme/"fantastic" name alongside
// its real generated code.
describe("lookupLabel (naming-convention modifications, item 10)", () => {
  it("shows full_name - abbreviation for a plain lookup dictionary row", () => {
    expect(lookupLabel({ full_name: "Amazon Web Services", abbreviation: "aw" })).toBe(
      "Amazon Web Services - aw"
    );
  });

  it("falls back to simple_name for a Site with no theme name", () => {
    expect(lookupLabel({ simple_name: "vfhmcc1" })).toBe("vfhmcc1");
  });

  it("shows FANTASTICNAME-REALNAME when a theme name is set alongside the real code", () => {
    expect(lookupLabel({ simple_name: "vfhmcc1", theme_name: "Tatooine" })).toBe(
      "Tatooine-vfhmcc1"
    );
  });

  it("works the same for a NetworkDevice's vf_friendly_name + theme_name", () => {
    expect(lookupLabel({ vf_friendly_name: "sw01", theme_name: "Deathstar" })).toBe(
      "Deathstar-sw01"
    );
  });

  it("never duplicates the theme name if it happens to equal the fallback value", () => {
    expect(lookupLabel({ simple_name: "tatooine", theme_name: "tatooine" })).toBe("tatooine");
  });

  it("returns just the id as a string when nothing else is available", () => {
    expect(lookupLabel({ id: 42 })).toBe("42");
  });
});
