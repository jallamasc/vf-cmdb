// Post-Phase-6 QA (round 3) — "IP assignments are completely manual... I
// should see all available IPs on a dropdown from IPv4 and IPv6." Covers
// the "Suggest next free IP" panel that appears once a row is selected.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import IpAssignments from "./IpAssignments";
import { api } from "../api";

let capturedProps: any = null;

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps = props;
    return (
      <div data-testid="entity-grid">
        <button
          data-testid="select-row"
          onClick={() =>
            props.onSelectionChanged?.([
              { id: 5, subnet_ipv4_id: 1, subnet_ipv6_id: 2, ipv4_address: null, ipv6_address: null },
            ])
          }
        >
          select row
        </button>
        <button data-testid="select-row-no-subnets" onClick={() => props.onSelectionChanged?.([{ id: 6 }])}>
          select row without subnets
        </button>
        <button data-testid="clear-selection" onClick={() => props.onSelectionChanged?.([])}>
          clear selection
        </button>
        {props.panel}
      </div>
    );
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn(() => Promise.resolve([])),
      nextIp: vi.fn(),
      nextReserved: vi.fn(),
      update: vi.fn(),
    },
  };
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IpAssignments />
    </QueryClientProvider>
  );
}

describe("IpAssignments — suggest next free IP panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = null;
  });

  it("prompts to select a row before offering any suggestion", async () => {
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    expect(screen.getByText(/Select a row below to suggest/)).toBeTruthy();
  });

  it("shows both suggest buttons once a row is selected", async () => {
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    fireEvent.click(screen.getByTestId("select-row"));
    expect(await screen.findByText("Suggest next free IPv4")).toBeTruthy();
    expect(screen.getByText("Suggest next free IPv6")).toBeTruthy();
  });

  it("disables both buttons when the row has no subnet picked yet", async () => {
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    fireEvent.click(screen.getByTestId("select-row-no-subnets"));
    const v4 = await screen.findByText("Suggest next free IPv4");
    const v6 = screen.getByText("Suggest next free IPv6");
    expect((v4 as HTMLButtonElement).disabled).toBe(true);
    expect((v6 as HTMLButtonElement).disabled).toBe(true);
  });

  it("suggests + applies the next free IPv4 for the row's chosen subnet", async () => {
    (api.nextIp as any).mockResolvedValue({ next_ip: "10.0.0.5" });
    (api.update as any).mockResolvedValue({});
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    fireEvent.click(screen.getByTestId("select-row"));
    fireEvent.click(await screen.findByText("Suggest next free IPv4"));

    await waitFor(() => expect(api.nextIp).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("ip-assignments", 5, { ipv4_address: "10.0.0.5" })
    );
    expect(await screen.findByText("IPv4 set to 10.0.0.5.")).toBeTruthy();
  });

  it("suggests + applies the next free IPv6 for the row's chosen subnet", async () => {
    (api.nextReserved as any).mockResolvedValue({ ip: "2001:db8::5" });
    (api.update as any).mockResolvedValue({});
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    fireEvent.click(screen.getByTestId("select-row"));
    fireEvent.click(await screen.findByText("Suggest next free IPv6"));

    await waitFor(() => expect(api.nextReserved).toHaveBeenCalledWith(2, "ipv6"));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("ip-assignments", 5, { ipv6_address: "2001:db8::5" })
    );
    expect(await screen.findByText("IPv6 set to 2001:db8::5.")).toBeTruthy();
  });

  it("surfaces an error (e.g. subnet exhausted) without crashing", async () => {
    (api.nextIp as any).mockRejectedValue(new Error("409: No free IP available in subnet"));
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    fireEvent.click(screen.getByTestId("select-row"));
    fireEvent.click(await screen.findByText("Suggest next free IPv4"));
    expect(await screen.findByText(/No free IP available/)).toBeTruthy();
  });

  it("clears the panel back to the prompt when the selection is cleared", async () => {
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Suggest next free IPv4")).toBeTruthy());
    fireEvent.click(screen.getByTestId("clear-selection"));
    await waitFor(() => expect(screen.getByText(/Select a row below to suggest/)).toBeTruthy());
  });
});
