import { useCallback, useMemo, useState } from "react";
import EntityGrid from "../components/EntityGrid";
import DevicePhotoPanel from "../components/DevicePhotoPanel";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  ipCol,
  deviceLinkCol,
  generatedCol,
} from "../lib/columns";
import { Row } from "../api";

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
  // Phase 5 Task 23 (Req 19.1) — photo manager for the selected server.
  const [selected, setSelected] = useState<Row | null>(null);
  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      // Bug fix (post-Phase-6 QA, round 3) — global column-order convention:
      // ID -> Fantastic Name (editable nickname) -> VF Long Name -> VF
      // Short Name -> rest. PhysicalServer has no `theme_name` column of
      // its own (only Site/NetworkDevice do), so `alternative_name` —
      // already a free-typed nickname field — fills that slot instead of
      // inventing a new column.
      textCol("alternative_name", "Fantastic Name", 150),
      // FEAT-7: the long name opens the device detail dashboard.
      deviceLinkCol("vf_long_name", "VF Long Name", "physical_servers", 240),
      generatedCol("vf_short_name", "VF Short Name", 130),
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
      description="Bare-metal compute. Short & long names auto-generate from device type, brand, role, OS and sequence. Click a long name to open that server’s dashboard."
      columns={columns}
      panel={<DevicePhotoPanel resource="physical-servers" selected={selected} />}
      onSelectionChanged={handleSelection}
    />
  );
}
