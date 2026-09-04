import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol, selectCol } from "../lib/columns";

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
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      numCol("vlan_id", "VLAN ID"),
      textCol("name", "Name", 160),
      selectCol("zone", "Zone", [null, ...ZONES], {
        cellClassRules: Object.fromEntries(
          ZONES.map((z) => [`zone-${z}`, (p: any) => p.value === z])
        ),
        width: 150,
      }),
      // Vlan.site_id is NOT NULL in the database — it must stay editable here
      // or every insert fails with a constraint error (BUG-A / BUG-C).
      fkCol("site_id", "Site", sites),
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
      newRowDefaults={() => ({ site_id: sites[0]?.id ?? null })}
      requiredFields={[
        {
          field: "site_id",
          label: "Site",
          hint: "Create a Site on the Sites page first.",
        },
      ]}
    />
  );
}
