// Phase 4 Task 14 — AnchorEditor: click-to-place + delete an anchor.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AnchorEditor from "./AnchorEditor";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      stencilAnchors: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
      stencilUrl: () => "/api/v1/stencils/network-device-types-1?face=front",
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("AnchorEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows existing anchors as a list with delete buttons", async () => {
    (api.stencilAnchors as any).mockResolvedValue([
      { id: 1, owner_resource: "network-device-types", owner_id: 1, face: "front", port_key: "24", x: 0.5, y: 0.5, label: "Port 24" },
    ]);
    wrap(<AnchorEditor resource="network-device-types" row={{ id: 1 }} face="front" />);
    expect(await screen.findByText("24")).toBeInTheDocument();
  });

  it("creates an anchor at the normalized click position", async () => {
    (api.stencilAnchors as any).mockResolvedValue([]);
    (api.create as any).mockResolvedValue({ id: 1 });
    // The <img> onError fires immediately in jsdom/happy-dom (no real image
    // loads), which is fine — the click target is the wrapping <div>, present
    // either way.
    const { container } = wrap(
      <AnchorEditor resource="network-device-types" row={{ id: 1 }} face="front" />
    );
    await waitFor(() => expect(api.stencilAnchors).toHaveBeenCalled());

    const clickable = container.querySelector(".cursor-crosshair");
    expect(clickable).toBeTruthy();
    // Mock getBoundingClientRect so the normalized position is deterministic.
    (clickable as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
    fireEvent.click(clickable as HTMLElement, { clientX: 100, clientY: 50 });

    const portInput = await screen.findByPlaceholderText("Port identifier, e.g. 24");
    fireEvent.change(portInput, { target: { value: "24" } });
    fireEvent.click(screen.getByText("Add anchor"));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const [resource, payload] = (api.create as any).mock.calls[0];
    expect(resource).toBe("stencil-anchors");
    expect(payload.owner_resource).toBe("network-device-types");
    expect(payload.port_key).toBe("24");
    expect(payload.x).toBeCloseTo(0.5);
    expect(payload.y).toBeCloseTo(0.5);
  });

  it("deletes an anchor", async () => {
    (api.stencilAnchors as any).mockResolvedValue([
      { id: 7, owner_resource: "network-device-types", owner_id: 1, face: "front", port_key: "1", x: 0.1, y: 0.1 },
    ]);
    (api.remove as any).mockResolvedValue(null);
    wrap(<AnchorEditor resource="network-device-types" row={{ id: 1 }} face="front" />);
    const del = await screen.findByLabelText("Delete anchor 1");
    fireEvent.click(del);
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("stencil-anchors", 7));
  });
});
