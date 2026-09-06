// Phase 5 Task 22/23 — PhotoField: URL save + upload flows (Req 18.1/19.1).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PhotoField from "./PhotoField";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      update: vi.fn(),
      uploadPhoto: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("PhotoField", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a placeholder when no photo is set yet", () => {
    wrap(<PhotoField resource="generic-entities" row={{ id: 1, photo_url: null }} />);
    expect(screen.getByText("no photo")).toBeTruthy();
  });

  it("renders the current photo when photo_url is set", () => {
    wrap(
      <PhotoField
        resource="generic-entities"
        row={{ id: 1, photo_url: "/api/v1/photos/generic-entities-1" }}
      />
    );
    expect(screen.queryByText("no photo")).toBeNull();
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img.src).toContain("/api/v1/photos/generic-entities-1");
  });

  it("saves a pasted URL via api.update", async () => {
    (api.update as any).mockResolvedValue({});
    wrap(<PhotoField resource="generic-entities" row={{ id: 5, photo_url: null }} />);

    fireEvent.change(screen.getByPlaceholderText(/photo.jpg/), {
      target: { value: "https://example.com/pic.jpg" },
    });
    fireEvent.click(screen.getByText("Save URL"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("generic-entities", 5, {
        photo_url: "https://example.com/pic.jpg",
      })
    );
    await waitFor(() => expect(screen.getByText("Photo URL saved")).toBeTruthy());
  });

  it("uploads a chosen file via api.uploadPhoto", async () => {
    (api.uploadPhoto as any).mockResolvedValue({
      resource: "generic-entities",
      id: 5,
      photo_url: "/api/v1/photos/generic-entities-5",
    });
    const { container } = wrap(
      <PhotoField resource="generic-entities" row={{ id: 5, photo_url: null }} />
    );

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(api.uploadPhoto).toHaveBeenCalledWith("generic-entities", 5, file)
    );
    await waitFor(() => expect(screen.getByText("Photo uploaded")).toBeTruthy());
  });
});
