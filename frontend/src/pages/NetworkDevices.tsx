import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ICellRendererParams } from "ag-grid-community";
import EntityGrid from "../components/EntityGrid";
import SequenceGapHelper from "../components/SequenceGapHelper";
import ThemeNamePicker, { ThemeSelection } from "../components/ThemeNamePicker";
import { api, Row } from "../api";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  ipCol,
  deviceLinkCol,
  deviceTypeIconCol,
} from "../lib/columns";

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
  // Phase 4 Req 10 — themed "Simple Name" picker, opened per row.
  const [pickerRow, setPickerRow] = useState<Row | null>(null);
  const applyTheme = useMutation({
    mutationFn: ({ id, selection }: { id: number; selection: ThemeSelection }) =>
      api.update("network-devices", id, {
        alternative_name: selection.name,
        theme_name: selection.name,
        theme_category: selection.category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["network-devices"] });
      setPickerRow(null);
    },
  });
  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.create("network-devices", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["network-devices"] }),
  });
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      // Phase 5 Req 6.2/7.1: device-type icon, pulsing when recently active
      // (last_fact_sync_at within 24h).
      deviceTypeIconCol(
        "device_type_id",
        "",
        map["network-device-types"],
        "last_fact_sync_at"
      ),
      // FEAT-7: the long name opens the device detail dashboard.
      deviceLinkCol("vf_long_name", "VF Long Name", "network_devices", 240),
      textCol("vf_friendly_name", "Friendly Name", 150),
      // Req 10.2/10.4 — "Simple Name" is still a free-text cell (manual entry
      // always works) plus a themed-picker button next to it.
      textCol("alternative_name", "Simple Name", 140),
      {
        headerName: "Theme",
        width: 90,
        editable: false,
        cellRenderer: (p: ICellRendererParams) => (
          <button
            type="button"
            onClick={() => setPickerRow(p.data)}
            title="Pick a networking-themed simple name"
            className="px-2 py-0.5 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
          >
            🎭 Pick
          </button>
        ),
      },
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
          description="Switches, routers, firewalls and access points. Long name auto-generates from type, brand and sequence. Click a long name to open that device’s dashboard. “Simple Name” can be typed freely or picked from the networking theme."
          columns={columns}
        />
      </div>
      <ThemeNamePicker
        open={pickerRow != null}
        initialCategory="networking"
        selectedName={pickerRow?.theme_name ?? null}
        onSelect={(selection) => {
          if (pickerRow) applyTheme.mutate({ id: pickerRow.id, selection });
        }}
        onClose={() => setPickerRow(null)}
      />
    </div>
  );
}
