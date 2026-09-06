// Phase 5 Task 11 — Region map (Req 9).
//
// The seeded Region set (`backend/app/seed.py`) is Colombia's 6 natural
// regions plus 6 broad Americas regions — sub-national geography for
// Colombia, but the bundled world atlas (`world-atlas`'s `countries-110m`,
// a *country*-outline topology) can only render at country granularity.
// So this is a deliberate, documented approximation: every Colombia region
// highlights the single country "Colombia", and the broad Americas regions
// each highlight the country/countries most associated with that label.
// NAEAST and NAWEST both resolve to the same country (the US) since there is
// no state-level topology bundled — clicking either highlights the same
// area, which is expected, not a bug.
//
// Country names below match `properties.name` in world-atlas's
// countries-110m.json exactly (confirmed against the bundled file).
export const REGION_COUNTRIES: Record<string, string[]> = {
  "CO-CTR": ["Colombia"],
  "CO-CAR": ["Colombia"],
  "CO-PAC": ["Colombia"],
  "CO-AND": ["Colombia"],
  "CO-ORI": ["Colombia"],
  "CO-AMZ": ["Colombia"],
  NAEAST: ["United States of America"],
  NAWEST: ["United States of America"],
  CAN: ["Canada"],
  "MEX-CA": ["Mexico"],
  CAR: [
    "Cuba",
    "Jamaica",
    "Dominican Rep.",
    "Haiti",
    "Bahamas",
    "Puerto Rico",
    "Trinidad and Tobago",
  ],
  "LATAM-S": [
    "Brazil",
    "Argentina",
    "Chile",
    "Peru",
    "Bolivia",
    "Ecuador",
    "Venezuela",
    "Paraguay",
    "Uruguay",
    "Guyana",
    "Suriname",
  ],
};

/** Countries to highlight for a given region abbreviation (empty if unmapped). */
export function countriesForRegion(abbreviation: string): string[] {
  return REGION_COUNTRIES[abbreviation] ?? [];
}

/** Every country name covered by at least one mapped region — for shading the map. */
export function allMappedCountries(): Set<string> {
  return new Set(Object.values(REGION_COUNTRIES).flat());
}

/**
 * Given a clicked country name and the list of region abbreviations
 * currently in the grid, return the ones that map to that country — used to
 * build an exact (non-fuzzy) filter predicate for Req 9.2.
 */
export function regionAbbreviationsForCountry(
  countryName: string,
  abbreviations: string[]
): string[] {
  return abbreviations.filter((a) => REGION_COUNTRIES[a]?.includes(countryName));
}
