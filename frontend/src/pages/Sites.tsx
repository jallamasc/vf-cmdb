import { useCallback, useMemo, useState } from "react";
import EntityGrid from "../components/EntityGrid";
import ColumnManager, {
  ReferenceTableOption,
} from "../components/ColumnManager";
import SiteCodePanel from "../components/SiteCodePanel";
import { useCustomColumns } from "../lib/useCustomColumns";
import { useLookups, textCol, roCol, fkCol, customCol } from "../lib/columns";
import { Row } from "../api";

/**
 * FEAT-2 — a Site is regional identity only.
 *
 * The grid shows the organization / cloud / region / campus that place the
 * site on the map, its address, and the generated names. ``building_id`` and
 * ``floor_section_id`` still exist on the table (the naming engine and the
 * Hierarchy page use them) but they are *not* site-level attributes, so they
 * are no longer editable here — buildings and floors are managed in Hierarchy.
 */

// Naming-convention lookups used for the built-in site columns.
const LK = ["organizations", "clouds", "regions", "campuses"];

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
  const [selected, setSelected] = useState<Row | null>(null);

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
      // FEAT-1: the site code is owned by the tri-mode panel above the grid,
      // because in "auto" and "theme" mode the server rewrites it on save.
      roCol("simple_name", "Site Code", 160),
      roCol("site_code_type", "Code Mode", 120),
      roCol("theme_name", "Theme Name", 150),
      fkCol("organization_id", "Org", map["organizations"] ?? []),
      fkCol("cloud_id", "Cloud", map["clouds"] ?? []),
      fkCol("region_id", "Region", map["regions"] ?? []),
      fkCol("campus_id", "Campus", map["campuses"] ?? []),
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

  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="sites"
      title="Sites"
      description="Regional identity of a location: organization, cloud, region and campus. The site code can be auto-generated, typed by hand or picked from a themed catalogue; the long, short and TIA-606-B names are always auto-generated. Buildings and floor/sections are managed on the Hierarchy page."
      columns={columns}
      panel={<SiteCodePanel site={selected} />}
      onSelectionChanged={handleSelection}
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
