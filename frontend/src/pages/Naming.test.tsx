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

// `RegionMap` is React.lazy-loaded; keep it out of these tests entirely by
// never switching to the "regions" lookup, so no Suspense boundary needs to
// resolve.

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn(() => Promise.resolve([])),
      stencilUrl: vi.fn((slug: string, face: string) => `/api/v1/stencils/${slug}?face=${face}`),
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
