// Phase 5 Task 11 — RegionMap: renders, highlights covered countries, click
// routing (select/toggle-off), never allows clicking an unmapped country.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import RegionMap from "./RegionMap";

const REGIONS = [
  { id: 1, full_name: "Región Central", abbreviation: "CO-CTR" },
  { id: 2, full_name: "Canada", abbreviation: "CAN" },
];

function findGeographyByTitle(container: HTMLElement, name: string) {
  const titles = Array.from(container.querySelectorAll("title"));
  const title = titles.find((t) => t.textContent === name);
  return title?.closest("path");
}

describe("RegionMap", () => {
  it("renders an svg map", () => {
    const { container } = render(
      <RegionMap regions={REGIONS} selectedCountry={null} onSelectCountry={vi.fn()} />
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("selects a highlighted country on click", () => {
    const onSelectCountry = vi.fn();
    const { container } = render(
      <RegionMap regions={REGIONS} selectedCountry={null} onSelectCountry={onSelectCountry} />
    );
    const colombia = findGeographyByTitle(container, "Colombia");
    expect(colombia).toBeTruthy();
    colombia!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectCountry).toHaveBeenCalledWith("Colombia");
  });

  it("clears the selection when the already-selected country is clicked again", () => {
    const onSelectCountry = vi.fn();
    const { container } = render(
      <RegionMap regions={REGIONS} selectedCountry="Colombia" onSelectCountry={onSelectCountry} />
    );
    const colombia = findGeographyByTitle(container, "Colombia");
    colombia!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectCountry).toHaveBeenCalledWith(null);
  });

  it("does nothing when a non-highlighted country is clicked", () => {
    const onSelectCountry = vi.fn();
    const { container } = render(
      <RegionMap regions={REGIONS} selectedCountry={null} onSelectCountry={onSelectCountry} />
    );
    // France isn't covered by either seeded region in this test's fixture.
    const france = findGeographyByTitle(container, "France");
    expect(france).toBeTruthy();
    france!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectCountry).not.toHaveBeenCalled();
  });

  it("shows a Clear control only when a country is selected", () => {
    const { queryByText, rerender } = render(
      <RegionMap regions={REGIONS} selectedCountry={null} onSelectCountry={vi.fn()} />
    );
    expect(queryByText(/Clear/)).toBeNull();
    rerender(
      <RegionMap regions={REGIONS} selectedCountry="Canada" onSelectCountry={vi.fn()} />
    );
    expect(queryByText(/Clear/)).toBeTruthy();
  });
});
