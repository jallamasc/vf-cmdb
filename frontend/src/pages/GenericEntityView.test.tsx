// Phase 5 Task 20 — GenericEntityView against a synthetic type definition.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GenericEntityView from "./GenericEntityView";
import { api } from "../api";

let capturedProps: any[] = [];
// Phase 5 Task 32 — configurable per-test so the ip_assignment tests can
// select a row that actually carries ip_id/management_ip_id.
let selectRowPayload: any = { id: 1, entity_type_id: 7 };

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return (
      <div data-testid="entity-grid">
        {props.resource}
        <button
          data-testid="select-row"
          onClick={() => props.onSelectionChanged?.([selectRowPayload])}
        >
          select row
        </button>
        {props.panel}
      </div>
    );
  },
}));

const ENTITY_TYPES = [
  { id: 7, slug: "monitor", label: "Monitor", capabilities: ["photo"] },
];

const FIELD_TYPES = [
  { id: 1, slug: "text", label: "Text", storage_kind: "text" },
  { id: 2, slug: "number", label: "Number", storage_kind: "number" },
  { id: 3, slug: "reference", label: "Reference", storage_kind: "reference" },
];

const FIELD_DEFS = [
  {
    id: 10,
    entity_type_id: 7,
    key: "screen_size",
    label: "Screen Size",
    field_type_id: 2,
    required: false,
    sort_order: 2,
  },
  {
    id: 11,
    entity_type_id: 7,
    key: "color",
    label: "Color",
    field_type_id: 1,
    required: true,
    sort_order: 1,
  },
  {
    id: 12,
    entity_type_id: 7,
    key: "owner_site",
    label: "Owner Site",
    field_type_id: 3,
    required: false,
    sort_order: 3,
    reference_target_type: "sites",
  },
  // A field on a DIFFERENT entity type — must not leak into this view.
  { id: 20, entity_type_id: 99, key: "other", label: "Other", field_type_id: 1 },
];

const SITES = [{ id: 1, simple_name: "hq-bogota-1" }];

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn((resource: string) => {
        if (resource === "entity-type-defs") return Promise.resolve(ENTITY_TYPES);
        if (resource === "entity-field-defs") return Promise.resolve(FIELD_DEFS);
        if (resource === "field-type-defs") return Promise.resolve(FIELD_TYPES);
        if (resource === "sites") return Promise.resolve(SITES);
        return Promise.resolve([]);
      }),
      // Phase 5 Task 32 — the ip_assignment create/link flow and the
      // capability panel's read-only IP display exercise these.
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      // Phase 5 Task 34 — the credential panel's reveal/regenerate actions.
      revealCredential: vi.fn(),
      regenerateCredential: vi.fn(),
      // Phase 5 Task 39 — the automation tab. Defaults to "not configured"
      // so tests unrelated to automation (e.g. the credential-only ones,
      // which share the ansible_managed gate) don't need to care about it.
      automationStatus: vi.fn().mockResolvedValue({
        inventory_id: null,
        has_credential: false,
        configured: false,
        semaphore_url: null,
        project_id: null,
      }),
      automationTemplates: vi.fn().mockResolvedValue([]),
      launchAutomationTask: vi.fn(),
      getAutomationTask: vi.fn(),
      getAutomationTaskOutput: vi.fn(),
    },
  };
});

