// Phase 6 Task 1 (Req 1.1/1.2) — VLANs: site column ordering + site filter.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Vlans from "./Vlans";
import { api } from "../api";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return (
      <div data-testid="entity-grid">
        {props.toolbarExtra}
      </div>
    );
  },
}));

const SITES = [
  { id: 1, simple_name: "hq-bogota-1" },
  { id: 2, simple_name: "hq-medellin-1" },
];

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn((resource: string) =>
        resource === "sites" ? Promise.resolve(SITES) : Promise.resolve([])
      ),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Vlans — site visibility (Req 1.1/1.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
    (api.list as any).mockImplementation((resource: string) =>
      resource === "sites" ? Promise.resolve(SITES) : Promise.resolve([])
    );
  });

  it("puts the Site column right after ID", async () => {
    wrap(<Vlans />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const props = capturedProps[capturedProps.length - 1];
    const fields = props.columns.map((c: any) => c.field);
    expect(fields[0]).toBe("id");
    expect(fields[1]).toBe("site_id");
  });

  it("offers a site filter listing every site", async () => {
    wrap(<Vlans />);
    await waitFor(() => expect(screen.getByLabelText("Filter by site")).toBeTruthy());
    expect(screen.getByText("hq-bogota-1")).toBeTruthy();
    expect(screen.getByText("hq-medellin-1")).toBeTruthy();
  });

  it("scopes the grid via externalFilter once a site is picked", async () => {
    wrap(<Vlans />);
    const select = await screen.findByLabelText("Filter by site");
    fireEvent.change(select, { target: { value: "2" } });
    await waitFor(() => {
      const props = capturedProps[capturedProps.length - 1];
      expect(props.externalFilter).toBeDefined();
      expect(props.externalFilter({ site_id: 2 })).toBe(true);
      expect(props.externalFilter({ site_id: 1 })).toBe(false);
    });
  });

  it("has no externalFilter when 'All sites' is selected", async () => {
    wrap(<Vlans />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const props = capturedProps[capturedProps.length - 1];
    expect(props.externalFilter).toBeUndefined();
  });
});
