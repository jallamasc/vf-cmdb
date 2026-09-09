import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ICellRendererParams } from "ag-grid-community";
import EntityGrid from "../components/EntityGrid";
import ColumnManager, {
  ReferenceTableOption,
} from "../components/ColumnManager";
import SiteCodePanel from "../components/SiteCodePanel";
import ThemeNamePicker, { ThemeSelection } from "../components/ThemeNamePicker";
import { useCustomColumns } from "../lib/useCustomColumns";
import {
  useLookups,
  textCol,
  roCol,
  fkCol,
  customCol,
  namingComputedCol,
  generatedCol,
  modeToggleCol,
  withThemeDisplay,
} from "../lib/columns";
import { NAMING_MODE_VALUES } from "../lib/namingMode";
import { api, Row } from "../api";

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
  const qc = useQueryClient();
  // Bug fix (round 5 QA) — "the dropdown to select fantastic name is not
  // working". The picker itself (ThemeNamePicker, opened from
  // SiteCodePanel above the grid) works fine, but it was the ONLY entry
  // point: every other resource that has a themed name (NetworkDevices)
  // also gets a one-click "🎭 Pick" button right in the grid, so this page
  // was the odd one out and easy to mistake for "there's no dropdown
  // here". Mirrors NetworkDevices.tsx's `applyTheme` exactly.
  const [pickerRow, setPickerRow] = useState<Row | null>(null);
  const applyTheme = useMutation({
    mutationFn: ({ id, selection }: { id: number; selection: ThemeSelection }) =>
      api.update("sites", id, {
        theme_name: selection.name,
        theme_category: selection.category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      setPickerRow(null);
    },
  });

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
      // Phase 6 Task 11 (Req 5.2) — generatedCol/vf-mode-toggle-cell give
      // these the same distinct amber treatment every other naming-engine
      // output + its mode toggle gets, so the tri-mode panel's own output
      // is recognizable here too even though it's read-only in the grid.
      // Bug fix (round 5 QA) — "I keep seeing the column on site code
      // showing only the fantastic name, I should see e.g.
      // 'Alderaan - vfsite1'": the cell now always combines the theme
      // name with the real code (`withThemeDisplay`/`combineWithTheme`,
      // same "-" convention `lookupLabel` already uses for FK dropdowns),
      // so the site can be recognized by either name in one glance instead
      // of only ever showing the raw `simple_name`.
      withThemeDisplay(generatedCol("simple_name", "Site Code", 160), "simple_name"),
      { ...roCol("site_code_type", "Code Mode", 120), cellClass: "vf-mode-toggle-cell" },
      // Bug fix (post-Phase-6 QA) — the "fantastic" name must coexist with
      // (not be replaced by, or locked behind) the system-generated code:
      // an operator can type/edit it directly here, same as any other
      // manual field, instead of it only ever being settable via a themed
      // catalogue pick in the tri-mode panel above.
      textCol("theme_name", "Fantastic Name", 150),
      {
        headerName: "Theme",
        width: 90,
        editable: false,
        cellRenderer: (p: ICellRendererParams) => (
          <button
            type="button"
            onClick={() => setPickerRow(p.data)}
            title="Pick a fantastic name from a themed catalogue"
            className="px-2 py-0.5 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
          >
            🎭 Pick
          </button>
        ),
      },
      fkCol("organization_id", "Org", map["organizations"] ?? []),
      fkCol("cloud_id", "Cloud", map["clouds"] ?? []),
      fkCol("region_id", "Region", map["regions"] ?? []),
      fkCol("campus_id", "Campus", map["campuses"] ?? []),
      // Address is reference data, resolved from the site_addresses table.
      fkCol("site_address_id", "Address", map["site-addresses"] ?? []),
      namingComputedCol("vf_long_name", "VF Long Name", 200),
      namingComputedCol("vf_short_name", "VF Short Name", 150),
      namingComputedCol("tia606b_name", "TIA-606-B Name", 200),
      // Phase 5 Task 28 (Req 23.1) — switch to "manual" to type a value
      // into VF Long/Short/TIA-606-B Name directly; unrelated to
      // site_code_type above, which is Simple Name's own separate mode.
      modeToggleCol("naming_mode", "Naming Mode", [...NAMING_MODE_VALUES]),
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
    <>
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
      <ThemeNamePicker
        open={pickerRow != null}
        initialCategory={pickerRow?.theme_category}
        selectedName={pickerRow?.theme_name ?? null}
        onSelect={(selection) => {
          if (pickerRow) applyTheme.mutate({ id: pickerRow.id, selection });
        }}
        onClose={() => setPickerRow(null)}
      />
    </>
  );
}
