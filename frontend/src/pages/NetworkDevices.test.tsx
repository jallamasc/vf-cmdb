// Phase 5 Task 23 — NetworkDevices: photo manager panel (Req 19.1).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NetworkDevices from "./NetworkDevices";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return (
      <div data-testid="entity-grid">
        <button
          data-testid="select-row"
          onClick={() =>
            props.onSelectionChanged?.([{ id: 3, photo_url: null }])
          }
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
    api: {
      ...actual.api,
      list: vi.fn((resource: string) => {
        if (resource === "field-visibility-overrides") {
          return Promise.resolve([
            { id: 1, entity_slug: "network-devices", field_key: "serial_number", visible: false },
            // A different entity's override must not affect this grid.
            { id: 2, entity_slug: "physical-servers", field_key: "model", visible: false },
          ]);
        }
        return Promise.resolve([]);
      }),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("NetworkDevices — photo manager panel (Req 19.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("shows a placeholder before any row is selected", async () => {
    wrap(<NetworkDevices />);
    await waitFor(() => expect(screen.getByTestId("select-row")).toBeTruthy());
    expect(screen.getByText(/select a row to upload or view/i)).toBeTruthy();
  });

  it("shows the photo upload control for the selected device", async () => {
    wrap(<NetworkDevices />);
    await waitFor(() => expect(screen.getByTestId("select-row")).toBeTruthy());
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Upload photo")).toBeTruthy());
  });

  it("passes the network-devices resource through to EntityGrid", async () => {
    wrap(<NetworkDevices />);
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "network-devices")).toBe(true)
    );
  });

  it("removes a column hidden via a Field_Visibility_Override (Req 20.2)", async () => {
    wrap(<NetworkDevices />);
    await waitFor(() => {
      const props = capturedProps.find((p) => p.resource === "network-devices");
      expect(props?.columns.some((c: any) => c.field === "serial_number")).toBe(false);
    });
    const props = capturedProps.find((p) => p.resource === "network-devices");
    // Model, on the same grid, is untouched — only serial_number was hidden.
    expect(props.columns.some((c: any) => c.field === "model")).toBe(true);
  });
});
