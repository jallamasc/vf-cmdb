import { describe, it, expect } from "vitest";
import {
  countriesForRegion,
  allMappedCountries,
  regionAbbreviationsForCountry,
} from "./regionGeo";

describe("countriesForRegion", () => {
  it("resolves every Colombia region to Colombia", () => {
    for (const abbr of ["CO-CTR", "CO-CAR", "CO-PAC", "CO-AND", "CO-ORI", "CO-AMZ"]) {
      expect(countriesForRegion(abbr)).toEqual(["Colombia"]);
    }
  });

  it("resolves NAEAST and NAWEST to the same country (no state-level topology)", () => {
    expect(countriesForRegion("NAEAST")).toEqual(["United States of America"]);
    expect(countriesForRegion("NAWEST")).toEqual(["United States of America"]);
  });

  it("returns an empty array for an unmapped abbreviation", () => {
    expect(countriesForRegion("NOT-A-REGION")).toEqual([]);
  });
});

describe("allMappedCountries", () => {
  it("includes every country referenced by any region", () => {
    const set = allMappedCountries();
    expect(set.has("Colombia")).toBe(true);
    expect(set.has("Canada")).toBe(true);
    expect(set.has("Brazil")).toBe(true);
  });
});

describe("regionAbbreviationsForCountry", () => {
  it("returns every region abbreviation covering the clicked country", () => {
    const abbrs = ["CO-CTR", "CO-CAR", "CO-PAC", "CO-AND", "CO-ORI", "CO-AMZ", "CAN"];
    const result = regionAbbreviationsForCountry("Colombia", abbrs);
    expect(result.sort()).toEqual(
      ["CO-AMZ", "CO-AND", "CO-CAR", "CO-CTR", "CO-ORI", "CO-PAC"].sort()
    );
  });

  it("returns an empty array when no region covers the country", () => {
    expect(regionAbbreviationsForCountry("France", ["CAN", "MEX-CA"])).toEqual([]);
  });
});
