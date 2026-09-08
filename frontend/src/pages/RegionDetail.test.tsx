// Naming-convention modifications (item 4) — a dedicated per-region detail
// page, reached by clicking "View details →" in the Regions grid.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RegionDetail from "./RegionDetail";
import { api } from "../api";

let capturedGridProps: any = null;
vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedGridProps = props;
    return <div data-testid="entity-grid">{props.resource}</div>;
  },
}));

vi.mock("../components/RegionMap", () => ({
  default: (props: any) => <div data-testid="region-map">{props.focusedRegionId}</div>,
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(),
      list: vi.fn(() => Promise.resolve([])),
    },
  };
});

function wrap(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/regions/${id}`]}>
        <Routes>
          <Route path="/regions/:id" element={<RegionDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RegionDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedGridProps = null;
  });

  it("shows a not-found message for a missing region", async () => {
    (api.get as any).mockResolvedValue(null);
    wrap("999");
    expect(await screen.findByText(/not found/)).toBeTruthy();
  });

  it("renders the region's overview fields", async () => {
    (api.get as any).mockResolvedValue({
      id: 5,
      full_name: "Región Andina",
      abbreviation: "CO-AND",
      description: "Andean interior",
      max_length: 6,
      latitude: 6.2,
      longitude: -75.4,
    });
    wrap("5");
    expect((await screen.findAllByText("Región Andina")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("CO-AND").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Andean interior/).length).toBeGreaterThan(0);
  });

  it("shows the theme name alongside the full name when set", async () => {
    (api.get as any).mockResolvedValue({
      id: 5,
      full_name: "Región Andina",
      abbreviation: "CO-AND",
      theme_name: "Tatooine",
    });
    wrap("5");
    expect(await screen.findByText("Tatooine — Región Andina")).toBeTruthy();
  });

  it("renders the map when coordinates are set", async () => {
    (api.get as any).mockResolvedValue({
      id: 5,
      full_name: "X",
      abbreviation: "x",
      latitude: 1,
      longitude: 2,
    });
    wrap("5");
    expect(await screen.findByTestId("region-map")).toBeTruthy();
  });

  it("shows a hint instead of the map when no coordinates are set", async () => {
    (api.get as any).mockResolvedValue({ id: 5, full_name: "X", abbreviation: "x" });
    wrap("5");
    expect(await screen.findByText(/No coordinates set yet/)).toBeTruthy();
  });

  it("filters the Sites grid to this region's id", async () => {
    (api.get as any).mockResolvedValue({ id: 5, full_name: "X", abbreviation: "x" });
    wrap("5");
    await waitFor(() => expect(capturedGridProps).toBeTruthy());
    expect(capturedGridProps.resource).toBe("sites");
    expect(capturedGridProps.externalFilter({ region_id: 5 })).toBe(true);
    expect(capturedGridProps.externalFilter({ region_id: 6 })).toBe(false);
    expect(capturedGridProps.allowAdd).toBe(false);
    expect(capturedGridProps.allowDelete).toBe(false);
  });
});
