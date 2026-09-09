// Phase 5 Task 23 — SimpleGridPage: photo manager panel only where the
// underlying model actually has a photo_url column (Req 19.1).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SimpleGridPage from "./SimpleGridPage";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return (
      <div data-testid={`entity-grid-${props.resource}`}>
        <button
          data-testid="select-row"
          onClick={() => props.onSelectionChanged?.([{ id: 1, photo_url: null }])}
        >
          select row
        </button>
        {props.panel}
      </div>
    );
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: { ...actual.api, list: vi.fn().mockResolvedValue([]) },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SimpleGridPage — photo manager panel (Req 19.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("shows a photo manager AND a stencil panel for patch-panels (photoPanel+stencilPanel: true)", async () => {
    wrap(<SimpleGridPage kind="patch-panels" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "patch-panels")).toBe(true)
    );
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Upload photo")).toBeTruthy());
    expect(screen.getByText(/Stencil — #1/)).toBeTruthy();
  });

  it("shows a photo manager AND a stencil panel for power devices (photoPanel+stencilPanel: true)", async () => {
    wrap(<SimpleGridPage kind="power" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "power-devices")).toBe(true)
    );
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Upload photo")).toBeTruthy());
    expect(screen.getByText(/Stencil — #1/)).toBeTruthy();
  });

  it("shows no panel at all for cables (neither photoPanel nor stencilPanel — Cable isn't a stencil-rendered device)", async () => {
    wrap(<SimpleGridPage kind="cables" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "cables")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "cables");
    expect(props.panel).toBeUndefined();
    expect(props.onSelectionChanged).toBeUndefined();
  });

  // Phase 6 Task 27 (Req 10.2-10.4) — Rack now has its own stencil_url
  // (Task 26), even though it still has no photo_url column.
  it("shows a stencil panel but no photo manager for racks (stencilPanel only)", async () => {
    wrap(<SimpleGridPage kind="racks" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "racks")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "racks");
    expect(props.panel).toBeDefined();
    fireEvent.click(screen.getByTestId("select-row"));
    expect(screen.getByText(/Stencil — #1/)).toBeTruthy();
    expect(screen.queryByText("Upload photo")).toBeNull();
  });
});

// Round 6 QA — "check that every field ... has a fantastic name with a
// totally enabled dropdown". racks/power/patch-panels each get a real
// theme_name column + the "🎭 Pick" picker column; cables deliberately
// don't (Cable.label is fully computed, not a themed physical asset).
describe("SimpleGridPage — theme_name picker (round 6 QA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it.each(["racks", "power", "patch-panels"] as const)(
    "gives %s a theme_name text column plus a 🎭 Pick button column",
    async (kind) => {
      wrap(<SimpleGridPage kind={kind} />);
      await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
      const props = capturedProps[capturedProps.length - 1];
      expect(props.columns.some((c: any) => c.field === "theme_name")).toBe(true);
      expect(props.columns.some((c: any) => c.colId === "theme_pick")).toBe(true);
    }
  );

  it("does NOT give cables a theme_name column or picker (Cable.label is fully computed)", async () => {
    wrap(<SimpleGridPage kind="cables" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "cables")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "cables");
    expect(props.columns.some((c: any) => c.field === "theme_name")).toBe(false);
    expect(props.columns.some((c: any) => c.colId === "theme_pick")).toBe(false);
  });

  it("combines the theme name into rack's Simple Name cell", async () => {
    wrap(<SimpleGridPage kind="racks" />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const props = capturedProps[capturedProps.length - 1];
    const col = props.columns.find((c: any) => c.field === "simple_name");
    expect(
      (col.valueFormatter as (p: any) => string)({
        data: { simple_name: "vfrack1", theme_name: "Kilimanjaro" },
      })
    ).toBe("Kilimanjaro-vfrack1");
  });
});
