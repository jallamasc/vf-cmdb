// Phase 5 Task 29 (Req 24.1/24.2) — inline, expandable stencil row-detail on
// the device-type naming grids, replacing the old standalone
// "list every row" stencil panel.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Naming from "./Naming";
import { api } from "../api";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return (
      <div data-testid={`entity-grid-${props.resource}`}>
        {props.resource}
        <button
          data-testid="select-row"
          onClick={() =>
            props.onSelectionChanged?.([{ id: 5, full_name: "Cisco X", abbreviation: "CX" }])
          }
        >
          select row
        </button>
        <button data-testid="clear-selection" onClick={() => props.onSelectionChanged?.([])}>
          clear selection
        </button>
        {props.panel}
      </div>
    );
  },
}));

// `RegionMap` is React.lazy-loaded; most tests below keep it out entirely by
// never switching to the "regions" lookup, so no Suspense boundary needs to
// resolve. The Phase 6 Task 19 tests DO switch to "regions" but mock this
// module shallowly (same idiom as the EntityGrid mock above) rather than
// exercise the real map/world-atlas rendering, which RegionMap.test.tsx
// already covers directly.
let latestRegionMapProps: any = null;
vi.mock("../components/RegionMap", () => ({
  default: (props: any) => {
    latestRegionMapProps = props;
    return <div data-testid="region-map" />;
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn(() => Promise.resolve([])),
      stencilUrl: vi.fn((slug: string, face: string) => `/api/v1/stencils/${slug}?face=${face}`),
      update: vi.fn(),
      syncOsData: vi.fn(),
    },
  };
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Naming />
    </QueryClientProvider>
  );
}

/** Switch the active lookup to a stencil-carrying device-type resource. */
async function selectNetworkDeviceTypes() {
  const btn = await screen.findByText("Network Device Types");
  fireEvent.click(btn);
  await waitFor(() =>
    expect(capturedProps.some((p) => p.resource === "network-device-types")).toBe(true)
  );
}

describe("Naming — inline stencil panel (Req 24.1/24.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("shows no stencil panel for a non-device-type lookup (e.g. the default 'organizations')", async () => {
    wrap();
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "organizations")).toBe(true)
    );
    expect(screen.queryByText(/manage its stencil/)).toBeNull();
  });

  it("prompts to select a row before showing the stencil manager on a device-type grid", async () => {
    wrap();
    await selectNetworkDeviceTypes();
    expect(
      screen.getByText("Select a Network Device Types row below to manage its stencil.")
    ).toBeTruthy();
  });

  it("expands the selected row's stencil + anchor editor via the reused StencilRow component", async () => {
    wrap();
    await selectNetworkDeviceTypes();
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Stencil — Cisco X")).toBeTruthy());
    // StencilRow itself rendered — front/back URL+upload controls, scoped to
    // this one selected row (not a list of every row in the resource).
    expect(screen.getAllByText("front").length).toBeGreaterThan(0);
    expect(screen.getAllByText("back").length).toBeGreaterThan(0);
    expect(screen.getAllByPlaceholderText("https://…/stencil.svg").length).toBe(2);
    expect(screen.getAllByText("Save URL").length).toBe(2);
    expect(screen.getAllByText("Upload SVG").length).toBe(2);
  });

  // Phase 6 Task 37 (Req 13.2) — the hardware-spec panel sits alongside
  // the stencil panel on the same 4 device-type resources.
  it("also shows the hardware-spec panel (with its lookup form) once a device-type row is selected", async () => {
    wrap();
    await selectNetworkDeviceTypes();
    expect(
      screen.getByText("Select a Network Device Types row below to manage its hardware specs.")
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Port Count")).toBeTruthy());
    expect(screen.getByText("PoE Supported")).toBeTruthy();
    expect(screen.getByPlaceholderText("Brand (e.g. APC)")).toBeTruthy();
    expect(screen.getByText("Look up")).toBeTruthy();
  });

  it("clears the panel back to the selection prompt when the selection is cleared", async () => {
    wrap();
    await selectNetworkDeviceTypes();
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Stencil — Cisco X")).toBeTruthy());
    fireEvent.click(screen.getByTestId("clear-selection"));
    await waitFor(() =>
      expect(
        screen.getByText("Select a Network Device Types row below to manage its stencil.")
      ).toBeTruthy()
    );
  });

  it("does not render a stencil panel prop at all for a non-device-type resource", async () => {
    wrap();
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "organizations")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "organizations");
    expect(props.panel).toBeUndefined();
  });
});

describe("Naming — region geo click-to-place (Phase 6 Task 19, Req 7.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
    latestRegionMapProps = null;
  });

  async function selectRegions() {
    const btn = await screen.findByText("Regions");
    fireEvent.click(btn);
    await waitFor(() => expect(capturedProps.some((p) => p.resource === "regions")).toBe(true));
    await waitFor(() => expect(screen.getByTestId("region-map")).toBeTruthy());
  }

  it("does not offer the 'Set location' button before a region row is selected", async () => {
    wrap();
    await selectRegions();
    expect(screen.queryByText(/Set location on map/)).toBeNull();
    expect(latestRegionMapProps.placementMode).toBe(false);
  });

  it("toggles placement mode and calls api.update with the clicked point on placement", async () => {
    (api.update as any).mockResolvedValue({});
    wrap();
    await selectRegions();
    fireEvent.click(screen.getByTestId("select-row"));
    const setLocationBtn = await screen.findByText(/Set location on map for “Cisco X”/);
    fireEvent.click(setLocationBtn);
    await waitFor(() => expect(latestRegionMapProps.placementMode).toBe(true));

    latestRegionMapProps.onPlacePoint(4.71, -74.07);

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("regions", 5, { latitude: 4.71, longitude: -74.07 })
    );
  });
});

// Phase 6 Task 30 (Req 12.1) — manual "Sync now" endoflife.date trigger.
describe("Naming — endoflife.date manual sync (Task 30, Req 12.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("shows no sync button for a non-OS lookup (e.g. the default 'organizations')", async () => {
    wrap();
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "organizations")).toBe(true)
    );
    expect(screen.queryByText(/Sync now/)).toBeNull();
  });

  it("shows the sync button on OS Families and triggers api.syncOsData on click", async () => {
    (api.syncOsData as any).mockResolvedValue({
      families_created: ["Ubuntu"],
      versions_created: ["Ubuntu 24.04", "Ubuntu 22.04"],
      skipped_conflicts: [],
      products_unreachable: [],
    });
    wrap();
    const btn = await screen.findByText("OS Families");
    fireEvent.click(btn);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "os-families")).toBe(true)
    );

    fireEvent.click(screen.getByText("Sync now (endoflife.date)"));
    await waitFor(() => expect(api.syncOsData).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/\+1 family, \+2 versions/)).toBeTruthy();
  });

  it("also shows the sync button on OS Versions", async () => {
    wrap();
    const btn = await screen.findByText("OS Versions");
    fireEvent.click(btn);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "os-versions")).toBe(true)
    );
    expect(screen.getByText("Sync now (endoflife.date)")).toBeTruthy();
  });

  it("surfaces a sync error without crashing", async () => {
    (api.syncOsData as any).mockRejectedValue(new Error("502: endoflife.date unreachable"));
    wrap();
    const btn = await screen.findByText("OS Families");
    fireEvent.click(btn);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "os-families")).toBe(true)
    );

    fireEvent.click(screen.getByText("Sync now (endoflife.date)"));
    expect(await screen.findByText(/endoflife.date unreachable/)).toBeTruthy();
  });
});
