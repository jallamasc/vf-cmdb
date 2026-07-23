import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import SequenceGapHelper from "../components/SequenceGapHelper";
import { api } from "../api";
import { useLookups, textCol, roCol, numCol, fkCol, ipCol } from "../lib/columns";

const LK = [
  "sites",
  "racks",
  "network-device-types",
  "network-subtypes",
  "brands",
];

export default function NetworkDevices() {
  const { map, isLoading } = useLookups(LK);
  const qc = useQueryClient();
  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.create("network-devices", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network-devices"] }),
  });
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      roCol("vf_long_name", "VF Long Name", 220),
      textCol("vf_friendly_name", "Friendly Name", 150),
      textCol("alternative_name", "Alt Name", 140),
      fkCol("site_id", "Site", map["sites"]),
      fkCol("rack_id", "Rack", map["racks"]),
      numCol("rack_unit", "U"),
      fkCol("device_type_id", "Type", map["network-device-types"]),
      fkCol("subtype_id", "Subtype", map["network-subtypes"]),
      fkCol("brand_id", "Brand", map["brands"]),
      numCol("consecutive", "Seq"),
      textCol("model", "Model"),
      textCol("serial_number", "Serial"),
      textCol("os_version", "OS Version"),
      ipCol("management_ipv4", "Mgmt IPv4", "management"),
      ipCol("management_ipv6", "Mgmt IPv6", "management"),
      textCol("management_fqdn", "Mgmt FQDN", 200),
      textCol("default_ip", "Default IP"),
      textCol("bitwarden_collection_ref", "Bitwarden Ref"),
      textCol("description", "Description", 200),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <div className="flex flex-col h-full">
      <SequenceGapHelper
        onPick={(prefix, sequence) =>
          createMut.mutate({ name_prefix: prefix, sequence_number: sequence })
        }
      />
      <div className="flex-1">
        <EntityGrid
          resource="network-devices"
          title="Network Devices"
          description="Switches, routers, firewalls and access points. Long name auto-generates from type, brand and sequence."
          columns={columns}
        />
      </div>
    </div>
  );
}
