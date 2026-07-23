import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import ColumnManager, {
  ReferenceTableOption,
} from "../components/ColumnManager";
import { useCustomColumns } from "../lib/useCustomColumns";
import { useLookups, textCol, roCol, fkCol, customCol } from "../lib/columns";

// Naming-convention lookups used for the built-in site columns.
const LK = [
  "organizations",
  "clouds",
  "regions",
  "campuses",
  "buildings",
  "floor-sections",
];

// Reference tables that a custom dropdown column may be linked to. Site
// Addresses is real reference data; the naming lookups are offered too.
const REFERENCE_TABLES: ReferenceTableOption[] = [
  { slug: "site-addresses", label: "Site Addresses" },
  { slug: "organizations", label: "Organizations" },
  { slug: "clouds", label: "Clouds" },
  { slug: "regions", label: "Regions" },
  { slug: "campuses", label: "Campuses" },
  { slug: "buildings", label: "Buildings" },
  { slug: "floor-sections", label: "Floor / Sections" },
  { slug: "device-roles", label: "Device Roles" },
  { slug: "brands", label: "Brands" },
];

export default function Sites() {
  const { cols: customCols, addCol, updateCol, removeCol } =
    useCustomColumns("sites");

  // Load every lookup/reference resource we might need: the built-in ones,
  // the site-addresses reference table, plus anything referenced by a
  // user-defined dropdown column.
  const neededSlugs = useMemo(() => {
    const set = new Set<string>([...LK, "site-addresses"]);
    customCols.forEach((c) => c.refResource && set.add(c.refResource));
    return Array.from(set);
  }, [customCols]);

  const { map, isLoading } = useLookups(neededSlugs);

  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      textCol("simple_name", "Simple Name", 150),
      fkCol("organization_id", "Org", map["organizations"] ?? []),
      fkCol("cloud_id", "Cloud", map["clouds"] ?? []),
      fkCol("region_id", "Region", map["regions"] ?? []),
      fkCol("campus_id", "Campus", map["campuses"] ?? []),
      fkCol("building_id", "Building", map["buildings"] ?? []),
      fkCol("floor_section_id", "Floor/Section", map["floor-sections"] ?? []),
      // Address is reference data, resolved from the site_addresses table.
      fkCol("site_address_id", "Address", map["site-addresses"] ?? []),
      roCol("vf_long_name", "VF Long Name", 200),
      roCol("vf_short_name", "VF Short Name", 150),
      roCol("tia606b_name", "TIA-606-B Name", 200),
      textCol("description", "Description", 200),
      textCol("notes", "Notes"),
      // User-defined dynamic columns.
      ...customCols.map((c) =>
        customCol(c, c.refResource ? map[c.refResource] ?? [] : [])
      ),
    ],
    [map, customCols]
  );

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="sites"
      title="Sites"
      description="Physical / logical locations. Long, short and TIA-606-B names are auto-generated from the selected lookups. Address is drawn from the Site Addresses reference table."
      columns={columns}
      toolbarExtra={
        <ColumnManager
          cols={customCols}
          referenceTables={REFERENCE_TABLES}
          onAdd={addCol}
          onUpdate={updateCol}
          onRemove={removeCol}
        />
      }
    />
  );
}
