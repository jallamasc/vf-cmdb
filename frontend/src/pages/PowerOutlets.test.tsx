// Post-Phase-6 QA (round 3) — PowerOutlet had full generic-CRUD backend
// support (registry.py's "power-outlets" slug) and was already read from
// by RackView/PowerDeviceView, but had no CRUD page anywhere. This covers
// the new page's basic wiring.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PowerOutlets from "./PowerOutlets";
import { api } from "../api";

let capturedProps: any = null;

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps = props;
    return <div data-testid="entity-grid">{props.resource}</div>;
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: { ...actual.api, list: vi.fn().mockResolvedValue([]) },
  };
});

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PowerOutlets />
    </QueryClientProvider>
  );
}

describe("PowerOutlets — new CRUD page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = null;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an EntityGrid over the power-outlets resource", async () => {
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    expect(capturedProps.resource).toBe("power-outlets");
  });

  it("exposes power device, site and rack as editable FK columns", async () => {
    wrap();
    await waitFor(() => expect(capturedProps).not.toBeNull());
    const fields = capturedProps.columns.map((c: any) => c.field);
    expect(fields).toContain("power_device_id");
    expect(fields).toContain("site_id");
    expect(fields).toContain("rack_id");
    expect(fields).toContain("wall_section");
    expect(fields).toContain("port_number");
    expect(fields).toContain("outlet_type");
  });
});
