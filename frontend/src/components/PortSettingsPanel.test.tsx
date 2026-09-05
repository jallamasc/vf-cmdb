// Phase 4 Task 24 — PortSettingsPanel: edits the port's OWN config fields,
// never touches connected_* (that's the Connect flow's job).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PortSettingsPanel from "./PortSettingsPanel";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn(),
      update: vi.fn(),
    },
  };
});

const iface = {
  id: 5,
  network_device_id: 3,
  port_number: 24,
  description: "uplink to core",
  port_mode: "trunk",
  portgroup: null,
  aggregation_id: null,
  pvid_vlan_id: 1,
  objective: null,
  speed: "10G-SFP",
  admin_status: "up",
  notes: null,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("PortSettingsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pre-fills fields from the interface row", async () => {
    (api.list as any).mockResolvedValue([{ id: 1, vlan_id: 10, name: "mgmt" }]);
    wrap(<PortSettingsPanel iface={iface} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue("uplink to core")).toBeInTheDocument();
    expect(screen.getByDisplayValue("24")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10G-SFP")).toBeInTheDocument();
  });

  it("saves edited fields via api.update, without touching connected_* fields", async () => {
    (api.list as any).mockResolvedValue([]);
    (api.update as any).mockResolvedValue({});
    const onClose = vi.fn();
    wrap(<PortSettingsPanel iface={iface} onClose={onClose} />);

    fireEvent.change(screen.getByDisplayValue("uplink to core"), {
      target: { value: "uplink to spine" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    const [resource, id, patch] = (api.update as any).mock.calls[0];
    expect(resource).toBe("device-interfaces");
    expect(id).toBe(5);
    expect(patch.description).toBe("uplink to spine");
    expect(patch).not.toHaveProperty("connected_device_type");
    expect(patch).not.toHaveProperty("connected_device_id");
    expect(patch).not.toHaveProperty("connected_port");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes without saving on Cancel", () => {
    (api.list as any).mockResolvedValue([]);
    const onClose = vi.fn();
    wrap(<PortSettingsPanel iface={iface} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.update).not.toHaveBeenCalled();
  });
});
