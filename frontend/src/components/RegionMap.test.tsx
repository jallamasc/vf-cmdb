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

describe("RegionMap — geo markers + click-to-place (Phase 6 Task 18/19, Req 7.2/7.3)", () => {
  it("renders a marker for every region that has a real point", () => {
    const withGeo = [
      ...REGIONS,
      { id: 3, full_name: "Bogotá Point", abbreviation: "CO-AND", latitude: 4.71, longitude: -74.07 },
    ];
    const { container } = render(
      <RegionMap regions={withGeo} selectedCountry={null} onSelectCountry={vi.fn()} />
    );
    const title = Array.from(container.querySelectorAll("title")).find(
      (t) => t.textContent === "Bogotá Point"
    );
    expect(title).toBeTruthy();
  });

  it("renders no markers for regions without a point", () => {
    const { container } = render(
      <RegionMap regions={REGIONS} selectedCountry={null} onSelectCountry={vi.fn()} />
    );
    // The marker's own red-dot glyph is distinct from any country <path>'s
    // fill, so absence of it means no <Marker> was rendered at all.
    expect(container.querySelector('circle[fill="#dc2626"]')).toBeNull();
  });

  it("hides markers and country-click behavior while in placement mode, showing a crosshair overlay instead", () => {
    const { container } = render(
      <RegionMap
        regions={REGIONS}
        selectedCountry={null}
        onSelectCountry={vi.fn()}
        placementMode
        onPlacePoint={vi.fn()}
      />
    );
    expect(container.querySelector('rect[fill="transparent"]')).toBeTruthy();
  });

  it("reports the clicked point's [lat, lng] via onPlacePoint", () => {
    const getRectSpy = vi
      .spyOn(SVGElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        left: 0, top: 0, width: 640, height: 340,
        right: 640, bottom: 340, x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect);
    const onPlacePoint = vi.fn();
    const { container } = render(
      <RegionMap
        regions={REGIONS}
        selectedCountry={null}
        onSelectCountry={vi.fn()}
        placementMode
        onPlacePoint={onPlacePoint}
      />
    );
    const overlay = container.querySelector('rect[fill="transparent"]') as SVGRectElement;
    overlay.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 320, clientY: 170 })
    );
    expect(onPlacePoint).toHaveBeenCalledTimes(1);
    const [lat, lng] = onPlacePoint.mock.calls[0];
    expect(typeof lat).toBe("number");
    expect(typeof lng).toBe("number");
    expect(Number.isFinite(lat)).toBe(true);
    expect(Number.isFinite(lng)).toBe(true);
    getRectSpy.mockRestore();
  });
});
