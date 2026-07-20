import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol, ipCol } from "../lib/columns";

const LK = [
  "virtual-machines",
  "physical-servers",
  "sites",
  "app-types",
  "device-roles",
];

export default function ContainersApps() {
  const { map, isLoading } = useLookups(LK);
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      roCol("vf_short_name", "Short Name", 130),
      textCol("friendly_name", "Friendly Name", 160),
      textCol("container_type", "Type (cn/ap)", 110),
      fkCol("host_vm_id", "Host VM", map["virtual-machines"]),
      fkCol("host_server_id", "Host Server", map["physical-servers"]),
      fkCol("site_id", "Site", map["sites"]),
      fkCol("app_type_id", "App Type", map["app-types"]),
      fkCol("role_id", "Role", map["device-roles"]),
      textCol("version", "Version"),
      numCol("consecutive", "Seq"),
      ipCol("ipv4_address", "IPv4", "services"),
      ipCol("ipv6_address", "IPv6", "services"),
      textCol("description", "Description", 200),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="containers-apps"
      title="Containers & Applications"
      description="Containerised workloads and applications running on VMs or servers."
      columns={columns}
      newRowDefaults={{ container_type: "cn" }}
    />
  );
}
