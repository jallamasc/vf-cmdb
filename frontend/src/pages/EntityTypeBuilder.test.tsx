// Phase 5 Task 19 — Entity Type Builder: create-type-with-fields flow.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EntityTypeBuilder from "./EntityTypeBuilder";
import { api } from "../api";

let capturedProps: any[] = [];

// EntityGrid is mocked so the test drives it directly instead of needing a
// real AG-Grid render (same approach as ReferenceData.test.tsx), but the
// mock also renders `props.panel` and exposes an `onSelectionChanged`
// trigger button, since this flow is specifically about what the detail
// panel does once an Entity Type row is selected.
vi.mock("../components/EntityGrid", () => {
  const mock = (props: any) => {
    capturedProps.push(props);
    return (
      <div data-testid={`entity-grid-${props.resource}`}>
        <button
          data-testid={`select-${props.resource}`}
          onClick={() =>
            props.onSelectionChanged?.([
              { id: 1, slug: "monitor", label: "Monitor", capabilities: ["photo"] },
            ])
          }
        >
          select row
        </button>
        {props.panel}
      </div>
    );
  };
  return {
    default: mock,
    friendlyError: (msg: string) => msg,
  };
});

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("EntityTypeBuilder — create-type-with-fields flow (Req 15.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("seeds a unique slug + empty capabilities default for a new Entity Type row", () => {
    wrap(<EntityTypeBuilder />);
    const props = capturedProps.find((p) => p.resource === "entity-type-defs");
    const defaults =
      typeof props.newRowDefaults === "function" ? props.newRowDefaults() : props.newRowDefaults;
    expect(defaults.slug).toMatch(/^entity-type-/);
    expect(defaults.capabilities).toEqual([]);
  });

  it("shows a placeholder panel when nothing is selected", () => {
    wrap(<EntityTypeBuilder />);
    expect(screen.getByText(/select an Entity Type above/i)).toBeTruthy();
  });

  it("renders capability toggles pre-checked from the selected row, and a fields grid scoped to it", async () => {
    wrap(<EntityTypeBuilder />);
    fireEvent.click(screen.getByTestId("select-entity-type-defs"));

    await waitFor(() =>
      expect(screen.getByText(/Capabilities for “Monitor”/)).toBeTruthy()
    );

    const photoCheckbox = screen.getByLabelText("Photo") as HTMLInputElement;
    expect(photoCheckbox.checked).toBe(true);
    const rackCheckbox = screen.getByLabelText("Rack placement") as HTMLInputElement;
    expect(rackCheckbox.checked).toBe(false);

    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "entity-field-defs")).toBe(true)
    );
    const fieldsProps = capturedProps.find((p) => p.resource === "entity-field-defs");
    const fieldDefaults = fieldsProps.newRowDefaults();
    expect(fieldDefaults.entity_type_id).toBe(1);
    expect(fieldsProps.externalFilter({ entity_type_id: 1 })).toBe(true);
    expect(fieldsProps.externalFilter({ entity_type_id: 2 })).toBe(false);
  });

  // Bug fix — "only slug and label are not enough fields to create a type
  // of devices." Capabilities/Fields summary columns surface what's
  // configured in the panel without a click into it.
  it("summarizes capabilities and counts custom fields directly in the grid", async () => {
    (api.list as any).mockImplementation((resource: string) =>
      resource === "entity-field-defs"
        ? Promise.resolve([
            { id: 1, entity_type_id: 1, key: "a" },
            { id: 2, entity_type_id: 1, key: "b" },
            { id: 3, entity_type_id: 2, key: "c" },
          ])
        : Promise.resolve([])
    );
    wrap(<EntityTypeBuilder />);
    const latestColumns = () =>
      capturedProps.filter((p) => p.resource === "entity-type-defs").pop().columns;
    const fieldsCol = () => latestColumns().find((c: any) => c.colId === "fields_count");

    await waitFor(() => expect(fieldsCol().valueGetter({ data: { id: 1 } })).toBe(2));
    expect(fieldsCol().valueGetter({ data: { id: 2 } })).toBe(1);
    expect(fieldsCol().valueGetter({ data: { id: 999 } })).toBe(0);

    const capsCol = latestColumns().find((c: any) => c.colId === "capabilities_summary");
    expect(capsCol.valueGetter({ data: { capabilities: ["photo", "rack_placement"] } })).toBe(
      "Photo, Rack placement"
    );
    expect(capsCol.valueGetter({ data: { capabilities: [] } })).toBe("");
  });

  it("toggling a capability enables Save, and saving PATCHes the full capability list", async () => {
    wrap(<EntityTypeBuilder />);
    fireEvent.click(screen.getByTestId("select-entity-type-defs"));
    await waitFor(() =>
      expect(screen.getByText(/Capabilities for “Monitor”/)).toBeTruthy()
    );

    const saveBtn = screen.getByText("Save capabilities");
    expect(saveBtn).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Rack placement"));
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith("entity-type-defs", 1, {
        capabilities: ["photo", "rack_placement"],
      })
    );
  });
});
