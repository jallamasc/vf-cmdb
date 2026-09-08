import { lazy, Suspense } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { api } from "../api";
import { roCol, fkCol, generatedCol, useLookups } from "../lib/columns";

const RegionMap = lazy(() => import("../components/RegionMap"));

/**
 * Naming-convention modifications (item 4) — a dedicated detail page for one
 * Region, reached by clicking its Full Name in the Regions grid
 * (`Naming.tsx`'s `RegionLinkCol`), mirroring the "click a name -> its own
 * detail page" idiom `deviceLinkCol` already uses for servers/VMs/network
 * devices.
 *
 * A Region has no interfaces/IPs/cables to tab through the way a device
 * does, so this is a single page: its own fields, a map centered on its own
 * marker (when it has coordinates), and the one relation that actually
 * matters here — which Sites have this Region set — reusing `EntityGrid`
 * over the real `sites` resource (via `externalFilter`) so it stays a live,
 * editable view rather than a disconnected read-only snapshot.
 */
export default function RegionDetail() {
  const { id } = useParams<{ id: string }>();
  const regionId = Number(id);

  const { data: region, isLoading } = useQuery({
    queryKey: ["regions", regionId],
    queryFn: () => api.get("regions", regionId),
    enabled: !Number.isNaN(regionId),
  });

  const { map, isLoading: lookupsLoading } = useLookups([
    "organizations",
    "clouds",
    "campuses",
    "site-addresses",
  ]);

  if (isLoading || lookupsLoading) {
    return <div className="text-slate-500 py-8 text-center">Loading…</div>;
  }
  if (!region) {
    return (
      <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
        Region #{id} not found — it may have been deleted. Back to{" "}
        <Link to="/naming" className="underline">
          Naming Conventions
        </Link>
        .
      </div>
    );
  }

  const hasCoordinates = typeof region.latitude === "number" && typeof region.longitude === "number";

  return (
    <div className="flex flex-col h-full">
      <nav className="text-xs text-slate-500 mb-1">
        <Link to="/naming" className="hover:underline">
          Naming Conventions
        </Link>{" "}
        / Regions
      </nav>
      <h1 className="text-xl font-semibold mb-1">
        {region.theme_name ? `${region.theme_name} — ` : ""}
        {region.full_name}
      </h1>
      <p className="text-sm text-slate-500 mb-3">
        Abbreviation <span className="font-mono">{String(region.abbreviation ?? "—")}</span>
        {region.description ? ` — ${region.description}` : ""}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Overview
          </h2>
          <dl className="text-sm space-y-1.5">
            {[
              ["Full Name", region.full_name ?? "—"],
              ["Abbreviation", region.abbreviation ?? "—"],
              ["Max Length", region.max_length ?? "—"],
              ["Latitude", region.latitude ?? "—"],
              ["Longitude", region.longitude ?? "—"],
              ["Description", region.description ?? "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between gap-3">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-mono">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="border border-slate-200 rounded-lg p-2 bg-white">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2 px-2 pt-1">
            Location
          </h2>
          {hasCoordinates ? (
            <Suspense
              fallback={<div className="text-sm text-slate-400 px-2 pb-2">Loading map…</div>}
            >
              <RegionMap
                regions={[region]}
                selectedCountry={null}
                onSelectCountry={() => {}}
                focusedRegionId={region.id}
              />
            </Suspense>
          ) : (
            <p className="text-sm text-slate-400 px-2 pb-2">
              No coordinates set yet — set one from the Regions grid's map in
              Naming Conventions.
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <EntityGrid
          resource="sites"
          title="Sites in this region"
          description={`Sites whose Region is set to “${region.full_name}”. Edits here save immediately, same as the Sites page.`}
          columns={[
            roCol("id", "ID", 60),
            generatedCol("simple_name", "Site Code", 140),
            fkCol("organization_id", "Organization", map["organizations"] ?? []),
            fkCol("cloud_id", "Cloud", map["clouds"] ?? []),
            fkCol("campus_id", "Campus", map["campuses"] ?? []),
            fkCol("site_address_id", "Address", map["site-addresses"] ?? []),
          ]}
          externalFilter={(row) => row.region_id === region.id}
          allowAdd={false}
          allowDelete={false}
          footerHint="Sites are added/removed from the Sites page — region membership is edited there or via this Region column."
        />
      </div>
    </div>
  );
}
