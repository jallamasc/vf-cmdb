// Phase 5 Task 20 — GenericEntityView against a synthetic type definition.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GenericEntityView from "./GenericEntityView";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return <div data-testid="entity-grid">{props.resource}</div>;
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
