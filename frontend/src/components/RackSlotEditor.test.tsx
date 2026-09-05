// Phase 4 Task 18 — RackSlotEditor: add / edit / remove equipment flows.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RackSlotEditor from "./RackSlotEditor";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("RackSlotEditor — empty slot (add equipment)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new device and places it in the rack + rack_units", async () => {
    (api.list as any).mockResolvedValue([]);
    (api.create as any)
      .mockResolvedValueOnce({ id: 42 }) // the new network device
      .mockResolvedValueOnce({ id: 100 }); // the rack_units row
    (api.update as any).mockResolvedValue({});

    const onClose = vi.fn();
    wrap(<RackSlotEditor rackId={1} unitNumber={12} unit={null} onClose={onClose} />);

    fireEvent.click(screen.getByText("Place in rack"));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    expect((api.create as any).mock.calls[0][0]).toBe("network-devices");
    expect((api.update as any).mock.calls[0]).toEqual([
      "network-devices",
      42,
      { rack_id: 1, rack_unit: 12 },
    ]);
    const [resource, payload] = (api.create as any).mock.calls[1];
    expect(resource).toBe("rack-units");
    expect(payload).toMatchObject({
      rack_id: 1,
      unit_number: 12,
      device_id: 42,
      device_table: "network-devices",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("places an existing unplaced device instead of creating one", async () => {
    (api.list as any).mockResolvedValue([{ id: 7, rack_id: null, vf_long_name: "SRV-7" }]);
    (api.create as any).mockResolvedValue({ id: 900 });
    (api.update as any).mockResolvedValue({});

    wrap(<RackSlotEditor rackId={1} unitNumber={5} unit={null} onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/Assign existing/i));
    await screen.findByText("SRV-7");
    fireEvent.change(screen.getByRole("combobox", { name: "" }) || screen.getAllByRole("combobox")[1], {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByText("Place in rack"));

    await waitFor(() => expect(api.update).toHaveBeenCalledWith(
      "network-devices",
      7,
      { rack_id: 1, rack_unit: 5 }
    ));
    // Only the rack_units row is created — no new device row.
    expect(api.create).toHaveBeenCalledTimes(1);
    expect((api.create as any).mock.calls[0][0]).toBe("rack-units");
  });
});

describe("RackSlotEditor — occupied slot (edit / remove)", () => {
  beforeEach(() => vi.clearAllMocks());

  const unit = {
    id: 55,
    rack_id: 1,
    unit_number: 12,
    device_type: "server",
    device_id: 42,
    device_table: "physical-servers",
    label: "SRV-A",
    height_units: 1,
  };

  it("saves an edited label and height", async () => {
    (api.update as any).mockResolvedValue({});
    const onClose = vi.fn();
    wrap(<RackSlotEditor rackId={1} unitNumber={12} unit={unit} onClose={onClose} />);

    fireEvent.change(screen.getByDisplayValue("SRV-A"), { target: { value: "SRV-A-renamed" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("rack-units", 55, {
        label: "SRV-A-renamed",
        height_units: 1,
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("removes the device from the rack, clearing both the device and the rack_units row", async () => {
    (api.update as any).mockResolvedValue({});
    (api.remove as any).mockResolvedValue(null);
    const onClose = vi.fn();
    wrap(<RackSlotEditor rackId={1} unitNumber={12} unit={unit} onClose={onClose} />);

    fireEvent.click(screen.getByText("Remove from rack"));
    fireEvent.click(screen.getByText("Yes, remove"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("physical-servers", 42, {
        rack_id: null,
        rack_unit: null,
      })
    );
    expect(api.remove).toHaveBeenCalledWith("rack-units", 55);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
