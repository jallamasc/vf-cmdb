// Phase 4 Task 16 — BreadcrumbNav: renders every level, narrows on change.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BreadcrumbNav, { ALL } from "./BreadcrumbNav";

describe("BreadcrumbNav", () => {
  it("renders one dropdown per level with its label", () => {
    render(
      <BreadcrumbNav
        levels={[
          { key: "site", label: "Site", value: ALL, allLabel: "All Sites", options: [{ id: 1, label: "Home" }], onChange: vi.fn() },
          { key: "rack", label: "Rack", value: ALL, allLabel: "All Racks", options: [{ id: 2, label: "AA01" }], onChange: vi.fn() },
        ]}
      />
    );
    expect(screen.getByText("Site")).toBeInTheDocument();
    expect(screen.getByText("Rack")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("AA01")).toBeInTheDocument();
  });

  it("calls onChange with the selected id when a level changes", () => {
    const onChange = vi.fn();
    render(
      <BreadcrumbNav
        levels={[
          { key: "site", label: "Site", value: ALL, allLabel: "All Sites", options: [{ id: 1, label: "Home" }], onChange },
        ]}
      />
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("calls onChange with ALL when 'All ...' is selected", () => {
    const onChange = vi.fn();
    render(
      <BreadcrumbNav
        levels={[
          { key: "site", label: "Site", value: 1, allLabel: "All Sites", options: [{ id: 1, label: "Home" }], onChange },
        ]}
      />
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: ALL } });
    expect(onChange).toHaveBeenCalledWith(ALL);
  });

  it("disables a level when asked to", () => {
    render(
      <BreadcrumbNav
        levels={[
          { key: "site", label: "Site", value: ALL, allLabel: "All Sites", options: [], onChange: vi.fn(), disabled: true },
        ]}
      />
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
