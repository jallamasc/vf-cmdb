// Phase 5 Task 26/27 — RackView must resolve a rack's floor/breadcrumb via
// Room or Section when it has no direct datacenter_floor_id (Req 21.1/22.1).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RackView from "./RackView";

const FIXTURES: Record<string, any[]> = {
  sites: [{ id: 1, simple_name: "Site1" }],
  datacenters: [{ id: 1, site_id: 1, vf_long_name: "DC1" }],
  "datacenter-floors": [{ id: 1, datacenter_id: 1, name: "Floor1" }],
  rooms: [{ id: 1, datacenter_floor_id: 1, name: "Room1" }],
  sections: [{ id: 1, room_id: 1, name: "Section1" }],
  racks: [
    // Direct floor placement (the pre-existing case).
    { id: 1, datacenter_floor_id: 1, site_id: 1, vf_long_name: "RACK-FLOOR", total_units: 42 },
    // Room placement, no direct floor — must resolve via Room -> Floor.
    { id: 2, room_id: 1, vf_long_name: "RACK-ROOM", total_units: 42 },
    // Section placement, no direct floor/room — must resolve via
    // Section -> Room -> Floor.
    { id: 3, section_id: 1, vf_long_name: "RACK-SECTION", total_units: 42 },
  ],
  "rack-units": [],
  "device-interfaces": [],
  "power-outlets": [],
  "network-devices": [],
  "physical-servers": [],
  workstations: [],
  "power-devices": [],
  "network-device-types": [],
  "compute-device-types": [],
  "power-device-types": [],
  cables: [],
  "generic-entities": [],
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

describe("RackView — Room/Section-aware breadcrumb resolution (Req 21.1/22.1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the full Site/DC/Floor breadcrumb for a room-parented rack", async () => {
    wrap(<RackView />);
    // Each rack's name appears twice (the breadcrumb <option> + the card
    // title) — use getAllByText and require at least one match.
    await waitFor(() => expect(screen.getAllByText("RACK-ROOM").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Site1 / DC1 / Floor1").length).toBeGreaterThan(0);
  });

  it("resolves the full Site/DC/Floor breadcrumb for a section-parented rack", async () => {
    wrap(<RackView />);
    await waitFor(() => expect(screen.getAllByText("RACK-SECTION").length).toBeGreaterThan(0));
    // getAllByText since the direct-floor rack shares the identical string.
    expect(screen.getAllByText("Site1 / DC1 / Floor1").length).toBeGreaterThan(0);
  });

  it("still resolves a directly floor-parented rack (no regression)", async () => {
    wrap(<RackView />);
    await waitFor(() => expect(screen.getAllByText("RACK-FLOOR").length).toBeGreaterThan(0));
    // 3 racks x 1 card each = 3 breadcrumb strings (options aren't the
    // location breadcrumb text, just the rack's own name).
    expect(screen.getAllByText("Site1 / DC1 / Floor1").length).toBe(3);
  });
});
