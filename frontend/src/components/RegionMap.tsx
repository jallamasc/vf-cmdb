import { ComposableMap, Geographies, Geography, Marker, useMapContext } from "react-simple-maps";
// world-atlas is bundled locally (not fetched from a CDN at runtime) so the
// map keeps working on a fully offline/home-lab deployment.
import worldTopoJson from "world-atlas/countries-110m.json";
import { Row } from "../api";
import { countriesForRegion } from "../lib/regionGeo";

interface Props {
  regions: Row[];
  selectedCountry: string | null;
  onSelectCountry: (country: string | null) => void;
  /** Phase 6 Task 19 (Req 7.3) — when set, clicking the map reports the
   * clicked point's [lat, lng] instead of selecting a country. Used while
   * placing/editing one region's real-world location. */
  placementMode?: boolean;
  onPlacePoint?: (lat: number, lng: number) => void;
  /**
   * Bug-fix (post-Phase-6 QA) — the id of the region whose own marker is
   * currently focused, if any. A marker click identifies ONE exact region
   * (unlike clicking a country polygon, which can match several regions
   * at once — e.g. all 6 of Colombia's natural regions), so this drives a
   * more precise "focus" than `selectedCountry` alone.
   */
  focusedRegionId?: number | null;
  /** Called with the clicked region's own row when its marker is clicked
   * (a second click on the already-focused marker clears the focus). */
  onSelectRegion?: (region: Row | null) => void;
}

/**
 * Phase 6 Task 19 (Req 7.3) — must be rendered INSIDE `ComposableMap` (it
 * reads the current `projection` via `useMapContext`, which only exists in
 * that context) so a click's SVG-space coordinates can be inverted back to
 * real [lng, lat] — the same projection every `<Marker>`/`<Geography>` on
 * this map already renders with, so a placed point lines up exactly with
 * where the operator clicked.
 */
function ClickToPlaceLayer({
  width,
  height,
  onPlacePoint,
}: {
  width: number;
  height: number;
  onPlacePoint: (lat: number, lng: number) => void;
}) {
  const { projection } = useMapContext();
  return (
    <rect
      x={0}
      y={0}
      width={width}
      height={height}
      fill="transparent"
      style={{ cursor: "crosshair" }}
      onClick={(e) => {
        const svg = e.currentTarget.ownerSVGElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        // Scale the click's page position into the SVG's own width/height
        // user-space (ComposableMap's viewBox), since the rendered element
        // is normally CSS-scaled to fill its container.
        const x = ((e.clientX - rect.left) / rect.width) * width;
        const y = ((e.clientY - rect.top) / rect.height) * height;
        const inverted = projection.invert?.([x, y]);
        if (!inverted) return;
        const [lng, lat] = inverted;
        onPlacePoint(lat, lng);
      }}
    />
  );
}

/**
 * Phase 5 Task 11 (Req 9) — a world map highlighting the countries the
 * seeded Region set covers (Colombia's 6 natural regions all resolve to
 * Colombia; the 6 Americas regions each resolve to their associated
 * country/countries — see `lib/regionGeo.ts` for the exact, documented
 * mapping and its country-level-only limitation).
 */
const MAP_WIDTH = 640;
const MAP_HEIGHT = 340;

export default function RegionMap({
  regions,
  selectedCountry,
  onSelectCountry,
  placementMode = false,
  onPlacePoint,
  focusedRegionId = null,
  onSelectRegion,
}: Props) {
  const highlighted = new Set(
    regions.flatMap((r) => countriesForRegion(String(r.abbreviation ?? "")))
  );
  // Phase 6 Task 18 (Req 7.2) — one marker per region that has a real point.
  const markers = regions.filter(
    (r) => typeof r.latitude === "number" && typeof r.longitude === "number"
  );

  return (
    <div className="mb-3 border border-slate-200 rounded-lg bg-slate-50 p-2">
      <ComposableMap
        projection="geoAzimuthalEqualArea"
        projectionConfig={{ rotate: [90, -15, 0], scale: 350 }}
        width={MAP_WIDTH}
        height={MAP_HEIGHT}
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
        {/* Phase 6 Task 18 (Req 7.2) — a marker per region with a real point.
            Bug-fix (post-Phase-6 QA, Req 7.2/9.2) — clicking a marker now
            focuses that EXACT region (a second click clears it), instead of
            being purely decorative; the focused marker gets a distinct
            larger/blue treatment so it's obvious which one is selected. */}
        {!placementMode &&
          markers.map((r) => {
            const isFocused = r.id === focusedRegionId;
            return (
              <Marker key={r.id} coordinates={[r.longitude as number, r.latitude as number]}>
                <circle
                  r={isFocused ? 7 : 4}
                  fill={isFocused ? "#2563eb" : "#dc2626"}
                  stroke="#fff"
                  strokeWidth={1.5}
                  style={{ cursor: onSelectRegion ? "pointer" : "default" }}
                  onClick={() => onSelectRegion?.(isFocused ? null : r)}
                />
                <title>{String(r.full_name ?? r.abbreviation ?? `Region #${r.id}`)}</title>
              </Marker>
            );
          })}
        {/* Phase 6 Task 19 (Req 7.3) — click-to-place overlay, drawn last so
            it sits on top and captures the click regardless of what's under
            the cursor. */}
        {placementMode && onPlacePoint && (
          <ClickToPlaceLayer width={MAP_WIDTH} height={MAP_HEIGHT} onPlacePoint={onPlacePoint} />
        )}
      </ComposableMap>
      <p className="text-xs text-slate-500 px-1">
        {placementMode ? (
          "Click anywhere on the map to set this region's location."
        ) : (
          <>
            Click a red marker to focus that exact region in the list below,
            or a highlighted country to narrow it to every region in that
            country (Colombia's 6 natural regions all resolve to the same
            country outline — the marker is what tells them apart).
            {focusedRegionId != null && (
              <button
                onClick={() => onSelectRegion?.(null)}
                className="ml-2 text-blue-600 hover:underline"
              >
                Clear focused region
              </button>
            )}
            {selectedCountry && (
              <button
                onClick={() => onSelectCountry(null)}
                className="ml-2 text-blue-600 hover:underline"
              >
                Clear ({selectedCountry})
              </button>
            )}
          </>
        )}
      </p>
    </div>
  );
}
