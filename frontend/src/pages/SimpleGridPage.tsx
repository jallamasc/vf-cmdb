import { useCallback, useMemo, useState } from "react";
import EntityGrid from "../components/EntityGrid";
import DevicePhotoPanel from "../components/DevicePhotoPanel";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  selectCol,
  namingComputedCol,
} from "../lib/columns";
import { NAMING_MODE_VALUES } from "../lib/namingMode";
import { Row } from "../api";
import type { ColDef } from "ag-grid-community";

type Kind = "patch-panels" | "power" | "cables" | "racks";

interface Config {
  resource: string;
  title: string;
  description: string;
  lookups: string[];
  build: (l: Record<string, any[]>) => ColDef[];
  defaults: Record<string, any>;
  /** Phase 5 Task 23 (Req 19.1) — PowerDevice/PatchPanel support an
   * uploaded photo; Cable/Rack rows don't. */
  photoPanel?: boolean;
}

const CONFIGS: Record<Kind, Config> = {
  "patch-panels": {
    resource: "patch-panels",
    title: "Patch Panels",
    description:
      "Structured cabling patch panels mounted in racks. Panel ID is auto-generated from the parent rack and a per-rack sequence.",
    lookups: ["racks"],
    build: (l) => [
      roCol("id", "ID", 70),
      fkCol("rack_id", "Rack", l.racks),
      numCol("rack_unit", "Rack U"),
      numCol("port_count", "Ports"),
      namingComputedCol("panel_id_label", "Panel ID", 160),
      // Phase 5 Task 28 (Req 23.1) — switch to "manual" to type a Panel ID
      // directly.
      selectCol("naming_mode", "Naming Mode", [...NAMING_MODE_VALUES]),
      selectCol("side", "Side", ["front", "rear", "both"]),
      textCol("notes", "Notes"),
    ],
    defaults: { port_count: 24, side: "front" },
    photoPanel: true,
  },
  power: {
    resource: "power-devices",
    title: "Power Devices",
    description:
      "UPS units and PDUs supplying rack power. VF Long Name is auto-generated from the parent site/rack, device type, and a sequence number.",
    lookups: ["sites", "racks"],
    build: (l) => [
      roCol("id", "ID", 70),
      fkCol("site_id", "Site", l.sites),
      fkCol("rack_id", "Rack", l.racks),
      selectCol("device_type", "Type", ["ups", "pdu"]),
      numCol("device_number", "No."),
      textCol("brand", "Brand"),
      textCol("model", "Model"),
      textCol("serial_number", "Serial"),
      namingComputedCol("vf_long_name", "VF Long Name", 200),
      // Phase 5 Task 28 (Req 23.1) — switch to "manual" to type a VF Long
      // Name directly.
      selectCol("naming_mode", "Naming Mode", [...NAMING_MODE_VALUES]),
      textCol("notes", "Notes"),
    ],
    defaults: { device_type: "pdu" },
    photoPanel: true,
  },
  cables: {
    resource: "cables",
    title: "Cables",
    description: "Structured cabling and patch cords between ports.",
    lookups: [],
    build: () => [
      roCol("id", "ID", 70),
      selectCol("cable_type", "Type", ["structured", "patchcord"]),
      textCol("port_a_type", "A Type"),
      numCol("port_a_id", "A ID"),
      textCol("label_a", "A Label"),
      textCol("port_b_type", "B Type"),
      numCol("port_b_id", "B ID"),
      textCol("label_b", "B Label"),
      textCol("media_type", "Media"),
      numCol("length_meters", "Length (m)"),
      textCol("notes", "Notes"),
    ],
    defaults: { cable_type: "patchcord" },
  },
  // UX-3: racks carry simple_name + the auto-generated vf_long_name but had no
  // tabular view — the Rack View page only draws the elevation diagram.
  racks: {
    resource: "racks",
    title: "Racks",
    description:
      "Rack inventory. VF Long Name is auto-generated from the parent site and the rack's grid coordinates; use the Rack View page for the elevation diagram.",
    lookups: ["sites", "datacenter-floors", "rooms", "sections", "rack-types"],
    build: (l) => [
      roCol("id", "ID", 70),
      textCol("simple_name", "Simple Name", 170),
      textCol("code", "Code", 120),
      namingComputedCol("vf_long_name", "VF Long Name", 220),
      // Phase 5 Task 28 (Req 23.1) — switch to "manual" to type a VF Long
      // Name directly.
      selectCol("naming_mode", "Naming Mode", [...NAMING_MODE_VALUES]),
      fkCol("site_id", "Site", l.sites),
      fkCol("datacenter_floor_id", "Floor", l["datacenter-floors"]),
      fkCol("room_id", "Room", l.rooms),
      fkCol("section_id", "Section", l.sections),
      fkCol("rack_type_id", "Rack Type", l["rack-types"]),
      textCol("grid_coordinates", "Grid Coords", 130),
      numCol("total_units", "Total U"),
      textCol("description", "Description", 220),
      textCol("notes", "Notes"),
    ],
    defaults: { total_units: 42 },
  },
};

export default function SimpleGridPage({ kind }: { kind: Kind }) {
  const cfg = CONFIGS[kind];
  const { map, isLoading } = useLookups(cfg.lookups);
  const columns = useMemo(() => cfg.build(map), [cfg, map]);
  // Phase 5 Task 23 (Req 19.1) — photo manager for the selected row, only on
  // the two kinds whose model actually has a photo_url column.
  const [selected, setSelected] = useState<Row | null>(null);
  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );
  if (isLoading && cfg.lookups.length)
    return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource={cfg.resource}
      title={cfg.title}
      description={cfg.description}
      columns={columns}
      newRowDefaults={cfg.defaults}
      panel={
        cfg.photoPanel ? (
          <DevicePhotoPanel resource={cfg.resource} selected={selected} />
        ) : undefined
      }
      onSelectionChanged={cfg.photoPanel ? handleSelection : undefined}
    />
  );
}
