import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol } from "../lib/columns";

export default function PortConfig() {
  const { map, isLoading } = useLookups(["network-devices", "vlans"]);

  const deviceOpts = (map["network-devices"] ?? []).map((d) => ({
    id: d.id,
    abbreviation: d.vf_friendly_name || d.vf_long_name || `dev-${d.id}`,
  }));
  const vlanOpts = (map["vlans"] ?? []).map((v) => ({
    id: v.id,
    abbreviation: `${v.vlan_id ?? ""} ${v.name ?? ""}`.trim() || `vlan-${v.id}`,
  }));

  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      fkCol("network_device_id", "Device", deviceOpts),
      numCol("port_number", "Port"),
      {
        field: "port_mode",
        headerName: "Mode",
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: ["access", "trunk", "aggregation", "disabled"],
        },
        width: 130,
      },
      textCol("portgroup", "Port Group"),
      textCol("aggregation_id", "Agg ID"),
      fkCol("pvid_vlan_id", "PVID VLAN", vlanOpts),
      textCol("objective", "Objective", 150),
      textCol("speed", "Speed"),
      textCol("connected_device_type", "Conn Type"),
      numCol("connected_device_id", "Conn ID"),
      textCol("connected_port", "Conn Port"),
      {
        field: "admin_status",
        headerName: "Admin",
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["up", "down"] },
        width: 100,
      },
      textCol("description", "Description", 180),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="device-interfaces"
      title="Device Port Configuration"
      description="Switch/router interface configuration. Use the Device column filter to focus on a single device."
      columns={columns}
      newRowDefaults={{ admin_status: "up", port_mode: "access" }}
    />
  );
}
