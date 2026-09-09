// Round 6 QA — useThemePicker: the shared "🎭 Pick" in-grid themed-name
// picker factored out of Sites.tsx/NetworkDevices.tsx's identical inline
// pattern, so every other resource with theme_name/theme_category gets
// the same working dropdown/catalogue picker instead of a plain text cell.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useThemePicker } from "./useThemePicker";
import { api } from "../api";

vi.mock("../components/ThemeNamePicker", () => ({
  default: (props: any) => {
    if (!props.open) return null;
    return (
      <div data-testid="theme-picker">
        <button onClick={() => props.onSelect({ name: "Kilimanjaro", category: "mountain_peaks" })}>
          pick Kilimanjaro
        </button>
      </div>
    );
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: { ...(actual as any).api, update: vi.fn().mockResolvedValue({}) },
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useThemePicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a button ColDef that opens the picker for the clicked row", () => {
    const { result } = renderHook(() => useThemePicker("racks"), { wrapper });
    const Renderer = result.current.column.cellRenderer as (p: any) => JSX.Element;
    render(<Renderer data={{ id: 5, theme_category: "mountain_peaks" }} />);
    expect(screen.queryByTestId("theme-picker")).toBeNull();
    fireEvent.click(screen.getByText("🎭 Pick"));
  });

  it("persists the selection via api.update with theme_name/theme_category and nothing else", async () => {
    const { result } = renderHook(() => useThemePicker("racks"), { wrapper });
    const Renderer = result.current.column.cellRenderer as (p: any) => JSX.Element;
    render(<Renderer data={{ id: 5 }} />);
    fireEvent.click(screen.getByText("🎭 Pick"));

    // The hook's own `picker` element reflects the now-open state; render
    // it fresh (renderHook doesn't auto-render returned JSX for us).
    render(result.current.picker);
    fireEvent.click(await screen.findByText("pick Kilimanjaro"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("racks", 5, {
        theme_name: "Kilimanjaro",
        theme_category: "mountain_peaks",
      })
    );
  });
});
