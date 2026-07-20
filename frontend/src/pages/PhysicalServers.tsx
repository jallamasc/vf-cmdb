import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol, ipCol } from "../lib/columns";

const LK = [
  "sites",
  "racks",
  "compute-device-types",
  "cluster-types",
  "brands",
  "device-roles",
  "os-families",
  "os-versions",
];

export default function PhysicalServers() {
  const { map, isLoading } = useLookups(LK);
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      roCol("vf_short_name", "Short Name", 130),
      roCol("vf_long_name", "VF Long Name", 220),
      fkCol("site_id", "Site", map["sites"]),
      fkCol("rack_id", "Rack", map["racks"]),
      numCol("rack_unit", "U"),
      fkCol("device_type_id", "Device Type", map["compute-device-types"]),
      fkCol("cluster_type_id", "Cluster", map["cluster-types"]),
      fkCol("brand_id", "Brand", map["brands"]),
      fkCol("role_id", "Role", map["device-roles"]),
      fkCol("os_family_id", "OS Family", map["os-families"]),
      fkCol("os_version_id", "OS Version", map["os-versions"]),
      numCol("consecutive", "Seq"),
      textCol("model", "Model"),
      textCol("serial_number", "Serial"),
      textCol("part_number", "Part No."),
      ipCol("management_ipv4", "Mgmt IPv4", "management"),
      ipCol("management_ipv6", "Mgmt IPv6", "management"),
      textCol("management_fqdn", "Mgmt FQDN", 200),
      ipCol("ilo_ipmi_ipv4", "iLO/IPMI IPv4", "management"),
      textCol("ilo_ipmi_fqdn", "iLO FQDN", 200),
      textCol("ilo_ipmi_user", "iLO User"),
      textCol("domain", "Domain"),
      textCol("alternative_name", "Alt Name"),
      textCol("bitwarden_collection_ref", "Bitwarden Ref"),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="physical-servers"
      title="Physical Servers"
      description="Bare-metal compute. Short & long names auto-generate from device type, brand, role, OS and sequence."
      columns={columns}
    />
  );
}
