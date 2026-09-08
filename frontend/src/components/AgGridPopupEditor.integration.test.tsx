// Regression test — a real, unmocked AgGridReact grid with the exact grid
// options EntityGrid.tsx uses (singleClickEdit, cellEditorPopup,
// stopEditingWhenCellsLoseFocus). Unlike EntityGrid.test.tsx (which mocks
// AgGridReact entirely to test EntityGrid's own deferred row-data-sync
// logic in isolation), this exercises the REAL AG Grid runtime + a REAL
// popup cell editor together, because a bug reported from live browser
// testing ("clicking an option in the dropdown just closes the list, does
// not select") turned out to only reproduce with the real grid in the
// loop — a fireEvent.mouseDown straight on the editor component (as
// FuzzySelectEditor.test.tsx/IconPickerEditor.test.tsx do) never exercises
// AG Grid's own focus/stopEditing machinery at all, so it couldn't have
// caught this class of bug.
//
// Root cause: AG Grid's cellEditor commit path (getValue() read when
// stopEditing() is called) depends on focus successfully round-tripping
// through the popup's own detached DOM subtree; `stopEditingWhenCellsLose
// Focus` can race that and discard the pending selection. The fix in
// FuzzySelectEditor.tsx/IconPickerEditor.tsx/AirportCellEditor.tsx writes
// the value straight into the row via `node.setDataValue()` on click,
// independent of that handshake — this test asserts `onCellValueChanged`
// fires with the right value after clicking an option, which is exactly
// what that fix guarantees regardless of any focus timing.
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgGridReact } from "ag-grid-react";
import FuzzySelectEditor from "./FuzzySelectEditor";
import IconPickerEditor from "./IconPickerEditor";

async function clickCellThenOption(
  container: HTMLElement,
  findByText: (text: string) => Promise<HTMLElement>,
  colId: string,
  optionText: string
) {
  const user = userEvent.setup();
  await waitFor(() => {
    expect(container.querySelector(".ag-cell")).toBeTruthy();
  });
  const cell = container.querySelector(`.ag-cell[col-id="${colId}"]`) as HTMLElement;
  expect(cell).toBeTruthy();
  await user.click(cell);
  const option = await findByText(optionText);
  await user.click(option);
}

describe("real AgGridReact + custom popup cell editors — commit on click", () => {
  it("FuzzySelectEditor: clicking an option commits its value via the grid API", async () => {
    const onCellValueChanged = vi.fn();
    const { container, findByText } = render(
      <div style={{ width: 400, height: 200 }} className="ag-theme-quartz">
        <AgGridReact
          rowData={[{ id: 1, status: null }]}
          columnDefs={[
            { field: "id" },
            {
              field: "status",
              editable: true,
              cellEditor: FuzzySelectEditor,
              cellEditorPopup: true,
              cellEditorParams: { values: ["active", "reserved", "deprecated"] },
            },
          ]}
          getRowId={(p) => String(p.data.id)}
          stopEditingWhenCellsLoseFocus
          singleClickEdit
          domLayout="normal"
          onCellValueChanged={onCellValueChanged}
        />
      </div>
    );

    await clickCellThenOption(container, findByText, "status", "reserved");

    await waitFor(() => expect(onCellValueChanged).toHaveBeenCalled());
    expect(
      onCellValueChanged.mock.calls.some((c) => c[0].newValue === "reserved")
    ).toBe(true);
  });

  it("IconPickerEditor: clicking an option commits its value via the grid API", async () => {
    const onCellValueChanged = vi.fn();
    const { container, findByText } = render(
      <div style={{ width: 400, height: 200 }} className="ag-theme-quartz">
        <AgGridReact
          rowData={[{ id: 1, icon: null }]}
          columnDefs={[
            { field: "id" },
            {
              field: "icon",
              editable: true,
              cellEditor: IconPickerEditor,
              cellEditorPopup: true,
            },
          ]}
          getRowId={(p) => String(p.data.id)}
          stopEditingWhenCellsLoseFocus
          singleClickEdit
          domLayout="normal"
          onCellValueChanged={onCellValueChanged}
        />
      </div>
    );

    await clickCellThenOption(container, findByText, "icon", "Server");

    await waitFor(() => expect(onCellValueChanged).toHaveBeenCalled());
    expect(
      onCellValueChanged.mock.calls.some((c) => c[0].newValue === "Server")
    ).toBe(true);
  });
});
