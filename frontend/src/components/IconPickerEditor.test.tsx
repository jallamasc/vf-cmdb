// Phase 6 Task 10 (Req 4.2) — IconPickerEditor: fuzzy filter + live preview +
// commit-on-select, mirroring FuzzySelectEditor's established test shape.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import IconPickerEditor from "./IconPickerEditor";

function baseProps(extra: Partial<any> = {}) {
  return {
    value: null,
    api: { stopEditing: vi.fn() },
    ...extra,
  } as any;
}

describe("IconPickerEditor", () => {
  it("shows a searchable list including a clear ('no icon') option", () => {
    render(<IconPickerEditor {...baseProps()} ref={createRef()} />);
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.getByText("— no icon —")).toBeInTheDocument();
  });

  it("narrows options as the operator types a fuzzy query", () => {
    render(<IconPickerEditor {...baseProps()} ref={createRef()} />);
    const input = screen.getByPlaceholderText("Search icons…");
    fireEvent.change(input, { target: { value: "server" } });
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.queryByText("Router")).toBeNull();
  });

  it("renders a live SVG preview next to each candidate", () => {
    render(<IconPickerEditor {...baseProps()} ref={createRef()} />);
    const option = screen.getByText("Server").closest("li");
    expect(option?.querySelector("svg")).toBeTruthy();
  });

  it("commits the selected icon name and stops editing", async () => {
    const ref = createRef<any>();
    const stopEditing = vi.fn();
    render(<IconPickerEditor {...baseProps({ api: { stopEditing } })} ref={ref} />);
    fireEvent.mouseDown(screen.getByText("Router"));
    expect(ref.current.getValue()).toBe("Router");
    await new Promise((r) => setTimeout(r, 0));
    expect(stopEditing).toHaveBeenCalled();
  });

  it("respects clearable=false by hiding the 'no icon' option", () => {
    render(<IconPickerEditor {...baseProps({ clearable: false })} ref={createRef()} />);
    expect(screen.queryByText("— no icon —")).toBeNull();
  });
});
