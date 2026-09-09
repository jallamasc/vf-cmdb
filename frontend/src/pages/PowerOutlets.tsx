import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol, withThemeDisplay } from "../lib/columns";
import { useThemePicker } from "../lib/useThemePicker";

/**
 * Post-Phase-6 QA (round 3) — PowerOutlet already had full generic-CRUD
 * backend support (registry.py's "power-outlets" slug) and was already
 * READ from by RackView.tsx/PowerDeviceView.tsx to draw the rack/PDU power
 * diagrams, but there was no page anywhere to actually create or edit one
 * — an outlet could only ever exist if it was seeded. This is the missing
 * CRUD page, following the exact same pattern every other flat entity grid
 * in this app uses (Vlans.tsx, IpAssignments.tsx, ...).
 *
 * An outlet belongs to EITHER a rack-mounted power device (`power_device_id`)
 * OR a bare wall-mounted location — round 4: "Treat wall section as
 * section, according to TIA". That's now a real reference to the `Section`
 * hierarchy level (`section_id`, migration 0035_power_outlet_section)
 * instead of the old free-text `wall_section`, so a wall outlet's location
 * carries the same TIA-606-derived identity (`Section.code`, "S{n}" per
 * room) every other physical location in this app does.
 */
export default function PowerOutlets() {
  const { map, isLoading } = useLookups(["power-devices", "sites", "racks", "sections"]);
  // Round 6 QA — a real catalogue-backed "fantastic name", same one-click
  // in-grid picker every other themed resource has (PowerOutlet had no
  // nickname field at all before this).
  const theme = useThemePicker("power-outlets");

  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      withThemeDisplay(textCol("label", "Label", 160), "label"),
      textCol("theme_name", "Fantastic Name", 150),
      theme.column,
      fkCol("power_device_id", "Power Device", map["power-devices"] ?? []),
      fkCol("site_id", "Site", map["sites"] ?? []),
      fkCol("rack_id", "Rack", map["racks"] ?? []),
      fkCol("section_id", "Section", map["sections"] ?? []),
      numCol("port_number", "Port"),
      textCol("outlet_type", "Outlet Type", 140),
      textCol("notes", "Notes"),
    ],
    [map, theme.column]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <>
      <EntityGrid
        resource="power-outlets"
        title="Power Outlets"
        description="Individual power receptacles — on a rack-mounted PDU/power device, or a bare wall/receptacle location. Shown read-only in the Rack View / Power Device View diagrams; managed here."
        columns={columns}
      />
      {theme.picker}
    </>
  );
}
