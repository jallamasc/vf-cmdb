// FEAT-6 (6C) — CablesViewer filtering.
// Feature: rack-back-and-cabling. Covers Req 10.2 (rack filter), 10.3 (device), 10.4 (all).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CablesViewer from "./CablesViewer";
import { api } from "../api";

// Capture what EntityGrid receives, and expose the resolved dataSource rows.
let lastRows: any[] = [];
vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    // Resolve the (already-filtered) rows the page feeds the grid.
    Promise.resolve(props.dataSource.fetch()).then((r: any) => (lastRows = r));
    return (
      <div data-testid="grid">
        {props.toolbarExtra}
        <span data-testid="count">{`rows:${(props.dataSource.queryKey || []).join(",")}`}</span>
      </div>
    );
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return { ...actual, api: { ...actual.api, list: vi.fn() } };
});

const cables = [
  { id: 1, port_a_type: "network-devices", port_a_id: 3, port_b_type: "physical-servers", port_b_id: 4, label: "A" },
  { id: 2, port_a_type: "network-devices", port_a_id: 5, port_b_type: "physical-servers", port_b_id: 6, label: "B" },
];
const racks = [{ id: 1, code: "AA01" }, { id: 2, code: "BB01" }];
const netDevices = [{ id: 3, rack_id: 1 }, { id: 5, rack_id: 2 }];
const servers = [{ id: 4, rack_id: 1 }, { id: 6, rack_id: 2 }];

function listImpl(resource: string) {
  if (resource === "cables") return Promise.resolve(cables);
  if (resource === "racks") return Promise.resolve(racks);
  if (resource === "network-devices") return Promise.resolve(netDevices);
  if (resource === "physical-servers") return Promise.resolve(servers);
  return Promise.resolve([]);
}

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CablesViewer />
    </QueryClientProvider>
  );
}

describe("CablesViewer", () => {
  beforeEach(() => {
    lastRows = [];
    (api.list as any).mockImplementation(listImpl);
  });

  it("shows all cables with no filter", async () => {
    wrap();
    await waitFor(() => expect(lastRows.length).toBe(2));
  });

  it("filters by rack (either end in the rack)", async () => {
    wrap();
    // Wait for owner data to load so rack resolution works.
    await waitFor(() => expect(lastRows.length).toBe(2));
    const rackSelect = screen.getByRole("combobox", { name: /rack/i }) as HTMLSelectElement
      ?? (screen.getAllByRole("combobox")[0] as HTMLSelectElement);
    fireEvent.change(rackSelect, { target: { value: "2" } });
    await waitFor(() => {
      // Only cable 2 has an end (dev 5 / srv 6) in rack 2.
      expect(lastRows.map((r) => r.id)).toEqual([2]);
    });
  });
});
