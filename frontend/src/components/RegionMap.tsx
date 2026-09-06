import { ComposableMap, Geographies, Geography } from "react-simple-maps";
// world-atlas is bundled locally (not fetched from a CDN at runtime) so the
// map keeps working on a fully offline/home-lab deployment.
import worldTopoJson from "world-atlas/countries-110m.json";
import { Row } from "../api";
import { countriesForRegion } from "../lib/regionGeo";

interface Props {
  regions: Row[];
  selectedCountry: string | null;
  onSelectCountry: (country: string | null) => void;
}

/**
 * Phase 5 Task 11 (Req 9) — a world map highlighting the countries the
 * seeded Region set covers (Colombia's 6 natural regions all resolve to
 * Colombia; the 6 Americas regions each resolve to their associated
 * country/countries — see `lib/regionGeo.ts` for the exact, documented
 * mapping and its country-level-only limitation).
 */
export default function RegionMap({ regions, selectedCountry, onSelectCountry }: Props) {
  const highlighted = new Set(
    regions.flatMap((r) => countriesForRegion(String(r.abbreviation ?? "")))
  );

  return (
    <div className="mb-3 border border-slate-200 rounded-lg bg-slate-50 p-2">
      <ComposableMap
        projection="geoAzimuthalEqualArea"
        projectionConfig={{ rotate: [90, -15, 0], scale: 350 }}
        width={640}
        height={340}
        role="img"
        aria-label="Map of regions covered by the seeded Region list"
      >
        <Geographies geography={worldTopoJson}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = geo.properties?.name as string | undefined;
              const isHighlighted = !!name && highlighted.has(name);
              const isSelected = !!name && name === selectedCountry;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => {
                    if (!name || !isHighlighted) return;
                    onSelectCountry(isSelected ? null : name);
                  }}
                  style={{
                    default: {
                      fill: isSelected ? "#2563eb" : isHighlighted ? "#93c5fd" : "#e2e8f0",
                      stroke: "#94a3b8",
                      strokeWidth: 0.4,
                      outline: "none",
                      cursor: isHighlighted ? "pointer" : "default",
                    },
                    hover: {
                      fill: isSelected ? "#1d4ed8" : isHighlighted ? "#60a5fa" : "#e2e8f0",
                      stroke: "#94a3b8",
                      strokeWidth: 0.4,
                      outline: "none",
                      cursor: isHighlighted ? "pointer" : "default",
                    },
                    pressed: {
                      fill: "#1d4ed8",
                      stroke: "#94a3b8",
                      strokeWidth: 0.4,
                      outline: "none",
                    },
                  }}
                >
                  {name && <title>{name}</title>}
                </Geography>
              );
            })
          }
        </Geographies>
      </ComposableMap>
      <p className="text-xs text-slate-500 px-1">
        Click a highlighted country to narrow the list below to its region(s).
        Country-level detail only — Colombia's 6 natural regions all resolve
        to Colombia.
        {selectedCountry && (
          <button
            onClick={() => onSelectCountry(null)}
            className="ml-2 text-blue-600 hover:underline"
          >
            Clear ({selectedCountry})
          </button>
        )}
      </p>
    </div>
  );
}
