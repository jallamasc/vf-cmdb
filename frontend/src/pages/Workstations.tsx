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
  "compute-device-types",
  "brands",
  "device-roles",
  "os-families",
  "os-versions",
];

export default function Workstations() {
  const { map, isLoading } = useLookups(LK);
  // Phase 5 Task 23 (Req 19.1) — photo manager for the selected workstation.
  const [selected, setSelected] = useState<Row | null>(null);
  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      // Bug fix (post-Phase-6 QA, round 3) — column-order convention: ID ->
      // Fantastic Name -> VF Long Name -> VF Short Name -> rest. No
      // `theme_name` column exists on Workstation, so the existing
      // freeform `alternative_name` fills that slot.
      textCol("alternative_name", "Fantastic Name", 150),
      // FEAT-7: the long name opens the device detail dashboard.
      deviceLinkCol("vf_long_name", "VF Long Name", "workstations", 240),
      generatedCol("vf_short_name", "VF Short Name", 130),
      fkCol("site_id", "Site", map["sites"]),
      fkCol("device_type_id", "Device Type", map["compute-device-types"]),
      fkCol("brand_id", "Brand", map["brands"]),
      fkCol("role_id", "Role", map["device-roles"]),
      fkCol("os_family_id", "OS Family", map["os-families"]),
      fkCol("os_version_id", "OS Version", map["os-versions"]),
      numCol("consecutive", "Seq"),
      textCol("serial_number", "Serial"),
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
      description="End-user workstations, laptops and thin clients. Click a long name to open that workstation’s dashboard."
      columns={columns}
      panel={<DevicePhotoPanel resource="workstations" selected={selected} />}
      onSelectionChanged={handleSelection}
    />
  );
}
