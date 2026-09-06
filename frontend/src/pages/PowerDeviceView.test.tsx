// Phase 5 Task 7 — graphical views must not render every device in the
// organization by default; the breadcrumb has to reach at least Rack level
// first (Req 5). PowerDeviceView is the representative case; PatchPanelView
// and PortConfigView got the identical fix (same `hasDrillDownSelection`
// pattern) but share the same underlying logic so aren't re-tested here.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PowerDeviceView from "./PowerDeviceView";
import { api } from "../api";

const FIXTURES: Record<string, any[]> = {
  sites: [{ id: 1, simple_name: "Site1" }],
  datacenters: [{ id: 1, site_id: 1, vf_long_name: "DC1" }],
  "datacenter-floors": [{ id: 1, datacenter_id: 1, name: "Floor1" }],
  racks: [{ id: 1, datacenter_floor_id: 1, site_id: 1, vf_long_name: "RACK1" }],
  "power-devices": [{ id: 1, rack_id: 1, device_type_id: null, vf_long_name: "PDU1" }],
  "power-outlets": [],
  "power-device-types": [],
  "stencil-anchors": [],
  cables: [],
  "network-devices": [],
  "physical-servers": [],
  workstations: [],
  "patch-panels": [],
};

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn((resource: string) => Promise.resolve(FIXTURES[resource] ?? [])),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PowerDeviceView — drill-down gating (Req 5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a selection prompt and no diagrams before any rack/device is chosen", async () => {
    wrap(<PowerDeviceView />);

    await waitFor(() =>
      expect(
        screen.getByText(/select a rack.*to view its diagram/i)
      ).toBeTruthy()
    );
    expect(screen.queryByText(/showing \d+ power device/i)).toBeNull();
  });

  it("renders the diagram once a rack is selected", async () => {
    wrap(<PowerDeviceView />);
    await waitFor(() => expect(screen.getByLabelText("Rack")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Rack"), { target: { value: "1" } });

    // The device's resolved breadcrumb location is a single, exact text
    // node, so it's a more robust signal than the "Showing N" count text
    // (which is split across a <span> and adjacent text nodes).
    await waitFor(() =>
      expect(screen.getByText("Site1 / DC1 / Floor1 / RACK1")).toBeTruthy()
    );
    expect(screen.queryByText(/select a rack.*to view its diagram/i)).toBeNull();
  });
});
