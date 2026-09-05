// Phase 4 Task 5 — FuzzySelectEditor: fuzzy filter + commit-on-select.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import FuzzySelectEditor, { FuzzySelectEditorParams } from "./FuzzySelectEditor";

function baseProps(overrides: Partial<FuzzySelectEditorParams> = {}): FuzzySelectEditorParams {
  return {
    values: [1, 2, 3],
    formatOption: (v) => ({ 1: "Switch", 2: "Router", 3: "Firewall" }[v as number] ?? String(v)),
    value: null,
    api: { stopEditing: vi.fn() } as any,
    ...overrides,
  } as FuzzySelectEditorParams;
}

describe("FuzzySelectEditor", () => {
  it("shows every option when the query is empty", () => {
    render(<FuzzySelectEditor {...baseProps()} ref={createRef()} />);
    expect(screen.getByText("Switch")).toBeInTheDocument();
    expect(screen.getByText("Router")).toBeInTheDocument();
    expect(screen.getByText("Firewall")).toBeInTheDocument();
  });

  it("narrows options as the operator types a fuzzy query", () => {
    render(<FuzzySelectEditor {...baseProps()} ref={createRef()} />);
    const input = screen.getByPlaceholderText("Type to search…");
    fireEvent.change(input, { target: { value: "rt" } }); // matches "Router"
    expect(screen.getByText("Router")).toBeInTheDocument();
    expect(screen.queryByText("Switch")).not.toBeInTheDocument();
  });

  it("commits the selected option's value and stops editing", async () => {
    const ref = createRef<any>();
    const stopEditing = vi.fn();
    render(<FuzzySelectEditor {...baseProps({ api: { stopEditing } as any })} ref={ref} />);
    fireEvent.mouseDown(screen.getByText("Router"));
    expect(ref.current.getValue()).toBe(2);
    // stopEditing is deferred to the next tick.
    await new Promise((r) => setTimeout(r, 0));
    expect(stopEditing).toHaveBeenCalled();
  });

  it("shows a 'no matches' message when nothing fuzzy-matches", () => {
    render(<FuzzySelectEditor {...baseProps()} ref={createRef()} />);
    const input = screen.getByPlaceholderText("Type to search…");
    fireEvent.change(input, { target: { value: "zzzzz" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });
});
