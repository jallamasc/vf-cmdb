// Phase 6 Task 20 (Req 8.1/8.2/8.3) — SiteCodePanel: Site Code and Theme
// Name are shown and saved independently, never clobbering each other.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SiteCodePanel from "./SiteCodePanel";
import { api } from "../api";

let latestPickerProps: any = null;
vi.mock("./ThemeNamePicker", () => ({
  default: (props: any) => {
    latestPickerProps = props;
    if (!props.open) return null;
    return (
      <div data-testid="theme-picker">
        <button onClick={() => props.onSelect({ name: "Athena", category: "greek" })}>
          pick Athena
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
      ...actual.api,
      update: vi.fn(),
      siteCode: vi.fn().mockResolvedValue({ site_code: "vfhmcc1", missing: [] }),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const SITE = {
  id: 7,
  site_code_type: "custom",
  simple_name: "hq-bogota-1",
  theme_name: "Zeus",
  theme_category: "greek",
  organization_id: 1,
  campus_id: 1,
  region_id: 1,
};

describe("SiteCodePanel — code + theme coexistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestPickerProps = null;
  });

  it("shows both the current code AND the current theme name at the same time", async () => {
    wrap(<SiteCodePanel site={SITE} />);
    await waitFor(() => expect(screen.getByDisplayValue("hq-bogota-1")).toBeTruthy());
    expect(screen.getByText("Zeus")).toBeTruthy();
  });

  it("no longer offers 'Theme' as a Site Code mode", async () => {
    wrap(<SiteCodePanel site={SITE} />);
    await waitFor(() => expect(screen.getByText("Auto")).toBeTruthy());
    expect(screen.getByText("Custom")).toBeTruthy();
    // "Theme" as a radio-mode label no longer exists (only as the
    // independent section's heading "Theme name").
    expect(screen.queryByRole("radio", { name: "Theme" })).toBeNull();
  });

  it("saving a new custom code never touches theme_name/theme_category", async () => {
    (api.update as any).mockResolvedValue({ simple_name: "new-code" });
    wrap(<SiteCodePanel site={SITE} />);
    const input = await screen.findByDisplayValue("hq-bogota-1");
    fireEvent.change(input, { target: { value: "new-code" } });
    fireEvent.click(screen.getByText("Save site code"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("sites", 7, {
        site_code_type: "custom",
        simple_name: "new-code",
      })
    );
  });

  it("picking a new theme name never touches site_code_type/simple_name", async () => {
    (api.update as any).mockResolvedValue({ theme_name: "Athena" });
    wrap(<SiteCodePanel site={SITE} />);
    await waitFor(() => expect(screen.getByText("Zeus")).toBeTruthy());
    fireEvent.click(screen.getByText("Change…"));
    fireEvent.click(await screen.findByText("pick Athena"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("sites", 7, {
        theme_name: "Athena",
        theme_category: "greek",
      })
    );
    // The Site Code section's own save button was never touched.
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it("clearing the theme name sends null without touching the code", async () => {
    (api.update as any).mockResolvedValue({ theme_name: null });
    wrap(<SiteCodePanel site={SITE} />);
    await waitFor(() => expect(screen.getByText("Zeus")).toBeTruthy());
    fireEvent.click(screen.getByText("Clear"));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("sites", 7, {
        theme_name: null,
        theme_category: null,
      })
    );
  });

  it("a legacy site_code_type of 'theme' is treated as custom going forward (no exclusive Theme mode left)", async () => {
    wrap(<SiteCodePanel site={{ ...SITE, site_code_type: "theme" }} />);
    await waitFor(() => expect(screen.getByDisplayValue("hq-bogota-1")).toBeTruthy());
    const customRadio = screen.getByRole("radio", { name: "Custom" }) as HTMLInputElement;
    expect(customRadio.checked).toBe(true);
  });
});
