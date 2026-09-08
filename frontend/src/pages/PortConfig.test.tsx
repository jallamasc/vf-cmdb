// Post-Phase-6 QA (round 3) — "The device port config should be grouped by
// Device, this is a very unmanageable list." Covers the device filter
// dropdown + default sort added to make the flat ports grid manageable
// (AG Grid Community has no row-grouping feature, so this mirrors
// Vlans.tsx's "filter by site" idiom instead).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PortConfig from "./PortConfig";
import { api } from "../api";

let capturedProps: any = null;

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps = props;
    return <div data-testid="entity-grid">{props.toolbarExtra}</div>;
  },
}));

const DEVICES = [
  { id: 1, vf_friendly_name: "sw01" },
  { id: 2, vf_friendly_name: "sw02" },
];

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn((resource: string) =>
        resource === "network-devices" ? Promise.resolve(DEVICES) : Promise.resolve([])
      ),
      create: vi.fn(),
    },
  };
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PortConfig />
    </QueryClientProvider>
  );
}

describe("PortConfig — device grouping (filter + default sort)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = null;
    (api.list as any).mockImplementation((resource: string) =>
      resource === "network-devices" ? Promise.resolve(DEVICES) : Promise.resolve([])
    );
  });

  it("sorts the Device column by default so ports cluster per device", async () => {
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    const deviceCol = capturedProps.columns.find((c: any) => c.field === "network_device_id");
    expect(deviceCol.sort).toBe("asc");
  });

  it("offers a device filter listing every network device", async () => {
    wrap();
    await waitFor(() => expect(screen.getByLabelText("Filter by device")).toBeTruthy());
    expect(screen.getByText("sw01")).toBeTruthy();
    expect(screen.getByText("sw02")).toBeTruthy();
  });

  it("scopes the grid via externalFilter once a device is picked", async () => {
    wrap();
    const select = await screen.findByLabelText("Filter by device");
    fireEvent.change(select, { target: { value: "2" } });
    await waitFor(() => {
      expect(capturedProps.externalFilter).toBeDefined();
      expect(capturedProps.externalFilter({ network_device_id: 2 })).toBe(true);
      expect(capturedProps.externalFilter({ network_device_id: 1 })).toBe(false);
    });
  });

  it("has no externalFilter when 'All devices' is selected", async () => {
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    expect(capturedProps.externalFilter).toBeUndefined();
  });

  it("pre-fills a new row's device from the active filter", async () => {
    wrap();
    const select = await screen.findByLabelText("Filter by device");
    fireEvent.change(select, { target: { value: "2" } });
    await waitFor(() => expect(capturedProps.externalFilter).toBeDefined());
    const defaults = capturedProps.newRowDefaults();
    expect(defaults.network_device_id).toBe(2);
  });
});

// Post-Phase-6 QA (round 3) — "the devices should have a section to add
// the number of ports" (bulk port creation).
describe("PortConfig — bulk port generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = null;
    (api.list as any).mockImplementation((resource: string) =>
      resource === "network-devices" ? Promise.resolve(DEVICES) : Promise.resolve([])
    );
  });

  it("opens the generator form and pre-fills the device from the active filter", async () => {
    wrap();
    const filterSelect = await screen.findByLabelText("Filter by device");
    fireEvent.change(filterSelect, { target: { value: "1" } });
    fireEvent.click(await screen.findByText("+ Generate ports"));
    const deviceSelect = screen.getByDisplayValue("sw01");
    expect(deviceSelect).toBeTruthy();
  });

  it("creates one interface per port in the requested range, in order", async () => {
    (api.create as any).mockResolvedValue({});
    wrap();
    fireEvent.click(await screen.findByText("+ Generate ports"));
    fireEvent.change(screen.getByDisplayValue("— select device —"), { target: { value: "1" } });
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "5" } });
    fireEvent.change(screen.getByDisplayValue("24"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Generate"));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(3));
    expect(api.create).toHaveBeenNthCalledWith(1, "device-interfaces", {
      network_device_id: 1,
      port_number: 5,
      port_mode: "access",
      admin_status: "up",
    });
    expect(api.create).toHaveBeenNthCalledWith(3, "device-interfaces", {
      network_device_id: 1,
      port_number: 7,
      port_mode: "access",
      admin_status: "up",
    });
    expect(await screen.findByText("Created 3 port(s).")).toBeTruthy();
  });

  it("disables Generate until a device is picked", async () => {
    wrap();
    fireEvent.click(await screen.findByText("+ Generate ports"));
    const generateBtn = screen.getByText("Generate") as HTMLButtonElement;
    expect(generateBtn.disabled).toBe(true);
  });
});