function wrap(typeSlug: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/entities/${typeSlug}`]}>
        <Routes>
          <Route path="/entities/:typeSlug" element={<GenericEntityView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  selectRowPayload = { id: 1, entity_type_id: 7 };
});

describe("GenericEntityView — synthetic type definition (Req 16.1/16.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("derives columns entirely from the type's Entity_Field_Defs, sorted by sort_order", async () => {
    wrap("monitor");
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "generic-entities")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "generic-entities");
    const fields = props.columns.filter((c: any) => c.field?.startsWith("attributes."));
    expect(fields.map((c: any) => c.field)).toEqual([
      "attributes.color",
      "attributes.screen_size",
      "attributes.owner_site",
    ]);
    // Required field gets a visual marker; the other entity type's field
    // ("other") never shows up.
    expect(fields[0].headerName).toBe("Color *");
    expect(fields[1].headerName).toBe("Screen Size");
    expect(props.columns.some((c: any) => c.field === "attributes.other")).toBe(false);
  });

  it("wires a numeric valueParser for a number-storage field", async () => {
    wrap("monitor");
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "generic-entities")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "generic-entities");
    const sizeCol = props.columns.find((c: any) => c.field === "attributes.screen_size");
    expect(sizeCol.valueParser({ newValue: "27" })).toBe(27);
    expect(sizeCol.valueParser({ newValue: "" })).toBeNull();
  });

  it("wires a reference dropdown resolved against the named target resource", async () => {
    wrap("monitor");
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "generic-entities")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "generic-entities");
    const ownerCol = props.columns.find((c: any) => c.field === "attributes.owner_site");
    expect(ownerCol.cellEditorParams.values).toEqual([null, 1]);
    expect(ownerCol.valueFormatter({ value: 1 })).toBe("hq-bogota-1");
  });

  it("seeds a new row with the entity_type_id and an empty attributes object", async () => {
    wrap("monitor");
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "generic-entities")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "generic-entities");
    expect(props.newRowDefaults()).toEqual({ entity_type_id: 7, attributes: {} });
  });

  it("scopes the grid to this entity type via externalFilter", async () => {
    wrap("monitor");
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "generic-entities")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "generic-entities");
    expect(props.externalFilter({ entity_type_id: 7 })).toBe(true);
    expect(props.externalFilter({ entity_type_id: 99 })).toBe(false);
  });

  it("shows a not-found message for an unknown type slug", async () => {
    wrap("does-not-exist");
    await waitFor(() =>
      expect(screen.getByText(/No Entity Type found/)).toBeTruthy()
    );
  });
});

describe("GenericEntityView — capability panel (Req 18.1/18.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("prompts to select a row before showing the photo manager", async () => {
    wrap("monitor");
    await waitFor(() => expect(screen.getByText(/Select a row to manage/)).toBeTruthy());
  });

  it("shows PhotoField for the selected row when the type has the photo capability", async () => {
    wrap("monitor");
    await screen.findByTestId("select-row");
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Upload photo")).toBeTruthy());
    // "monitor"'s capabilities are ["photo"] only — no stencil manager.
    expect(screen.queryByText("Stencil diagram")).toBeNull();
  });

  it("renders nothing for a type with neither photo nor stencil_diagram enabled", async () => {
    (api.list as any).mockImplementation((resource: string) => {
      if (resource === "entity-type-defs")
        return Promise.resolve([{ id: 8, slug: "plain", label: "Plain", capabilities: [] }]);
      if (resource === "entity-field-defs") return Promise.resolve([]);
      if (resource === "field-type-defs") return Promise.resolve(FIELD_TYPES);
      return Promise.resolve([]);
    });
    wrap("plain");
    await screen.findByTestId("select-row");
    expect(screen.queryByText(/Select a row to manage/)).toBeNull();
  });
});

describe("GenericEntityView — dual IP assignment (Req 26.1/26.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
    (api.list as any).mockImplementation((resource: string) => {
      if (resource === "entity-type-defs")
        return Promise.resolve([
          { id: 7, slug: "monitor", label: "Monitor", capabilities: ["ip_assignment"] },
        ]);
      if (resource === "entity-field-defs") return Promise.resolve([]);
      if (resource === "field-type-defs") return Promise.resolve(FIELD_TYPES);
      return Promise.resolve([]);
    });
  });

  it("hides EntityGrid's own '+ Add row' and shows the dual-IP create form instead", async () => {
    wrap("monitor");
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "generic-entities")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "generic-entities");
    expect(props.allowAdd).toBe(false);
    expect(await screen.findByPlaceholderText("Usage IP, e.g. 10.0.0.5")).toBeTruthy();
    expect(screen.getByPlaceholderText("Management IP, e.g. 10.0.1.5")).toBeTruthy();
  });

  it("creates both IP assignments, links them to a new record, and points them back at it", async () => {
    (api.create as any).mockImplementation((resource: string, payload: any) => {
      if (resource === "ip-assignments") {
        return Promise.resolve({ id: payload.is_primary ? 101 : 102, ...payload });
      }
      if (resource === "generic-entities") {
        return Promise.resolve({ id: 55, ...payload });
      }
      return Promise.resolve({});
    });
    (api.update as any).mockResolvedValue({});
    wrap("monitor");
    const usageInput = await screen.findByPlaceholderText("Usage IP, e.g. 10.0.0.5");
    const managementInput = screen.getByPlaceholderText("Management IP, e.g. 10.0.1.5");
    fireEvent.change(usageInput, { target: { value: "10.0.0.5" } });
    fireEvent.change(managementInput, { target: { value: "10.0.1.5" } });
    fireEvent.click(screen.getByText("Create record"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        "generic-entities",
        expect.objectContaining({ entity_type_id: 7, ip_id: 101, management_ip_id: 102 }),
      ),
    );
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("ip-assignments", 101, {
        assigned_to_type: "generic-entities",
        assigned_to_id: 55,
      }),
    );
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("ip-assignments", 102, {
        assigned_to_type: "generic-entities",
        assigned_to_id: 55,
      }),
    );
  });

  it("shows the selected record's linked usage/management IP addresses", async () => {
    (api.get as any).mockImplementation((_resource: string, id: number) => {
      if (id === 201) return Promise.resolve({ id: 201, ipv4_address: "10.0.0.5" });
      if (id === 202) return Promise.resolve({ id: 202, ipv4_address: "10.0.1.5" });
      return Promise.resolve(null);
    });
    selectRowPayload = { id: 1, entity_type_id: 7, ip_id: 201, management_ip_id: 202 };
    wrap("monitor");
    await screen.findByTestId("select-row");
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("10.0.0.5")).toBeTruthy());
    expect(screen.getByText("10.0.1.5")).toBeTruthy();
  });
});

describe("GenericEntityView — default admin credential (Req 28.2/28.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
    (api.list as any).mockImplementation((resource: string) => {
      if (resource === "entity-type-defs")
        return Promise.resolve([
          { id: 7, slug: "monitor", label: "Monitor", capabilities: ["ansible_managed"] },
        ]);
      if (resource === "entity-field-defs") return Promise.resolve([]);
      if (resource === "field-type-defs") return Promise.resolve(FIELD_TYPES);
      return Promise.resolve([]);
    });
  });

  it("mentions 'credential' in the pre-selection prompt for an ansible_managed type", async () => {
    wrap("monitor");
    await waitFor(() => expect(screen.getByText(/Select a row to manage/)).toBeTruthy());
    expect(screen.getByText(/credential/)).toBeTruthy();
  });

  it("shows CredentialField for the selected row when the type has the ansible_managed capability", async () => {
    selectRowPayload = {
      id: 1,
      entity_type_id: 7,
      admin_username: "admin",
      bw_secret_id: "secret-1",
    };
    wrap("monitor");
    await screen.findByTestId("select-row");
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Default admin credential")).toBeTruthy());
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.getByText("Reveal")).toBeTruthy();
    expect(screen.getByText("Regenerate")).toBeTruthy();
  });
});

describe("GenericEntityView — automation tab (Req 31.1/31.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
    (api.list as any).mockImplementation((resource: string) => {
      if (resource === "entity-type-defs")
        return Promise.resolve([
          { id: 7, slug: "monitor", label: "Monitor", capabilities: ["ansible_managed"] },
        ]);
      if (resource === "entity-field-defs") return Promise.resolve([]);
      if (resource === "field-type-defs") return Promise.resolve(FIELD_TYPES);
      return Promise.resolve([]);
    });
  });

  it("shows an unconfigured message when Semaphore isn't configured", async () => {
    selectRowPayload = { id: 1, entity_type_id: 7 };
    wrap("monitor");
    await screen.findByTestId("select-row");
    fireEvent.click(screen.getByTestId("select-row"));
    await waitFor(() => expect(screen.getByText("Automation")).toBeTruthy());
    expect(
      await screen.findByText(/Semaphore automation is not configured/),
    ).toBeTruthy();
  });

  it("shows the template picker once configured with a linked inventory", async () => {
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
    selectRowPayload = { id: 1, entity_type_id: 7 };
    wrap("monitor");
    await screen.findByTestId("select-row");
    fireEvent.click(screen.getByTestId("select-row"));
    expect(await screen.findByLabelText("Automation template")).toBeTruthy();
    expect(await screen.findByText("ping")).toBeTruthy();
    expect(screen.getByText("deploy")).toBeTruthy();
  });

  it("launches the selected template against this record's inventory and shows it in history", async () => {
    (api.automationStatus as any).mockResolvedValue({
      inventory_id: 9,
      has_credential: true,
      configured: true,
      semaphore_url: "http://semaphore.test",
      project_id: 3,
    });
    (api.automationTemplates as any).mockResolvedValue([{ id: 2, name: "deploy" }]);
    (api.launchAutomationTask as any).mockResolvedValue({
      id: 42,
      status: "waiting",
      template_id: 2,
    });
    (api.getAutomationTask as any).mockResolvedValue({ id: 42, status: "success" });
    (api.getAutomationTaskOutput as any).mockResolvedValue([
      { task_id: 42, time: "now", output: "done" },
    ]);
    selectRowPayload = { id: 1, entity_type_id: 7 };
    wrap("monitor");
    await screen.findByTestId("select-row");
    fireEvent.click(screen.getByTestId("select-row"));
    const select = await screen.findByLabelText("Automation template");
    // Wait for the async-loaded <option> to exist before firing change —
    // otherwise the change silently no-ops (same race learned in Task 30's
    // AirportCellEditor tests).
    await screen.findByText("deploy");
    fireEvent.change(select, { target: { value: "2" } });
    await waitFor(() => expect(screen.getByText("Launch")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Launch"));

    await waitFor(() =>
      expect(api.launchAutomationTask).toHaveBeenCalledWith("generic-entities", 1, 2),
    );
    await waitFor(() => expect(screen.getByText("#42")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("success")).toBeTruthy());

    const deepLink = await screen.findByText("Open in Semaphore");
    expect(deepLink.getAttribute("href")).toBe(
      "http://semaphore.test/project/3/history?t=42",
    );
  });

  it("does not link to Semaphore when no inventory is linked yet", async () => {
    (api.automationStatus as any).mockResolvedValue({
      inventory_id: null,
      has_credential: false,
      configured: true,
      semaphore_url: "http://semaphore.test",
      project_id: 3,
    });
    selectRowPayload = { id: 1, entity_type_id: 7 };
    wrap("monitor");
    await screen.findByTestId("select-row");
    fireEvent.click(screen.getByTestId("select-row"));
    expect(
      await screen.findByText(/No Semaphore inventory linked for this record yet/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Automation template")).toBeNull();
  });
});
