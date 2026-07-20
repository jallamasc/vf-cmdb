import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol, ipCol } from "../lib/columns";

const LK = [
  "physical-servers",
  "sites",
  "cluster-types",
  "os-families",
  "os-versions",
  "device-roles",
];

export default function VirtualMachines() {
  const { map, isLoading } = useLookups(LK);
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      roCol("vf_short_name", "Short Name", 130),
      textCol("friendly_name", "Friendly Name", 160),
      fkCol("host_server_id", "Host Server", map["physical-servers"]),
      fkCol("site_id", "Site", map["sites"]),
      fkCol("cluster_type_id", "Cluster", map["cluster-types"]),
      fkCol("role_id", "Role", map["device-roles"]),
      fkCol("os_family_id", "OS Family", map["os-families"]),
      fkCol("os_version_id", "OS Version", map["os-versions"]),
      numCol("consecutive", "Seq"),
      ipCol("management_ipv4", "Mgmt IPv4", "servers"),
      ipCol("management_ipv6", "Mgmt IPv6", "servers"),
      textCol("management_fqdn", "Mgmt FQDN", 200),
      textCol("description", "Description", 200),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="virtual-machines"
      title="Virtual Machines"
      description="Guest VMs hosted on physical servers. Short name auto-generates from role, OS and sequence."
      columns={columns}
    />
  );
}
