import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol } from "../lib/columns";

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
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      numCol("vlan_id", "VLAN ID"),
      textCol("name", "Name", 160),
      {
        field: "zone",
        headerName: "Zone",
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: [null, ...ZONES] },
        cellClassRules: Object.fromEntries(
          ZONES.map((z) => [`zone-${z}`, (p: any) => p.value === z])
        ),
        width: 140,
      },
      fkCol("site_id", "Site", map["sites"]),
      textCol("description", "Description", 240),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="vlans"
      title="VLANs"
      description="Layer-2 segments. The zone drives IP colour coding across the app."
      columns={columns}
    />
  );
}
