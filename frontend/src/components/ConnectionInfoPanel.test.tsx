// Phase 4 Req 20 — ConnectionInfoPanel: view / remove / jump-to-far-end.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ConnectionInfoPanel from "./ConnectionInfoPanel";
import { RackPort } from "./RackDiagramSVG";
import { ConnectionResolution } from "../lib/connections";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      remove: vi.fn(),
    },
  };
});

const source: RackPort = {
  port_kind: "interface",
  port_id: 1,
  owner_type: "network-devices",
  owner_id: 3,
  label: "e0",
  port_type: "copper",
  unit_number: 1,
};

const resolution: ConnectionResolution = {
  connected: true,
  cable: { id: 42, cable_type: "copper", label: "SW3-e0→SRV4-nic1" },
  farEnd: { type: "physical-servers", id: 4, label: "nic1" },
  ownLabel: "e0",
  farLabel: "nic1",
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ConnectionInfoPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the far end owner + label", () => {
    wrap(
      <ConnectionInfoPanel
        source={source}
        resolution={resolution}
        farEndOwnerName="SRV-4"
        farEndRackId={7}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByText("SRV-4")).toBeInTheDocument();
    expect(screen.getAllByText(/nic1/).length).toBeGreaterThan(0);
  });

  it("renders a jump-to-far-end link with the far end's rack deep link", () => {
    wrap(
      <ConnectionInfoPanel
        source={source}
        resolution={resolution}
        farEndOwnerName="SRV-4"
        farEndRackId={7}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    const link = screen.getByText(/Jump to far end/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/racks?rackId=7");
  });

  it("routes the jump link to the patch panel view when the far end is a patch-panel port", () => {
    const panelResolution: ConnectionResolution = {
      ...resolution,
      farEnd: { type: "patch-panels", id: 12, label: "P3" },
    };
    wrap(
      <ConnectionInfoPanel
        source={source}
        resolution={panelResolution}
        farEndOwnerName="PP-A"
        farEndRackId={7} // even if a rack id resolves, the panel route wins
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    const link = screen.getByText(/Jump to far end/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/patch-panel-view?panelId=12");
  });

  it("routes the jump link to the power device view when the far end is a power outlet's device", () => {
    const powerResolution: ConnectionResolution = {
      ...resolution,
      farEnd: { type: "power-devices", id: 9, label: "outlet 3" },
    };
    wrap(
      <ConnectionInfoPanel
        source={source}
        resolution={powerResolution}
        farEndOwnerName="PDU-A"
        farEndRackId={7}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    const link = screen.getByText(/Jump to far end/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/power-device-view?deviceId=9");
  });

  it("routes the jump link to the port config view when the far end is a network device's interface", () => {
    const ndResolution: ConnectionResolution = {
      ...resolution,
      farEnd: { type: "network-devices", id: 3, label: "eth0" },
    };
    wrap(
      <ConnectionInfoPanel
        source={source}
        resolution={ndResolution}
        farEndOwnerName="SW-CORE-01"
        farEndRackId={7}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    const link = screen.getByText(/Jump to far end/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/port-config-view?deviceId=3");
  });

  it("omits the jump link when the far end's rack is unknown", () => {
    wrap(
      <ConnectionInfoPanel
        source={source}
        resolution={resolution}
        farEndOwnerName="SRV-4"
        farEndRackId={null}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByText(/Jump to far end/i)).not.toBeInTheDocument();
  });

  it("removes the cable and closes on 'Remove connection'", async () => {
    (api.remove as any).mockResolvedValue(null);
    const onClose = vi.fn();
    wrap(
      <ConnectionInfoPanel
        source={source}
        resolution={resolution}
        farEndOwnerName="SRV-4"
        farEndRackId={7}
        onClose={onClose}
        onEdit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Remove connection"));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("cables", 42));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("calls onEdit when 'Edit' is clicked", () => {
    const onEdit = vi.fn();
    wrap(
      <ConnectionInfoPanel
        source={source}
        resolution={resolution}
        farEndOwnerName="SRV-4"
        farEndRackId={7}
        onClose={vi.fn()}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByText("Edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
