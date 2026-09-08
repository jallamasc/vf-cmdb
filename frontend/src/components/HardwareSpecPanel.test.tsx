// Phase 6 Task 33/37 (Req 13.1/13.2/13.3) — HardwareSpecPanel: structured
// spec fields save independently, and the online lookup NEVER auto-applies
// a value — it only shows proposed data for the operator to read.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HardwareSpecPanel, { hasHardwareSpecFields } from "./HardwareSpecPanel";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      update: vi.fn(),
      lookupHardwareSpecs: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const POWER_ROW = {
  id: 7,
  full_name: "Smart-UPS 3000VA",
  rack_units: 2,
  capacity_va: 3000,
  output_count: 8,
  input_voltage: "208V",
};

describe("hasHardwareSpecFields", () => {
  it("is true for all 4 device-type resources", () => {
    expect(hasHardwareSpecFields("compute-device-types")).toBe(true);
    expect(hasHardwareSpecFields("network-device-types")).toBe(true);
    expect(hasHardwareSpecFields("storage-device-types")).toBe(true);
    expect(hasHardwareSpecFields("power-device-types")).toBe(true);
  });

  it("is false for a non-device-type resource", () => {
    expect(hasHardwareSpecFields("organizations")).toBe(false);
  });
});

describe("HardwareSpecPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the category-appropriate fields for power-device-types, pre-filled from the row", async () => {
    wrap(<HardwareSpecPanel resource="power-device-types" row={POWER_ROW} onChanged={vi.fn()} />);
    expect(screen.getByText("Capacity (VA)")).toBeTruthy();
    expect(screen.getByText("Output Count")).toBeTruthy();
    expect(screen.getByDisplayValue("3000")).toBeTruthy();
    expect(screen.getByDisplayValue("8")).toBeTruthy();
    expect(screen.getByDisplayValue("208V")).toBeTruthy();
    // Compute-only fields must not appear on a power device type.
    expect(screen.queryByText("CPU Sockets")).toBeNull();
  });

  it("saves a field on blur via api.update, scoped to just that field", async () => {
    (api.update as any).mockResolvedValue({});
    const onChanged = vi.fn();
    wrap(<HardwareSpecPanel resource="power-device-types" row={POWER_ROW} onChanged={onChanged} />);

    const input = screen.getByDisplayValue("3000");
    fireEvent.change(input, { target: { value: "3500" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("power-device-types", 7, { capacity_va: 3500 })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("shows Icecat proposed specs as read-only info, never as an auto-fill", async () => {
    (api.lookupHardwareSpecs as any).mockResolvedValue({
      source: "icecat",
      icecat: {
        found: true,
        title: "APC Smart-UPS 3000VA",
        specs: [
          { name: "Output power capacity", value: "3000 VA" },
          { name: "Number of AC outlets", value: "8" },
        ],
      },
      brave_results: [],
    });
    wrap(<HardwareSpecPanel resource="power-device-types" row={POWER_ROW} onChanged={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Brand (e.g. APC)"), { target: { value: "APC" } });
    fireEvent.change(screen.getByPlaceholderText("Model / part code"), {
      target: { value: "SMT3000RM2U" },
    });
    fireEvent.click(screen.getByText("Look up"));

    await waitFor(() =>
      expect(api.lookupHardwareSpecs).toHaveBeenCalledWith("APC", "SMT3000RM2U")
    );
    expect(await screen.findByText("Output power capacity")).toBeTruthy();
    expect(screen.getByText("3000 VA")).toBeTruthy();
    // Crucially: no "Apply"/auto-fill control — api.update is never called
    // just from showing a lookup result.
    expect(screen.queryByText(/apply/i)).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("falls back to Brave Search links+snippets when Icecat has nothing", async () => {
    (api.lookupHardwareSpecs as any).mockResolvedValue({
      source: "brave",
      icecat: null,
      brave_results: [
        { title: "Some Datasheet", url: "https://example.com/x", description: "A snippet." },
      ],
    });
    wrap(<HardwareSpecPanel resource="power-device-types" row={POWER_ROW} onChanged={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Brand (e.g. APC)"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText("Model / part code"), {
      target: { value: "X1" },
    });
    fireEvent.click(screen.getByText("Look up"));

    expect(await screen.findByText("Some Datasheet")).toBeTruthy();
    expect(screen.getByText("A snippet.")).toBeTruthy();
    const link = screen.getByText("Some Datasheet").closest("a");
    expect(link?.getAttribute("href")).toBe("https://example.com/x");
  });

  it("shows a plain 'nothing found' message when neither source has anything", async () => {
    (api.lookupHardwareSpecs as any).mockResolvedValue({
      source: "none",
      icecat: null,
      brave_results: [],
    });
    wrap(<HardwareSpecPanel resource="power-device-types" row={POWER_ROW} onChanged={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Brand (e.g. APC)"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText("Model / part code"), {
      target: { value: "X1" },
    });
    fireEvent.click(screen.getByText("Look up"));

    expect(await screen.findByText(/No proposed data found online/)).toBeTruthy();
  });

  it("surfaces a lookup error without crashing", async () => {
    (api.lookupHardwareSpecs as any).mockRejectedValue(new Error("502: unreachable"));
    wrap(<HardwareSpecPanel resource="power-device-types" row={POWER_ROW} onChanged={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Brand (e.g. APC)"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByPlaceholderText("Model / part code"), {
      target: { value: "X1" },
    });
    fireEvent.click(screen.getByText("Look up"));

    expect(await screen.findByText(/unreachable/)).toBeTruthy();
  });

  it("pre-fills model from the row's full_name, but still requires a brand before enabling Look up", async () => {
    wrap(<HardwareSpecPanel resource="power-device-types" row={POWER_ROW} onChanged={vi.fn()} />);
    expect(screen.getByPlaceholderText("Model / part code")).toHaveValue("Smart-UPS 3000VA");
    expect(screen.getByText("Look up")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Brand (e.g. APC)"), { target: { value: "APC" } });
    expect(screen.getByText("Look up")).not.toBeDisabled();
  });

  it("disables Look up again if the model field is cleared out", async () => {
    wrap(<HardwareSpecPanel resource="power-device-types" row={POWER_ROW} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Brand (e.g. APC)"), { target: { value: "APC" } });
    fireEvent.change(screen.getByPlaceholderText("Model / part code"), { target: { value: "" } });
    expect(screen.getByText("Look up")).toBeDisabled();
  });
});
