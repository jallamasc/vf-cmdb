// Phase 5 Task 26/27 — BlueprintField: URL save + upload flows (Req 21.3/22.3).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BlueprintField from "./BlueprintField";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      update: vi.fn(),
      uploadBlueprint: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("BlueprintField", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a placeholder when no blueprint is set yet", () => {
    wrap(<BlueprintField resource="rooms" row={{ id: 1, blueprint_url: null }} />);
    expect(screen.getByText("no blueprint")).toBeTruthy();
  });

  it("renders the current blueprint when blueprint_url is set", () => {
    wrap(
      <BlueprintField
        resource="rooms"
        row={{ id: 1, blueprint_url: "/api/v1/blueprints/rooms-1" }}
      />
    );
    expect(screen.queryByText("no blueprint")).toBeNull();
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("/api/v1/blueprints/rooms-1");
  });

  it("saves a pasted URL via api.update", async () => {
    (api.update as any).mockResolvedValue({});
    wrap(<BlueprintField resource="rooms" row={{ id: 5, blueprint_url: null }} />);

    fireEvent.change(screen.getByPlaceholderText(/floor-plan.png/), {
      target: { value: "https://example.com/plan.png" },
    });
    fireEvent.click(screen.getByText("Save URL"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("rooms", 5, {
        blueprint_url: "https://example.com/plan.png",
      })
    );
    await waitFor(() => expect(screen.getByText("Blueprint URL saved")).toBeTruthy());
  });

  it("uploads a chosen file via api.uploadBlueprint", async () => {
    (api.uploadBlueprint as any).mockResolvedValue({
      resource: "rooms",
      id: 5,
      blueprint_url: "/api/v1/blueprints/rooms-5",
    });
    const { container } = wrap(
      <BlueprintField resource="rooms" row={{ id: 5, blueprint_url: null }} />
    );

    const file = new File(["x"], "plan.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(api.uploadBlueprint).toHaveBeenCalledWith("rooms", 5, file)
    );
    await waitFor(() => expect(screen.getByText("Blueprint uploaded")).toBeTruthy());
  });
});
