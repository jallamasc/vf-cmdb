// Phase 5 Task 2 — EntityGrid: an in-progress cell edit must survive an
// unrelated save landing on the same row (the Patch Panel/Power "typed data
// disappears" bug). `AgGridReact` is mocked so the test exercises EntityGrid's
// own deferred row-data-sync logic directly, instead of depending on AG-Grid
// actually rendering/measuring a real grid in a DOM-less test environment.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, waitFor, act, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EntityGrid, { friendlyError } from "./EntityGrid";
import { api } from "../api";

let latestGridProps: any = null;
let fakeEditingCells: unknown[] = [];
let fakeRowNodes: Record<string, any> = {};

vi.mock("ag-grid-react", () => ({
  AgGridReact: React.forwardRef((props: any, ref: any) => {
    latestGridProps = props;
    React.useImperativeHandle(ref, () => ({
      api: {
        getEditingCells: () => fakeEditingCells,
        getSelectedRows: () => [],
        autoSizeAllColumns: () => {},
        onFilterChanged: () => {},
        getRowNode: (id: string) => fakeRowNodes[id],
      },
    }));
    return null;
  }),
}));

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const COLUMNS = [
  { field: "rack_id", headerName: "Rack" },
  { field: "panel_id_label", headerName: "Panel ID" },
];

describe("EntityGrid — grid edit integrity (Req 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestGridProps = null;
    fakeEditingCells = [];
  });

  it("defers the rowData sync while a cell is being edited, then flushes once editing stops", async () => {
    (api.list as any).mockResolvedValue([
      { id: 1, rack_id: null, panel_id_label: null },
    ]);

    let resolveUpdate: (v: unknown) => void = () => {};
    (api.update as any).mockImplementation(
      () => new Promise((resolve) => (resolveUpdate = resolve))
    );

    wrap(<EntityGrid resource="patch-panels" title="Patch Panels" columns={COLUMNS} />);

    await waitFor(() => expect(latestGridProps?.rowData).toEqual([
      { id: 1, rack_id: null, panel_id_label: null },
    ]));

    // Cell A (rack_id) is saved — this is the mutation that will later
    // resolve while the user is still typing into a different cell.
    await act(async () => {
      latestGridProps.onCellValueChanged({
        colDef: { field: "rack_id" },
        data: { id: 1, rack_id: "AA01", panel_id_label: null },
        newValue: "AA01",
      });
    });

    // The user has now clicked into Panel ID and is mid-edit when the rack_id
    // save resolves.
    fakeEditingCells = [{ column: { getColId: () => "panel_id_label" }, rowIndex: 0 }];
    await act(async () => {
      resolveUpdate({});
    });
    // Let the mutation's onSuccess (cache patch) + the resulting re-render settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The row data handed to the grid must NOT have moved yet — otherwise
    // AG-Grid would discard the in-progress Panel ID edit.
    expect(latestGridProps.rowData).toEqual([
      { id: 1, rack_id: null, panel_id_label: null },
    ]);

    // The user finishes editing Panel ID; AG-Grid fires cellEditingStopped.
    fakeEditingCells = [];
    await act(async () => {
      latestGridProps.onCellEditingStopped();
    });

    // Now the deferred sync flushes and the grid catches up to the saved value.
    await waitFor(() =>
      expect(latestGridProps.rowData).toEqual([
        { id: 1, rack_id: "AA01", panel_id_label: null },
      ])
    );
  });

  it("ANDs externalFilter with the fuzzy search box (Req 9.2)", async () => {
    (api.list as any).mockResolvedValue([
      { id: 1, rack_id: "A", panel_id_label: "keep" },
      { id: 2, rack_id: "B", panel_id_label: "drop" },
    ]);

    wrap(
      <EntityGrid
        resource="patch-panels"
        title="Patch Panels"
        columns={COLUMNS}
        externalFilter={(row) => row.rack_id === "A"}
      />
    );
    await waitFor(() => expect(latestGridProps?.rowData?.length).toBe(2));

    expect(latestGridProps.isExternalFilterPresent()).toBe(true);
    expect(
      latestGridProps.doesExternalFilterPass({ data: { id: 1, rack_id: "A" } })
    ).toBe(true);
    expect(
      latestGridProps.doesExternalFilterPass({ data: { id: 2, rack_id: "B" } })
    ).toBe(false);
  });

  it("syncs immediately when no cell is being edited", async () => {
    (api.list as any).mockResolvedValue([
      { id: 1, rack_id: null, panel_id_label: null },
    ]);
    (api.update as any).mockResolvedValue({});

    wrap(<EntityGrid resource="patch-panels" title="Patch Panels" columns={COLUMNS} />);
    await waitFor(() => expect(latestGridProps?.rowData).toBeTruthy());

    fakeEditingCells = [];
    await act(async () => {
      latestGridProps.onCellValueChanged({
        colDef: { field: "rack_id" },
        data: { id: 1, rack_id: "AA01", panel_id_label: null },
        newValue: "AA01",
      });
    });

    await waitFor(() =>
      expect(latestGridProps.rowData).toEqual([
        { id: 1, rack_id: "AA01", panel_id_label: null },
      ])
    );
  });
});

