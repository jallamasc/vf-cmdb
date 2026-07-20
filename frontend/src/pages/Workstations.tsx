import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol, ipCol } from "../lib/columns";

const LK = [
  "sites",
  "compute-device-types",
  "brands",
  "device-roles",
  "os-families",
  "os-versions",
];

export default function Workstations() {
  const { map, isLoading } = useLookups(LK);
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      roCol("vf_short_name", "Short Name", 130),
      roCol("vf_long_name", "VF Long Name", 220),
      fkCol("site_id", "Site", map["sites"]),
      fkCol("device_type_id", "Device Type", map["compute-device-types"]),
      fkCol("brand_id", "Brand", map["brands"]),
      fkCol("role_id", "Role", map["device-roles"]),
      fkCol("os_family_id", "OS Family", map["os-families"]),
      fkCol("os_version_id", "OS Version", map["os-versions"]),
      numCol("consecutive", "Seq"),
      textCol("serial_number", "Serial"),
      textCol("alternative_name", "Alt Name"),
      ipCol("management_ipv4", "Mgmt IPv4", "lan"),
      textCol("management_fqdn", "Mgmt FQDN", 200),
      textCol("bitwarden_collection_ref", "Bitwarden Ref"),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="workstations"
      title="Workstations"
      description="End-user workstations, laptops and thin clients."
      columns={columns}
    />
  );
}
