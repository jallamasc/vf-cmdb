// Phase 5 Task 23 — SimpleGridPage: photo manager panel only where the
// underlying model actually has a photo_url column (Req 19.1).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SimpleGridPage from "./SimpleGridPage";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return (
      <div data-testid={`entity-grid-${props.resource}`}>
        <button
          data-testid="select-row"
          onClick={() => props.onSelectionChanged?.([{ id: 1, photo_url: null }])}
        >
          select row
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
    api: { ...actual.api, list: vi.fn().mockResolvedValue([]) },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SimpleGridPage — photo manager panel (Req 19.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("shows a photo manager for patch-panels (photoPanel: true)", async () => {
    wrap(<SimpleGridPage kind="patch-panels" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "patch-panels")).toBe(true)
    );
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Upload photo")).toBeTruthy());
  });

  it("shows a photo manager for power devices (photoPanel: true)", async () => {
    wrap(<SimpleGridPage kind="power" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "power-devices")).toBe(true)
    );
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Upload photo")).toBeTruthy());
  });

  it("shows no photo manager for cables (photoPanel unset — Cable has no photo_url)", async () => {
    wrap(<SimpleGridPage kind="cables" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "cables")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "cables");
    expect(props.panel).toBeUndefined();
    expect(props.onSelectionChanged).toBeUndefined();
  });

  it("shows no photo manager for racks (photoPanel unset — Rack has no photo_url)", async () => {
    wrap(<SimpleGridPage kind="racks" />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "racks")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "racks");
    expect(props.panel).toBeUndefined();
  });
});
