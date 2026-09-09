import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  ipCol,
  deviceLinkCol,
} from "../lib/columns";
import { useThemePicker } from "../lib/useThemePicker";

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
  // Round 6 QA — a real catalogue-backed `theme_name` + one-click picker.
  // `friendly_name` below is now just a plain free-text alias ("Alt
  // Name") since `theme_name` is the real catalogue-picked field.
  const theme = useThemePicker("virtual-machines");
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      textCol("friendly_name", "Alt Name", 140),
      textCol("theme_name", "Fantastic Name", 150),
      theme.column,
      // FEAT-7: the short name opens the device detail dashboard.
      deviceLinkCol("vf_short_name", "VF Short Name", "virtual_machines", 170),
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
    [map, theme.column]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <>
      <EntityGrid
        resource="virtual-machines"
        title="Virtual Machines"
        description="Guest VMs hosted on physical servers. Short name auto-generates from role, OS and sequence. Click a short name to open that VM’s dashboard. Pick a Fantastic Name from the themed catalogue with the 🎭 button."
        columns={columns}
      />
      {theme.picker}
    </>
  );
}
