import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { api, Row } from "../api";
import { roCol, fkCol, generatedCol, useLookups } from "../lib/columns";

const INPUT_CLASS =
  "w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none " +
  "focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:bg-slate-50";

/**
 * Bug fix (round 4) — "On the details of the regions I can't add or modify
 * the data." The Overview section used to be a plain read-only `<dl>` with
 * no way to edit anything, even though this page is meant to mirror the
 * device dashboard's editable-overview idiom (`DeviceOverviewForm.tsx`).
 * This is a lighter-weight version of that same "commit on blur" pattern —
 * Region is a flat `LookupMixin` row, not a device schema, so it doesn't
 * need that component's per-device-type machinery.
 */
function OverviewField({
  label,
  field,
  region,
  onSaved,
  kind = "text",
  editable = true,
  help,
}: {
  label: string;
  field: string;
  region: Row;
  onSaved: () => void;
  kind?: "text" | "number" | "textarea";
  editable?: boolean;
  help?: string;
}) {
  const [value, setValue] = useState(String(region[field] ?? ""));
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setValue(String(region[field] ?? "")), [region, field]);

  const save = useMutation({
    mutationFn: (raw: string) => {
      const trimmed = raw.trim();
      const payload =
        kind === "number"
          ? { [field]: trimmed === "" ? null : Number(trimmed) }
          : { [field]: trimmed === "" ? null : trimmed };
      return api.update("regions", region.id as number, payload);
    },
    onSuccess: () => {
      setStatus("saved");
      onSaved();
    },
    onError: (e: unknown) => {
      setStatus(e instanceof Error ? e.message : "Save failed");
      setValue(String(region[field] ?? ""));
    },
  });

  const commit = () => {
    setStatus(null);
    const current = String(region[field] ?? "");
    if (current === value.trim()) return;
    save.mutate(value);
  };

  if (!editable) {
    return (
      <div className="flex justify-between gap-3">
        <dt className="text-slate-500">{label}</dt>
        <dd className="text-right font-mono">{String(region[field] ?? "—")}</dd>
      </div>
    );
  }

  const inputId = `region-overview-${field}`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-xs font-medium text-slate-500">
          {label}
        </label>
        {status === "saved" && <span className="text-[10px] text-green-600">saved</span>}
        {status && status !== "saved" && (
          <span className="text-[10px] text-red-600">{status}</span>
        )}
      </div>
      {kind === "textarea" ? (
        <textarea
          id={inputId}
          className={INPUT_CLASS}
          rows={2}
          value={value}
          disabled={save.isPending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          id={inputId}
          className={INPUT_CLASS}
          type={kind === "number" ? "number" : "text"}
          value={value}
          disabled={save.isPending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setValue(String(region[field] ?? ""));
          }}
        />
      )}
      {help && <p className="text-[11px] text-slate-400">{help}</p>}
    </div>
  );
}

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
  const qc = useQueryClient();

  const { data: region, isLoading } = useQuery({
    queryKey: ["regions", regionId],
    queryFn: () => api.get("regions", regionId),
    enabled: !Number.isNaN(regionId),
  });
  const refetchRegion = () => {
    qc.invalidateQueries({ queryKey: ["regions", regionId] });
    qc.invalidateQueries({ queryKey: ["regions"] });
  };

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
          <div className="space-y-3">
            <OverviewField label="Full Name" field="full_name" region={region} onSaved={refetchRegion} />
            <OverviewField
              label="Fantastic Name"
              field="theme_name"
              region={region}
              onSaved={refetchRegion}
              help="An optional nickname — coexists with, never replaces, the Abbreviation."
            />
            {/* Abbreviation is forced/derived from Full Name server-side
                (see crud.py's `_auto_abbreviate`) — read-only everywhere,
                same as the Naming Conventions grid. */}
            <dl>
              <div className="flex justify-between gap-3">
                <dt className="text-xs font-medium text-slate-500 self-center">Abbreviation</dt>
                <dd className="text-right font-mono text-sm">{region.abbreviation ?? "—"}</dd>
              </div>
            </dl>
            <OverviewField
              label="Max Length"
              field="max_length"
              region={region}
              onSaved={refetchRegion}
              kind="number"
              help="1-9. Rejected if the current Abbreviation no longer fits."
            />
            <OverviewField label="Latitude" field="latitude" region={region} onSaved={refetchRegion} kind="number" />
            <OverviewField label="Longitude" field="longitude" region={region} onSaved={refetchRegion} kind="number" />
            <OverviewField
              label="Description"
              field="description"
              region={region}
              onSaved={refetchRegion}
              kind="textarea"
            />
          </div>
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
