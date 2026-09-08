// Naming-convention modifications (item 5) — OsNameEditor: curated OS-name
// suggestions with a free-text fallback (unlike FuzzySelectEditor's closed
// list), mirroring IconPickerEditor.test.tsx's established test shape.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import OsNameEditor from "./OsNameEditor";

function baseProps(extra: Partial<any> = {}) {
  return {
    value: null,
    api: { stopEditing: vi.fn() },
    node: { setDataValue: vi.fn() },
    column: "full_name",
    ...extra,
  } as any;
}

describe("OsNameEditor", () => {
  it("shows every suggestion when the query is empty", () => {
    render(<OsNameEditor {...baseProps()} ref={createRef()} />);
    expect(screen.getByText("Android")).toBeInTheDocument();
    expect(screen.getByText("Ubuntu")).toBeInTheDocument();
  });

  it("narrows suggestions as the operator types a fuzzy query", () => {
    render(<OsNameEditor {...baseProps()} ref={createRef()} />);
    const input = screen.getByPlaceholderText("Type or search a well-known OS name…");
    fireEvent.change(input, { target: { value: "andr" } });
    expect(screen.getByText("Android")).toBeInTheDocument();
    expect(screen.queryByText("Ubuntu")).not.toBeInTheDocument();
  });

  it("commits a clicked suggestion via the grid API immediately", () => {
    const ref = createRef<any>();
    const setDataValue = vi.fn();
    const stopEditing = vi.fn();
    render(
      <OsNameEditor
        {...baseProps({ api: { stopEditing }, node: { setDataValue } })}
        ref={ref}
      />
    );
    fireEvent.mouseDown(screen.getByText("Android"));
    expect(ref.current.getValue()).toBe("Android");
    expect(setDataValue).toHaveBeenCalledWith("full_name", "Android");
  });

  it("commits free-typed text not on the curated list when Enter is pressed", () => {
    const ref = createRef<any>();
    const setDataValue = vi.fn();
    render(<OsNameEditor {...baseProps({ node: { setDataValue } })} ref={ref} />);
    const input = screen.getByPlaceholderText("Type or search a well-known OS name…");
    fireEvent.change(input, { target: { value: "HomebrewOS 9000" } });
    expect(screen.getByText(/No suggestions match/)).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(ref.current.getValue()).toBe("HomebrewOS 9000");
    expect(setDataValue).toHaveBeenCalledWith("full_name", "HomebrewOS 9000");
  });

  it("Enter commits the highlighted suggestion when the query is empty, not nothing", () => {
    const setDataValue = vi.fn();
    render(<OsNameEditor {...baseProps({ node: { setDataValue } })} ref={createRef()} />);
    const input = screen.getByPlaceholderText("Type or search a well-known OS name…");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(setDataValue).toHaveBeenCalledTimes(1);
    expect(typeof setDataValue.mock.calls[0][1]).toBe("string");
  });

  it("pre-fills the input with the cell's current value", () => {
    render(<OsNameEditor {...baseProps({ value: "Ubuntu" })} ref={createRef()} />);
    expect(screen.getByDisplayValue("Ubuntu")).toBeInTheDocument();
  });
});
