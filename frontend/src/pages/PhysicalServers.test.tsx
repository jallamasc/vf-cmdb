// Round 6 QA — "in Physical Servers I can't select a name, just manually
// write it." PhysicalServer now gets a real theme_name column + the same
// "🎭 Pick" catalogue picker every other themed resource has; the old
// `alternative_name` field is relabeled "Alt Name" since it's no longer
// the (mislabeled) stand-in for "Fantastic Name".
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PhysicalServers from "./PhysicalServers";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return <div data-testid="entity-grid">{props.panel}</div>;
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: { ...(actual as any).api, list: vi.fn().mockResolvedValue([]) },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("PhysicalServers — theme_name picker (round 6 QA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("has a real theme_name column plus a 🎭 Pick button column", async () => {
    wrap(<PhysicalServers />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const props = capturedProps[capturedProps.length - 1];
    expect(props.columns.some((c: any) => c.field === "theme_name")).toBe(true);
    expect(props.columns.some((c: any) => c.colId === "theme_pick")).toBe(true);
  });

  it("relabels alternative_name to 'Alt Name', not 'Fantastic Name'", async () => {
    wrap(<PhysicalServers />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const props = capturedProps[capturedProps.length - 1];
    const col = props.columns.find((c: any) => c.field === "alternative_name");
    expect(col.headerName).toBe("Alt Name");
    const themeCol = props.columns.find((c: any) => c.field === "theme_name");
    expect(themeCol.headerName).toBe("Fantastic Name");
  });

  it("combines the theme name into the VF Short Name cell", async () => {
    wrap(<PhysicalServers />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const props = capturedProps[capturedProps.length - 1];
    const col = props.columns.find((c: any) => c.field === "vf_short_name");
    expect(
      (col.valueFormatter as (p: any) => string)({
        data: { vf_short_name: "srv1", theme_name: "Odin" },
      })
    ).toBe("Odin-srv1");
  });
});
