// Round 5 QA — Sites.tsx: the "Site Code" column combines the theme name
// with the real code, and a grid-level "🎭 Pick" button gives this page
// the same one-click themed-name entry point NetworkDevices.tsx already
// has (SiteCodePanel's own "Pick a name…" button keeps working too).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sites from "./Sites";

let capturedProps: any[] = [];
let latestPickerProps: any = null;

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return (
      <div data-testid="entity-grid">
        {props.toolbarExtra}
        {props.panel}
      </div>
    );
  },
}));

vi.mock("../components/SiteCodePanel", () => ({
  default: () => <div data-testid="site-code-panel" />,
}));

vi.mock("../components/ThemeNamePicker", () => ({
  default: (props: any) => {
    latestPickerProps = props;
    if (!props.open) return null;
    return (
      <div data-testid="theme-picker">
        <button onClick={() => props.onSelect({ name: "Coruscant", category: "star_wars" })}>
          pick Coruscant
        </button>
      </div>
    );
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...(actual as any).api,
      list: vi.fn(() => Promise.resolve([])),
      update: vi.fn().mockResolvedValue({}),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Sites — Site Code combined display + grid-level theme picker (round 5 QA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
    latestPickerProps = null;
  });

  it("formats the Site Code column as FANTASTICNAME-REALCODE, not just the raw code", async () => {
    wrap(<Sites />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const col = capturedProps[0].columns.find((c: any) => c.field === "simple_name");
    expect(col).toBeTruthy();
    expect(
      (col.valueFormatter as (p: any) => string)({
        data: { simple_name: "vfsite1", theme_name: "Alderaan" },
      })
    ).toBe("Alderaan-vfsite1");
  });

  it("falls back to the raw code when the site has no theme name yet", async () => {
    wrap(<Sites />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const col = capturedProps[0].columns.find((c: any) => c.field === "simple_name");
    expect(
      (col.valueFormatter as (p: any) => string)({ data: { simple_name: "vfsite1" } })
    ).toBe("vfsite1");
  });

  it("opens the themed picker from the grid's own 🎭 Pick button and persists the selection", async () => {
    wrap(<Sites />);
    await waitFor(() => expect(capturedProps.length).toBeGreaterThan(0));
    const col = capturedProps[0].columns.find((c: any) => c.headerName === "Theme");
    expect(col).toBeTruthy();
    const Renderer = col.cellRenderer as (p: any) => JSX.Element;
    render(<Renderer data={{ id: 9, theme_category: "star_wars" }} />);
    fireEvent.click(screen.getByText("🎭 Pick"));
    expect(latestPickerProps.open).toBe(true);

    fireEvent.click(screen.getByText("pick Coruscant"));
    const { api } = await import("../api");
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("sites", 9, {
        theme_name: "Coruscant",
        theme_category: "star_wars",
      })
    );
  });
});
