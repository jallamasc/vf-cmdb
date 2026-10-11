// FEAT-003 — VersionFooter / UpdateBadge behavior. Covers: no badge when
// up-to-date, a badge naming the newer version, silent degrade on a failed
// version query, and the click->requested->idle->running->succeeded apply flow
// (finding 4 "still starting" + finding 3 disable-while-running).
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VersionFooter from "./VersionFooter";
import { api, type MetaVersion, type UpdateStatus } from "../api";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const META = (over: Partial<MetaVersion> = {}): MetaVersion => ({
  version: "1.5.0",
  gitSha: "abc1234",
  builtAt: "2026-01-01T00:00:00Z",
  latest: null,
  latestTag: null,
  updateAvailable: false,
  ...over,
});

const STATUS = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  state: "idle",
  message: "",
  requestedVersion: null,
  startedAt: null,
  finishedAt: null,
  ...over,
});

describe("VersionFooter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the version and no badge when running == latest", async () => {
    vi.spyOn(api, "metaVersion").mockResolvedValue(
      META({ version: "1.5.0", latest: "1.5.0", updateAvailable: false }),
    );
    wrap(<VersionFooter />);
    expect(await screen.findByText("v1.5.0")).toBeInTheDocument();
    expect(screen.queryByText(/Update available/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Update now/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a badge naming the newer version when an update is available", async () => {
    vi.spyOn(api, "metaVersion").mockResolvedValue(
      META({ version: "1.5.0", latest: "1.6.0", updateAvailable: true }),
    );
    wrap(<VersionFooter />);
    expect(await screen.findByText("v1.5.0")).toBeInTheDocument();
    expect(
      await screen.findByText("Update available → v1.6.0"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Update now to version 1\.6\.0/i }),
    ).toBeEnabled();
  });

  it("degrades silently to the build version with no badge when the query fails", async () => {
    vi.spyOn(api, "metaVersion").mockRejectedValue(new Error("boom"));
    wrap(<VersionFooter />);
    // __APP_VERSION__ is injected by Vite define; in tests it is undefined, so
    // the component renders "v" + the build-time value. The important asserts
    // are: no badge, no thrown error (render did not crash).
    await waitFor(() =>
      expect(screen.queryByText(/Update available/)).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Update now/i }),
    ).not.toBeInTheDocument();
  });

  it("handles the apply flow: requested -> idle(starting) -> running -> succeeded", async () => {
    vi.spyOn(api, "metaVersion").mockResolvedValue(
      META({ version: "1.5.0", latest: "1.6.0", updateAvailable: true }),
    );
    vi.spyOn(api, "requestUpdate").mockResolvedValue(
      STATUS({ state: "requested" }),
    );
    // Finding 4: first poll returns idle (host hasn't written running yet) —
    // must be treated as "still starting", NOT failed. Then running, then
    // succeeded. A gated promise lets each poll resolve on demand so we can
    // assert the intermediate UI with real timers (no userEvent/fake-timer
    // deadlock).
    let release: (() => void) | null = null;
    const gate = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const statusSpy = vi
      .spyOn(api, "updateStatus")
      .mockImplementationOnce(async () => {
        await gate();
        return STATUS({ state: "idle" });
      })
      .mockImplementationOnce(async () => {
        await gate();
        return STATUS({ state: "running", message: "Pulling images" });
      })
      .mockImplementationOnce(async () => {
        await gate();
        return STATUS({ state: "succeeded" });
      });

    wrap(<VersionFooter />);

    await screen.findByText("Update available → v1.6.0");

    fireEvent.click(
      screen.getByRole("button", { name: /Update now to version 1\.6\.0/i }),
    );

    // POST resolved with 'requested' -> badge shows "Updating" (still starting).
    await screen.findByText(/Updating →/);

    // First poll fires (3s). Release it: idle before any activity -> stays
    // "still starting", NOT a failure, and keeps polling.
    await waitFor(() => expect(statusSpy).toHaveBeenCalledTimes(1), {
      timeout: 5_000,
    });
    release!();
    await waitFor(() => expect(statusSpy).toHaveBeenCalledTimes(2), {
      timeout: 5_000,
    });
    expect(screen.queryByText(/Update failed/)).not.toBeInTheDocument();
    expect(screen.getByText(/Updating →/)).toBeInTheDocument();

    // Second poll: running -> finding 3: button disabled while running.
    release!();
    await screen.findByText(/Pulling images/, {}, { timeout: 5_000 });
    expect(
      screen.getByRole("button", { name: /Update now to version/i }),
    ).toBeDisabled();
    await waitFor(() => expect(statusSpy).toHaveBeenCalledTimes(3), {
      timeout: 5_000,
    });

    // Third poll: succeeded -> terminal, button removed, polling stops.
    release!();
    await screen.findByText("Updated → v1.6.0", {}, { timeout: 5_000 });
    expect(
      screen.queryByRole("button", { name: /Update now/i }),
    ).not.toBeInTheDocument();

    // Polling stopped at the terminal state — no 4th call appears even after
    // another full interval elapses.
    await new Promise((r) => setTimeout(r, 3_200));
    expect(statusSpy).toHaveBeenCalledTimes(3);
  }, 20_000);
});

afterEach(() => {
  vi.restoreAllMocks();
});
