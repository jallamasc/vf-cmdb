import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CountryFlag, { countryIso2 } from "./countryFlags";

describe("countryIso2", () => {
  it("resolves a known country name, case/accent-insensitively", () => {
    expect(countryIso2("Colombia")).toBe("co");
    expect(countryIso2("COLOMBIA")).toBe("co");
  });

  it("returns null for an unrecognised or missing country", () => {
    expect(countryIso2("Not A Real Country")).toBeNull();
    expect(countryIso2(null)).toBeNull();
    expect(countryIso2(undefined)).toBeNull();
    expect(countryIso2("")).toBeNull();
  });
});

describe("CountryFlag", () => {
  it("renders an <img> for a known country", () => {
    const { container } = render(<CountryFlag country="Canada" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("title")).toBe("Canada");
  });

  it("renders nothing for an unrecognised country", () => {
    const { container } = render(<CountryFlag country="Narnia" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
