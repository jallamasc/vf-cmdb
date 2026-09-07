// Phase 4 Task 31 — StencilLibraryPicker: category -> file -> shape flow,
// applying via the EXISTING uploadStencil endpoint, error surfacing.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StencilLibraryPicker from "./StencilLibraryPicker";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      stencilLibraryCategories: vi.fn(),
      stencilLibraryFiles: vi.fn(),
      stencilLibraryFetch: vi.fn(),
      stencilVendors: vi.fn(),
      stencilVendorProductLines: vi.fn(),
      stencilVendorFiles: vi.fn(),
      stencilVendorConvert: vi.fn(),
      uploadStencil: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// jsdom/happy-dom doesn't implement fetch by default for arbitrary URLs;
// the "apply" flow does a plain `fetch(preview_url)` to grab the SVG bytes.
const originalFetch = global.fetch;

describe("StencilLibraryPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  it("lists categories for the selected source", async () => {
    (api.stencilLibraryCategories as any).mockResolvedValue([
      { key: "Computer Racks", label: "Computer Racks" },
      { key: "IT Vendors", label: "IT Vendors" },
    ]);
    wrap(
      <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={vi.fn()} onClose={vi.fn()} />
    );
    expect(await screen.findByText("Computer Racks")).toBeInTheDocument();
    expect(screen.getByText("IT Vendors")).toBeInTheDocument();
    expect(api.stencilLibraryCategories).toHaveBeenCalledWith("github");
  });

  it("shows a friendly empty state when a source has no curated categories", async () => {
    (api.stencilLibraryCategories as any).mockResolvedValue([]);
    wrap(
      <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={vi.fn()} onClose={vi.fn()} />
    );
    expect(await screen.findByText(/No categories curated yet/)).toBeInTheDocument();
  });

  it("lists and fuzzy-filters files after picking a category", async () => {
    (api.stencilLibraryCategories as any).mockResolvedValue([{ key: "Computer Racks", label: "Computer Racks" }]);
    (api.stencilLibraryFiles as any).mockResolvedValue([
      { name: "APC AP7516 Rack PDU.vss", size: 1000 },
      { name: "Cisco Rack Cabinet.vss", size: 2000 },
    ]);
    wrap(
      <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(await screen.findByText("Computer Racks"));
    expect(await screen.findByText("APC AP7516 Rack PDU.vss")).toBeInTheDocument();
    expect(screen.getByText("Cisco Rack Cabinet.vss")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search files/), { target: { value: "apc" } });
    expect(screen.getByText("APC AP7516 Rack PDU.vss")).toBeInTheDocument();
    expect(screen.queryByText("Cisco Rack Cabinet.vss")).not.toBeInTheDocument();
  });

  it("fetches+converts a picked file and shows shape previews", async () => {
    (api.stencilLibraryCategories as any).mockResolvedValue([{ key: "Computer Racks", label: "Computer Racks" }]);
    (api.stencilLibraryFiles as any).mockResolvedValue([{ name: "APC AP7516.vss", size: 1000 }]);
    (api.stencilLibraryFetch as any).mockResolvedValue({
      token: "abc123",
      source: "github",
      category: "Computer Racks",
      file: "APC AP7516.vss",
      shapes: [
        { title: "AP7516 - Front View", preview_url: "/api/v1/stencil-library/previews/abc123/front.svg" },
        { title: "AP7516 - Side View", preview_url: "/api/v1/stencil-library/previews/abc123/side.svg" },
      ],
    });
    wrap(
      <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(await screen.findByText("Computer Racks"));
    fireEvent.click(await screen.findByText("APC AP7516.vss"));

    await waitFor(() => expect(api.stencilLibraryFetch).toHaveBeenCalledWith("github", "Computer Racks", "APC AP7516.vss"));
    expect(await screen.findByText("AP7516 - Front View")).toBeInTheDocument();
    expect(screen.getByText("AP7516 - Side View")).toBeInTheDocument();
  });

  it("applies a picked shape via the EXISTING uploadStencil endpoint and calls onApplied+onClose", async () => {
    (api.stencilLibraryCategories as any).mockResolvedValue([{ key: "Computer Racks", label: "Computer Racks" }]);
    (api.stencilLibraryFiles as any).mockResolvedValue([{ name: "APC AP7516.vss", size: 1000 }]);
    (api.stencilLibraryFetch as any).mockResolvedValue({
      token: "abc123",
      source: "github",
      category: "Computer Racks",
      file: "APC AP7516.vss",
      shapes: [
        { title: "AP7516 - Front View", preview_url: "/api/v1/stencil-library/previews/abc123/front.svg" },
      ],
    });
    (api.uploadStencil as any).mockResolvedValue({ stored: true });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["<svg/>"], { type: "image/svg+xml" })),
    }) as any;

    const onApplied = vi.fn();
    const onClose = vi.fn();
    wrap(
      <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={onApplied} onClose={onClose} />
    );
    fireEvent.click(await screen.findByText("Computer Racks"));
    fireEvent.click(await screen.findByText("APC AP7516.vss"));
    fireEvent.click(await screen.findByText("AP7516 - Front View"));

    await waitFor(() => expect(api.uploadStencil).toHaveBeenCalledTimes(1));
    const [modelSlug, file, face] = (api.uploadStencil as any).mock.calls[0];
    expect(modelSlug).toBe("power-device-types-1");
    expect(file).toBeInstanceOf(File);
    expect(face).toBe("front");
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("surfaces a fetch/convert error without applying anything", async () => {
    (api.stencilLibraryCategories as any).mockResolvedValue([{ key: "Computer Racks", label: "Computer Racks" }]);
    (api.stencilLibraryFiles as any).mockResolvedValue([{ name: "Bad.vss", size: 10 }]);
    (api.stencilLibraryFetch as any).mockRejectedValue(new Error("422: vss2svg-conv produced no shapes"));

    wrap(
      <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(await screen.findByText("Computer Racks"));
    fireEvent.click(await screen.findByText("Bad.vss"));

    expect(await screen.findByText(/produced no shapes/)).toBeInTheDocument();
    expect(api.uploadStencil).not.toHaveBeenCalled();
  });

  // Phase 6 Task 24 (Req 9.2/9.3) — the 3rd "Vendor ZIP" source: vendor ->
  // product line -> file-inside-a-ZIP, reusing the same preview/apply UI.
  describe("Vendor ZIP source", () => {
    it("lists vendors, then product lines after picking one", async () => {
      (api.stencilVendors as any).mockResolvedValue([{ key: "Microsoft", label: "Microsoft" }]);
      (api.stencilVendorProductLines as any).mockResolvedValue([
        { key: "network-equipment-shapes", label: "Network Equipment Shapes" },
      ]);
      wrap(
        <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={vi.fn()} onClose={vi.fn()} />
      );
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "vendor" } });
      expect(await screen.findByText("Microsoft")).toBeInTheDocument();
      expect(api.stencilVendors).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("Microsoft"));
      expect(await screen.findByText("Network Equipment Shapes")).toBeInTheDocument();
      expect(api.stencilVendorProductLines).toHaveBeenCalledWith("Microsoft");
    });

    it("downloads+extracts ONLY the picked product line's ZIP and lists its files", async () => {
      (api.stencilVendors as any).mockResolvedValue([{ key: "Microsoft", label: "Microsoft" }]);
      (api.stencilVendorProductLines as any).mockResolvedValue([
        { key: "network-equipment-shapes", label: "Network Equipment Shapes" },
      ]);
      (api.stencilVendorFiles as any).mockResolvedValue(["APC AP7516.vss", "Cisco Rack.vss"]);
      wrap(
        <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={vi.fn()} onClose={vi.fn()} />
      );
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "vendor" } });
      fireEvent.click(await screen.findByText("Microsoft"));
      fireEvent.click(await screen.findByText("Network Equipment Shapes"));

      await waitFor(() =>
        expect(api.stencilVendorFiles).toHaveBeenCalledWith("Microsoft", "network-equipment-shapes")
      );
      expect(await screen.findByText("APC AP7516.vss")).toBeInTheDocument();
      expect(screen.getByText("Cisco Rack.vss")).toBeInTheDocument();
      // Only ONE product line's files were fetched — no bulk pre-fetch.
      expect(api.stencilVendorFiles).toHaveBeenCalledTimes(1);
    });

    it("converts a picked vendor file through the same preview/apply flow", async () => {
      (api.stencilVendors as any).mockResolvedValue([{ key: "Microsoft", label: "Microsoft" }]);
      (api.stencilVendorProductLines as any).mockResolvedValue([
        { key: "network-equipment-shapes", label: "Network Equipment Shapes" },
      ]);
      (api.stencilVendorFiles as any).mockResolvedValue(["APC AP7516.vss"]);
      (api.stencilVendorConvert as any).mockResolvedValue({
        token: "vend123",
        vendor: "Microsoft",
        product_line: "network-equipment-shapes",
        file: "APC AP7516.vss",
        shapes: [
          { title: "AP7516 - Front View", preview_url: "/api/v1/stencil-library/previews/vend123/front.svg" },
        ],
      });
      (api.uploadStencil as any).mockResolvedValue({ stored: true });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(["<svg/>"], { type: "image/svg+xml" })),
      }) as any;

      const onApplied = vi.fn();
      const onClose = vi.fn();
      wrap(
        <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={onApplied} onClose={onClose} />
      );
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "vendor" } });
      fireEvent.click(await screen.findByText("Microsoft"));
      fireEvent.click(await screen.findByText("Network Equipment Shapes"));
      fireEvent.click(await screen.findByText("APC AP7516.vss"));

      await waitFor(() =>
        expect(api.stencilVendorConvert).toHaveBeenCalledWith(
          "Microsoft",
          "network-equipment-shapes",
          "APC AP7516.vss"
        )
      );
      fireEvent.click(await screen.findByText("AP7516 - Front View"));

      await waitFor(() => expect(api.uploadStencil).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("switching sources resets vendor/product-line state and never mixes flows", async () => {
      (api.stencilLibraryCategories as any).mockResolvedValue([{ key: "Computer Racks", label: "Computer Racks" }]);
      (api.stencilVendors as any).mockResolvedValue([{ key: "Microsoft", label: "Microsoft" }]);
      wrap(
        <StencilLibraryPicker modelSlug="power-device-types-1" face="front" onApplied={vi.fn()} onClose={vi.fn()} />
      );
      expect(await screen.findByText("Computer Racks")).toBeInTheDocument();

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "vendor" } });
      expect(await screen.findByText("Microsoft")).toBeInTheDocument();
      expect(screen.queryByText("Computer Racks")).not.toBeInTheDocument();

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "github" } });
      expect(await screen.findByText("Computer Racks")).toBeInTheDocument();
      expect(screen.queryByText("Microsoft")).not.toBeInTheDocument();
    });
  });
});
