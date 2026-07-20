import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, fkCol } from "../lib/columns";

const LK = [
  "organizations",
  "clouds",
  "regions",
  "campuses",
  "buildings",
  "floor-sections",
];

export default function Sites() {
  const { map, isLoading } = useLookups(LK);
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      textCol("simple_name", "Simple Name", 150),
      fkCol("organization_id", "Org", map["organizations"]),
      fkCol("cloud_id", "Cloud", map["clouds"]),
      fkCol("region_id", "Region", map["regions"]),
      fkCol("campus_id", "Campus", map["campuses"]),
      fkCol("building_id", "Building", map["buildings"]),
      fkCol("floor_section_id", "Floor/Section", map["floor-sections"]),
      roCol("vf_long_name", "VF Long Name", 200),
      roCol("vf_short_name", "VF Short Name", 150),
      roCol("tia606b_name", "TIA-606-B Name", 200),
      textCol("description", "Description", 200),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="sites"
      title="Sites"
      description="Physical / logical locations. Long, short and TIA-606-B names are auto-generated from the selected lookups."
      columns={columns}
    />
  );
}
