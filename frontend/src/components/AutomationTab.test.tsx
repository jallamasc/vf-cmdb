// Phase 5 Task 39 (Req 31.1/31.2/31.3) — AutomationTab in isolation.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AutomationTab from "./AutomationTab";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      automationStatus: vi.fn(),
      automationTemplates: vi.fn().mockResolvedValue([]),
      launchAutomationTask: vi.fn(),
      getAutomationTask: vi.fn(),
      getAutomationTaskOutput: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const ROW = { id: 1 };

describe("AutomationTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an unconfigured message when Semaphore isn't configured", async () => {
    (api.automationStatus as any).mockResolvedValue({
      inventory_id: null,
      has_credential: false,
      configured: false,
      semaphore_url: null,
      project_id: null,
    });
    wrap(<AutomationTab resource="generic-entities" row={ROW} />);
    expect(
      await screen.findByText(/Semaphore automation is not configured/),
    ).toBeTruthy();
    expect(api.automationTemplates).not.toHaveBeenCalled();
  });

  it("reports linked status without offering to launch when no inventory exists yet", async () => {
    (api.automationStatus as any).mockResolvedValue({
      inventory_id: null,
      has_credential: false,
      configured: true,
      semaphore_url: "http://semaphore.test",
      project_id: 3,
    });
    wrap(<AutomationTab resource="generic-entities" row={ROW} />);
    expect((await screen.findAllByText("Not linked")).length).toBe(2);
    expect(
      await screen.findByText(/No Semaphore inventory linked for this record yet/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Automation template")).toBeNull();
  });

  it("lists templates and launches the chosen one against this record's inventory", async () => {
    (api.automationStatus as any).mockResolvedValue({
      inventory_id: 9,
      has_credential: true,
      configured: true,
      semaphore_url: "http://semaphore.test",
      project_id: 3,
    });
    (api.automationTemplates as any).mockResolvedValue([
      { id: 1, name: "ping" },
      { id: 2, name: "deploy" },
    ]);
    (api.launchAutomationTask as any).mockResolvedValue({
      id: 42,
      status: "waiting",
      template_id: 2,
    });
    (api.getAutomationTask as any).mockResolvedValue({ id: 42, status: "running" });

    wrap(<AutomationTab resource="generic-entities" row={ROW} />);
    const select = await screen.findByLabelText("Automation template");
    await screen.findByText("deploy");
    fireEvent.change(select, { target: { value: "2" } });
    await waitFor(() => expect(screen.getByText("Launch")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Launch"));

    await waitFor(() =>
      expect(api.launchAutomationTask).toHaveBeenCalledWith("generic-entities", 1, 2),
    );
    expect(await screen.findByText("#42")).toBeTruthy();
    expect(await screen.findByText("running")).toBeTruthy();
  });

  it("shows a task's output only after 'Show output' is clicked, and links to Semaphore", async () => {
    (api.automationStatus as any).mockResolvedValue({
      inventory_id: 9,
      has_credential: true,
      configured: true,
      semaphore_url: "http://semaphore.test",
      project_id: 3,
    });
    (api.automationTemplates as any).mockResolvedValue([{ id: 2, name: "deploy" }]);
    (api.launchAutomationTask as any).mockResolvedValue({ id: 42, status: "success" });
    (api.getAutomationTask as any).mockResolvedValue({ id: 42, status: "success" });
    (api.getAutomationTaskOutput as any).mockResolvedValue([
      { task_id: 42, time: "t1", output: "line one" },
      { task_id: 42, time: "t2", output: "line two" },
    ]);

    wrap(<AutomationTab resource="generic-entities" row={ROW} />);
    const select = await screen.findByLabelText("Automation template");
    await screen.findByText("deploy");
    fireEvent.change(select, { target: { value: "2" } });
    await waitFor(() => expect(screen.getByText("Launch")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Launch"));

    await screen.findByText("#42");
    expect(api.getAutomationTaskOutput).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Show output"));
    await waitFor(() => expect(api.getAutomationTaskOutput).toHaveBeenCalled());
    expect(await screen.findByText(/line one/)).toBeTruthy();

    const link = screen.getByText("Open in Semaphore") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      "http://semaphore.test/project/3/history?t=42",
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
