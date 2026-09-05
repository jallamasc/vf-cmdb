// FEAT-6 (6C) — ConnectPanel: lists candidates, submits A/B cable.
// Feature: rack-back-and-cabling. Covers Req 8.2/8.3 (grouping), 8.4/8.5 (mapping).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ConnectPanel from "./ConnectPanel";
import { RackPort } from "./RackDiagramSVG";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      portCandidates: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    },
  };
});

const source: RackPort = {
  port_kind: "interface",
  port_id: 1,
  owner_type: "network-devices",
  owner_id: 3,
  label: "eth0",
  port_type: "copper",
  unit_number: 1,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("ConnectPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists candidates and submits A=source / B=destination", async () => {
    (api.portCandidates as any).mockResolvedValue({
      source: { device_type: "network-devices", device_id: 3 },
      scope: "datacenter",
      candidates: [
        {
          port_kind: "interface", port_id: 9, owner_type: "physical-servers",
          owner_id: 4, owner_name: "SRV-B", label: "nic1", port_type: "fiber",
          rack_id: 2, same_rack: false,
        },
      ],
    });
    (api.create as any).mockResolvedValue({ id: 1, label: "x" });

    const onClose = vi.fn();
    wrap(<ConnectPanel source={source} onClose={onClose} />);

    // The candidate appears.
    const btn = await screen.findByText("SRV-B");
    fireEvent.click(btn);

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const [resource, payload] = (api.create as any).mock.calls[0];
    expect(resource).toBe("cables");
    expect(payload.port_a_type).toBe("network-devices");
    expect(payload.port_a_id).toBe(3);
    expect(payload.port_b_type).toBe("physical-servers");
    expect(payload.port_b_id).toBe(4);
    expect(payload.label_a).toBe("eth0");
    expect(payload.label_b).toBe("nic1");
  });

  it("shows an empty state when there are no candidates", async () => {
    (api.portCandidates as any).mockResolvedValue({
      source: {},
      scope: "rack",
      candidates: [],
    });
    wrap(<ConnectPanel source={source} onClose={vi.fn()} />);
    expect(await screen.findByText(/No connectable ports/i)).toBeInTheDocument();
  });

  // Phase 4 Req 20 — edit mode: re-cabling deletes the old cable then
  // creates the new one, and only once a destination is actually picked.
  it("edit mode: shows the 'Edit connection' header and does not delete until a destination is picked", async () => {
    (api.portCandidates as any).mockResolvedValue({
      source: {},
      scope: "rack",
      candidates: [],
    });
    wrap(
      <ConnectPanel
        source={source}
        onClose={vi.fn()}
        editingCable={{ id: 42, cable_type: "fiber" }}
      />
    );
    expect(await screen.findByText("Edit connection")).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("edit mode: deletes the old cable before creating the new one", async () => {
    (api.portCandidates as any).mockResolvedValue({
      source: { device_type: "network-devices", device_id: 3 },
      scope: "datacenter",
      candidates: [
        {
          port_kind: "interface", port_id: 9, owner_type: "physical-servers",
          owner_id: 4, owner_name: "SRV-B", label: "nic1", port_type: "fiber",
          rack_id: 2, same_rack: false,
        },
      ],
    });
    (api.remove as any).mockResolvedValue(null);
    (api.create as any).mockResolvedValue({ id: 2, label: "y" });

    const onClose = vi.fn();
    wrap(
      <ConnectPanel
        source={source}
        onClose={onClose}
        editingCable={{ id: 42, cable_type: "fiber" }}
      />
    );

    const btn = await screen.findByText("SRV-B");
    fireEvent.click(btn);

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.remove).toHaveBeenCalledWith("cables", 42);
    // The removal must be requested before the new cable is created.
    const removeOrder = (api.remove as any).mock.invocationCallOrder[0];
    const createOrder = (api.create as any).mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(createOrder);
  });
});
