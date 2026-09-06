// Phase 5 Task 4 — Subnets grid config: resource/columns wiring per tab, and
// the two custom cell renderers (utilization bar, next-free-IP button) that
// replace what the old hand-written table rendered inline.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Subnets from "./Subnets";
import { api } from "../api";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return <div data-testid="entity-grid">{props.resource}</div>;
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn(),
      utilization: vi.fn(),
      nextIp: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function headerNames(columns: any[]): string[] {
  return columns.map((c) => c.headerName);
}

describe("Subnets — grid config (Req 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
    (api.list as any).mockResolvedValue([]);
  });

  it("renders an EntityGrid for subnets-ipv4 with utilization/next-IP/gateway columns", async () => {
    wrap(<Subnets />);

    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "subnets-ipv4")).toBe(true)
    );
    const v4Props = capturedProps.find((p) => p.resource === "subnets-ipv4");
    const names = headerNames(v4Props.columns);
    expect(names).toContain("Gateway");
    expect(names).toContain("Expansion Ceiling");
    expect(names).toContain("Utilisation");
    expect(names).toContain("Next Free IP");
    // Req 7 precedent — description stays the first data column.
    expect(names[1]).toBe("Description");
  });

  it("switches to subnets-ipv6 without the v4-only columns", async () => {
    wrap(<Subnets />);
    await waitFor(() => expect(screen.getByText("IPv6")).toBeTruthy());
    fireEvent.click(screen.getByText("IPv6"));

    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "subnets-ipv6")).toBe(true)
    );
    const v6Props = capturedProps.find((p) => p.resource === "subnets-ipv6");
    const names = headerNames(v6Props.columns);
    expect(names).not.toContain("Gateway");
    expect(names).not.toContain("Utilisation");
    expect(names).not.toContain("Next Free IP");
  });

  it("UtilizationCell renders the live utilization bar for a CIDR-bearing row", async () => {
    (api.utilization as any).mockResolvedValue({
      used: 5,
      total_usable: 254,
      utilization_pct: 2,
    });
    wrap(<Subnets />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "subnets-ipv4")).toBe(true)
    );
    const v4Props = capturedProps.find((p) => p.resource === "subnets-ipv4");
    const col = v4Props.columns.find((c: any) => c.headerName === "Utilisation");
    const Renderer = col.cellRenderer;

    wrap(<Renderer data={{ id: 1, network_cidr: "10.0.0.0/24" }} />);
    await waitFor(() => expect(screen.getByText(/5\/254/)).toBeTruthy());
    expect(api.utilization).toHaveBeenCalledWith(1);
  });

  it("UtilizationCell shows 'no CIDR' without calling the API when the row has none", async () => {
    wrap(<Subnets />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "subnets-ipv4")).toBe(true)
    );
    const v4Props = capturedProps.find((p) => p.resource === "subnets-ipv4");
    const col = v4Props.columns.find((c: any) => c.headerName === "Utilisation");
    const Renderer = col.cellRenderer;

    wrap(<Renderer data={{ id: 2, network_cidr: null }} />);
    expect(await screen.findByText("no CIDR")).toBeTruthy();
    expect(api.utilization).not.toHaveBeenCalled();
  });

  it("NextFreeIpCell fetches and displays the next free IP on click", async () => {
    (api.nextIp as any).mockResolvedValue({ next_ip: "10.0.0.5" });
    wrap(<Subnets />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "subnets-ipv4")).toBe(true)
    );
    const v4Props = capturedProps.find((p) => p.resource === "subnets-ipv4");
    const col = v4Props.columns.find((c: any) => c.headerName === "Next Free IP");
    const Renderer = col.cellRenderer;

    wrap(<Renderer data={{ id: 3, network_cidr: "10.0.0.0/24" }} />);
    fireEvent.click(screen.getByText("Next free IP"));

    await waitFor(() => expect(screen.getByText("10.0.0.5")).toBeTruthy());
    expect(api.nextIp).toHaveBeenCalledWith(3);
  });
});
