import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol, ipCol } from "../lib/columns";

export default function IpAssignments() {
  const { map, isLoading } = useLookups(["subnets-ipv4", "subnets-ipv6"]);

  const subnetOpts = (map["subnets-ipv4"] ?? []).map((s) => ({
    id: s.id,
    abbreviation: s.network_cidr,
  }));
  const subnet6Opts = (map["subnets-ipv6"] ?? []).map((s) => ({
    id: s.id,
    abbreviation: s.network_cidr,
  }));

  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      ipCol("ipv4_address", "IPv4", "lan"),
      ipCol("ipv6_address", "IPv6", "lan"),
      fkCol("subnet_ipv4_id", "IPv4 Subnet", subnetOpts),
      fkCol("subnet_ipv6_id", "IPv6 Subnet", subnet6Opts),
      textCol("assigned_to_type", "Assigned Type", 150),
      numCol("assigned_to_id", "Assigned ID"),
      textCol("interface_name", "Interface"),
      textCol("dns_name", "DNS Name", 200),
      {
        field: "is_primary",
        headerName: "Primary",
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: [true, false] },
        width: 100,
      },
      {
        field: "status",
        headerName: "Status",
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["active", "reserved", "deprecated"] },
        width: 120,
      },
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="ip-assignments"
      title="IP Assignments"
      description="Individual IP address bindings to devices, VMs and interfaces."
      columns={columns}
      newRowDefaults={{ status: "active", is_primary: false }}
    />
  );
}
