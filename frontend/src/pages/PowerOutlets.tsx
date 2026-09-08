import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol } from "../lib/columns";

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
 * OR a bare wall/receptacle location (`wall_section`, e.g. "Wall — East
 * Corner") — both are optional and independent, mirroring the model's own
 * comment ("for outlets not tied to a rack/PDU").
 */
export default function PowerOutlets() {
  const { map, isLoading } = useLookups(["power-devices", "sites", "racks"]);

  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      textCol("label", "Label", 160),
      fkCol("power_device_id", "Power Device", map["power-devices"] ?? []),
      fkCol("site_id", "Site", map["sites"] ?? []),
      fkCol("rack_id", "Rack", map["racks"] ?? []),
      textCol("wall_section", "Wall Section", 160),
      numCol("port_number", "Port"),
      textCol("outlet_type", "Outlet Type", 140),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="power-outlets"
      title="Power Outlets"
      description="Individual power receptacles — on a rack-mounted PDU/power device, or a bare wall/receptacle location. Shown read-only in the Rack View / Power Device View diagrams; managed here."
      columns={columns}
    />
  );
}
