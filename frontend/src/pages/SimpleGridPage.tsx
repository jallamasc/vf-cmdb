import { useMemo } from "react";
import EntityGrid from "../components/EntityGrid";
import { useLookups, textCol, roCol, numCol, fkCol } from "../lib/columns";
import type { ColDef } from "ag-grid-community";

type Kind = "patch-panels" | "power" | "cables";

interface Config {
  resource: string;
  title: string;
  description: string;
  lookups: string[];
  build: (l: Record<string, any[]>) => ColDef[];
  defaults: Record<string, any>;
}

const CONFIGS: Record<Kind, Config> = {
  "patch-panels": {
    resource: "patch-panels",
    title: "Patch Panels",
    description: "Structured cabling patch panels mounted in racks.",
    lookups: ["racks"],
    build: (l) => [
      roCol("id", "ID", 70),
      fkCol("rack_id", "Rack", l.racks),
      numCol("rack_unit", "Rack U"),
      numCol("port_count", "Ports"),
      textCol("panel_id_label", "Panel ID"),
      textCol("side", "Side"),
      textCol("notes", "Notes"),
    ],
    defaults: { port_count: 24, side: "front" },
  },
  power: {
    resource: "power-devices",
    title: "Power Devices",
    description: "UPS units and PDUs supplying rack power.",
    lookups: ["sites", "racks"],
    build: (l) => [
      roCol("id", "ID", 70),
      fkCol("site_id", "Site", l.sites),
      fkCol("rack_id", "Rack", l.racks),
      textCol("device_type", "Type (ups/pdu)"),
      numCol("device_number", "No."),
      textCol("brand", "Brand"),
      textCol("model", "Model"),
      textCol("serial_number", "Serial"),
      roCol("vf_long_name", "VF Long Name", 200),
      textCol("notes", "Notes"),
    ],
    defaults: { device_type: "pdu" },
  },
  cables: {
    resource: "cables",
    title: "Cables",
    description: "Structured cabling and patch cords between ports.",
    lookups: [],
    build: () => [
      roCol("id", "ID", 70),
      textCol("cable_type", "Type"),
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
};

export default function SimpleGridPage({ kind }: { kind: Kind }) {
  const cfg = CONFIGS[kind];
  const { map, isLoading } = useLookups(cfg.lookups);
  const columns = useMemo(() => cfg.build(map), [cfg, map]);
  if (isLoading && cfg.lookups.length)
    return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource={cfg.resource}
      title={cfg.title}
      description={cfg.description}
      columns={columns}
      newRowDefaults={cfg.defaults}
    />
  );
}
