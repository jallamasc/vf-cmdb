import { useMemo, useState } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol, selectCol, lookupLabel } from "../lib/columns";

const ZONES = [
  "management",
  "servers",
  "storage",
  "services",
  "cluster",
  "dmz",
  "lan",
  "wlan",
  "vpn",
  "public",
  "private",
];

export default function Vlans() {
  const { map, isLoading } = useLookups(["sites"]);
  const sites = map["sites"] ?? [];
  // Phase 6 Task 1 (Req 1.1/1.2) — since every VLAN is scoped to exactly one
  // site (site_id is NOT NULL), a site filter narrows what's shown, and the
  // Site column is moved right after ID so which site a row belongs to is
  // never ambiguous at a glance.
  const [siteFilter, setSiteFilter] = useState<number | "">("");
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      // Vlan.site_id is NOT NULL in the database — it must stay editable here
      // or every insert fails with a constraint error (BUG-A / BUG-C).
      fkCol("site_id", "Site", sites),
      numCol("vlan_id", "VLAN ID"),
      textCol("name", "Name", 160),
      selectCol("zone", "Zone", [null, ...ZONES], {
        cellClassRules: Object.fromEntries(
          ZONES.map((z) => [`zone-${z}`, (p: any) => p.value === z])
        ),
        width: 150,
      }),
      textCol("description", "Description", 240),
    ],
    [sites]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="vlans"
      title="VLANs"
      description="Layer-2 segments. The zone drives IP colour coding across the app."
      columns={columns}
      // Every VLAN belongs to exactly one site: pre-fill the first site so
      // "Add row" cannot hit a NOT NULL violation, and let the user change it.
      newRowDefaults={() => ({ site_id: siteFilter || sites[0]?.id || null })}
      requiredFields={[
        {
          field: "site_id",
          label: "Site",
          hint: "Create a Site on the Sites page first.",
        },
      ]}
      externalFilter={siteFilter === "" ? undefined : (row) => row.site_id === siteFilter}
      toolbarExtra={
        <label className="text-sm text-slate-600 flex items-center gap-1.5">
          Site:
          <select
            aria-label="Filter by site"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value === "" ? "" : Number(e.target.value))}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {lookupLabel(s)}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
}
