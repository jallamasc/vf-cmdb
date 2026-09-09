import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import DevicePhotoPanel from "../components/DevicePhotoPanel";
import { StencilPanel } from "../components/StencilField";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  selectCol,
  namingComputedCol,
  modeToggleCol,
  withThemeDisplay,
} from "../lib/columns";
import { useThemePicker } from "../lib/useThemePicker";
import { NAMING_MODE_VALUES } from "../lib/namingMode";
import { Row } from "../api";
import type { ColDef } from "ag-grid-community";

type Kind = "patch-panels" | "power" | "cables" | "racks";

interface Config {
  resource: string;
  title: string;
  description: string;
  lookups: string[];
  build: (l: Record<string, any[]>, themeCol?: ColDef) => ColDef[];
  defaults: Record<string, any>;
  /** Phase 5 Task 23 (Req 19.1) — PowerDevice/PatchPanel support an
   * uploaded photo; Cable/Rack rows don't. */
  photoPanel?: boolean;
  /** Phase 6 Task 27 (Req 10.2-10.4) — PowerDevice/PatchPanel/Rack now also
   * carry their own per-record Stencil_Override (Task 26); Cable doesn't
   * (it isn't a stencil-rendered device). */
  stencilPanel?: boolean;
  /** Round 6 QA — this resource has a real theme_name/theme_category pair
   * with a catalogue-backed picker (Cable is the one Kind here that
   * doesn't — see naming.py/models.py comments for why). */
  themeName?: boolean;
}

const CONFIGS: Record<Kind, Config> = {
  "patch-panels": {
    resource: "patch-panels",
    title: "Patch Panels",
    description:
      "Structured cabling patch panels mounted in racks. Panel ID is auto-generated from the parent rack and a per-rack sequence.",
    lookups: ["racks"],
    build: (l, themeCol) => [
      roCol("id", "ID", 70),
      fkCol("rack_id", "Rack", l.racks),
      numCol("rack_unit", "Rack U"),
      numCol("port_count", "Ports"),
      withThemeDisplay(namingComputedCol("panel_id_label", "Panel ID", 160), "panel_id_label"),
      // Round 6 QA — PatchPanel had no nickname field at all before; a
      // real catalogue-backed one now coexists with the auto-generated
      // Panel ID above (never overwrites it — see naming.py's
      // generate_patch_panel, which only ever writes panel_id_label).
      ...(themeCol ? [textCol("theme_name", "Fantastic Name", 150), themeCol] : []),
      // Phase 5 Task 28 (Req 23.1) — switch to "manual" to type a Panel ID
      // directly.
      modeToggleCol("naming_mode", "Naming Mode", [...NAMING_MODE_VALUES]),
      selectCol("side", "Side", ["front", "rear", "both"]),
      textCol("notes", "Notes"),
    ],
    defaults: { port_count: 24, side: "front" },
    photoPanel: true,
    stencilPanel: true,
    themeName: true,
  },
  power: {
    resource: "power-devices",
    title: "Power Devices",
    description:
      "UPS units and PDUs supplying rack power. VF Long Name is auto-generated from the parent site/rack, device type, and a sequence number.",
    lookups: ["sites", "racks"],
    build: (l, themeCol) => [
      roCol("id", "ID", 70),
      fkCol("site_id", "Site", l.sites),
      fkCol("rack_id", "Rack", l.racks),
      selectCol("device_type", "Type", ["ups", "pdu"]),
      numCol("device_number", "No."),
      textCol("brand", "Brand"),
      textCol("model", "Model"),
      textCol("serial_number", "Serial"),
      withThemeDisplay(namingComputedCol("vf_long_name", "VF Long Name", 200), "vf_long_name"),
      // Round 6 QA — PowerDevice had no nickname field at all before.
      ...(themeCol ? [textCol("theme_name", "Fantastic Name", 150), themeCol] : []),
      // Phase 5 Task 28 (Req 23.1) — switch to "manual" to type a VF Long
      // Name directly.
      modeToggleCol("naming_mode", "Naming Mode", [...NAMING_MODE_VALUES]),
      textCol("notes", "Notes"),
    ],
    defaults: { device_type: "pdu" },
    photoPanel: true,
    stencilPanel: true,
    themeName: true,
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
    build: (l, themeCol) => [
      roCol("id", "ID", 70),
      withThemeDisplay(textCol("simple_name", "Simple Name", 170), "simple_name"),
      textCol("code", "Code", 120),
      // Round 6 QA — a real catalogue-backed nickname alongside
      // `simple_name` (never overwritten by naming.generate_rack, which
      // only ever writes vf_long_name).
      ...(themeCol ? [textCol("theme_name", "Fantastic Name", 150), themeCol] : []),
      namingComputedCol("vf_long_name", "VF Long Name", 220),
      // Phase 5 Task 28 (Req 23.1) — switch to "manual" to type a VF Long
      // Name directly.
      modeToggleCol("naming_mode", "Naming Mode", [...NAMING_MODE_VALUES]),
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
    stencilPanel: true,
    themeName: true,
  },
};

export default function SimpleGridPage({ kind }: { kind: Kind }) {
  const cfg = CONFIGS[kind];
  const qc = useQueryClient();
  const { map, isLoading } = useLookups(cfg.lookups);
  // Round 6 QA — always called (hooks can't be conditional), only actually
  // wired into `columns`/rendered below for kinds that have `themeName`.
  const theme = useThemePicker(cfg.resource);
  const columns = useMemo(
    () => cfg.build(map, cfg.themeName ? theme.column : undefined),
    [cfg, map, theme.column]
  );
  // Phase 5 Task 23 (Req 19.1) — photo manager for the selected row, only on
  // the kinds whose model actually has a photo_url column. Phase 6 Task 27
  // (Req 10.2-10.4) — same selection drives the stencil-override panel too.
  const needsSelection = cfg.photoPanel || cfg.stencilPanel;
  const [selected, setSelected] = useState<Row | null>(null);
  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );
  if (isLoading && cfg.lookups.length)
    return <div className="text-slate-500">Loading…</div>;
  return (
    <>
      <EntityGrid
        resource={cfg.resource}
        title={cfg.title}
        description={cfg.description}
        columns={columns}
        newRowDefaults={cfg.defaults}
        panel={
          needsSelection ? (
            <div className="space-y-3">
              {cfg.stencilPanel && (
                <StencilPanel
                  resource={cfg.resource}
                  label={cfg.title.toLowerCase()}
                  selected={selected}
                  onChanged={() => qc.invalidateQueries({ queryKey: [cfg.resource] })}
                />
              )}
              {cfg.photoPanel && (
                <DevicePhotoPanel resource={cfg.resource} selected={selected} />
              )}
            </div>
          ) : undefined
        }
        onSelectionChanged={needsSelection ? handleSelection : undefined}
      />
      {cfg.themeName && theme.picker}
    </>
  );
}
