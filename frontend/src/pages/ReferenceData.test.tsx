// Phase 5 Task 15 — Field Types admin panel added to ReferenceData.tsx.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReferenceData from "./ReferenceData";
import { api } from "../api";

let capturedProps: any[] = [];

vi.mock("../components/EntityGrid", () => ({
  default: (props: any) => {
    capturedProps.push(props);
    return <div data-testid="entity-grid">{props.resource}</div>;
  },
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: { ...actual.api, list: vi.fn().mockResolvedValue([]) },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("ReferenceData — Field Types panel (Req 11.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps = [];
  });

  it("switches to the field-type-defs resource with a storage-kind picker column", async () => {
    wrap(<ReferenceData />);
    await waitFor(() => expect(screen.getByText("Field Types")).toBeTruthy());
    fireEvent.click(screen.getByText("Field Types"));

    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "field-type-defs")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "field-type-defs");
    const names = props.columns.map((c: any) => c.headerName);
    expect(names).toContain("Storage Kind");
    expect(names).toContain("Builtin");
  });

  it("generates a unique slug default for a new field type row", async () => {
    wrap(<ReferenceData />);
    await waitFor(() => expect(screen.getByText("Field Types")).toBeTruthy());
    fireEvent.click(screen.getByText("Field Types"));
    await waitFor(() =>
      expect(capturedProps.some((p) => p.resource === "field-type-defs")).toBe(true)
    );
    const props = capturedProps.find((p) => p.resource === "field-type-defs");
    const defaults =
      typeof props.newRowDefaults === "function" ? props.newRowDefaults() : props.newRowDefaults;
    expect(defaults.slug).toMatch(/^custom-/);
    expect(defaults.storage_kind).toBe("text");
  });
});
