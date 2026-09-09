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
  withThemeDisplay,
} from "../lib/columns";
import { useThemePicker } from "../lib/useThemePicker";
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
  // Round 6 QA — "in Physical Servers I can't select a name, just manually
  // write it": a real catalogue-backed `theme_name` + one-click picker,
  // same as Sites/NetworkDevices. `alternative_name` below used to be the
  // only stand-in for "Fantastic Name" (see the comment that used to sit
  // here) — it's now just a plain free-text alias ("Alt Name"), since
  // `theme_name` is the real catalogue-picked field.
  const theme = useThemePicker("physical-servers");
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      textCol("alternative_name", "Alt Name", 140),
      textCol("theme_name", "Fantastic Name", 150),
      theme.column,
      // FEAT-7: the long name opens the device detail dashboard.
      deviceLinkCol("vf_long_name", "VF Long Name", "physical_servers", 240),
      withThemeDisplay(generatedCol("vf_short_name", "VF Short Name", 130), "vf_short_name"),
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
    [map, theme.column]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <>
      <EntityGrid
        resource="physical-servers"
        title="Physical Servers"
        description="Bare-metal compute. Short & long names auto-generate from device type, brand, role, OS and sequence. Click a long name to open that server’s dashboard. Pick a Fantastic Name from the themed catalogue with the 🎭 button."
        columns={columns}
        panel={<DevicePhotoPanel resource="physical-servers" selected={selected} />}
        onSelectionChanged={handleSelection}
      />
      {theme.picker}
    </>
  );
}