describe("EntityGrid — auto-select a freshly created row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestGridProps = null;
    fakeEditingCells = [];
    fakeRowNodes = {};
  });

  // Bug fix — "adding a new entity creates a row under a white space, is
  // this normal?" Root cause: a new row was never selected, so a
  // selection-driven panel above the grid kept showing its empty
  // placeholder. The new row must be selected as soon as it lands in
  // rowData, so any onSelectionChanged-driven panel opens immediately.
  it("selects the newly created row once it appears in rowData, firing onSelectionChanged", async () => {
    const row1 = { id: 1, rack_id: "A", panel_id_label: "p1" };
    const row2 = { id: 2, rack_id: null, panel_id_label: null };
    (api.list as any)
      .mockResolvedValueOnce([row1])
      .mockResolvedValue([row1, row2]);
    (api.create as any).mockResolvedValue(row2);

    const setSelected = vi.fn();
    fakeRowNodes["2"] = { setSelected };
    const onSelectionChanged = vi.fn();

    wrap(
      <EntityGrid
        resource="patch-panels"
        title="Patch Panels"
        columns={COLUMNS}
        onSelectionChanged={onSelectionChanged}
      />
    );
    await waitFor(() => expect(latestGridProps?.rowData?.length).toBe(1));

    fireEvent.click(screen.getByText("+ Add row"));

    await waitFor(() => expect(setSelected).toHaveBeenCalledWith(true, true));
  });

  it("does not blow up when the created row is not (yet) rendered by the grid", async () => {
    const row1 = { id: 1, rack_id: "A", panel_id_label: "p1" };
    const row2 = { id: 2, rack_id: null, panel_id_label: null };
    (api.list as any).mockResolvedValue([row1, row2]);
    (api.create as any).mockResolvedValue(row2);
    // Deliberately leave fakeRowNodes empty — getRowNode returns undefined.

    wrap(<EntityGrid resource="patch-panels" title="Patch Panels" columns={COLUMNS} />);
    await waitFor(() => expect(latestGridProps?.rowData?.length).toBeGreaterThan(0));

    expect(() => fireEvent.click(screen.getByText("+ Add row"))).not.toThrow();
  });
});

describe("friendlyError — duplicate-name 409s (Phase 6 Task 7, Req 3.4)", () => {
  it("passes a table-wide duplicate-name message through cleanly", () => {
    const raw = "409: 'Virtualfactor' already exists. Please choose a different name.";
    expect(friendlyError(raw)).toBe(
      "'Virtualfactor' already exists. Please choose a different name."
    );
  });

  it("passes a parent-scoped duplicate-name message through cleanly", () => {
    const raw =
      "409: 'Ground Floor' already exists under the same parent. Please choose a different name.";
    expect(friendlyError(raw)).toBe(
      "'Ground Floor' already exists under the same parent. Please choose a different name."
    );
  });
});
