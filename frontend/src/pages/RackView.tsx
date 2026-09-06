import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";
import RackDiagramSVG, { PORT_TYPE_HEX, RackPort } from "../components/RackDiagramSVG";
import ConnectPanel from "../components/ConnectPanel";
import ConnectionInfoPanel from "../components/ConnectionInfoPanel";
import BreadcrumbNav, { ALL, BreadcrumbFilter } from "../components/BreadcrumbNav";
import RackSlotEditor from "../components/RackSlotEditor";
import { CableRow, ConnectionResolution, interfacePortType } from "../lib/connections";

// Device resources whose ports we resolve into the back-face view. Maps the
// kebab-case slug (as stored in owner_device_type / rack_units.device_table) to
// the resource whose rows carry rack_id + rack_unit for the owner.
const PORT_OWNER_RESOURCES = [
  "network-devices",
  "physical-servers",
  "workstations",
  // Phase 5 Task 21 — a Generic_Entity whose Entity_Type_Def enables
  // rack_placement/network_ports/cabling can own ports and be mounted in a
  // rack exactly like a hardcoded device type (Req 17.1/17.2).
  "generic-entities",
] as const;

// Tailwind classes for the legend swatches (kept in sync with TYPE_HEX).
const TYPE_COLORS: Record<string, string> = {
  server: "bg-blue-200 border-blue-400",
  switch: "bg-emerald-200 border-emerald-400",
  router: "bg-teal-200 border-teal-400",
  firewall: "bg-rose-200 border-rose-400",
  pdu: "bg-amber-200 border-amber-400",
  ups: "bg-orange-200 border-orange-400",
  patchpanel: "bg-violet-200 border-violet-400",
  storage: "bg-cyan-200 border-cyan-400",
  generic: "bg-purple-200 border-purple-400",
};

type Filter = BreadcrumbFilter;

function nameOf(row: Row | undefined, fallback: string) {
  if (!row) return fallback;
  return (
    row.name ||
    row.simple_name ||
    row.vf_long_name ||
    row.code ||
    `${fallback} ${row.id}`
  );
}

export default function RackView() {
  const { data: racks, isLoading } = useQuery({
    queryKey: ["racks"],
    queryFn: () => api.list("racks"),
  });
  const { data: allUnits } = useQuery({
    queryKey: ["rack-units"],
    queryFn: () => api.list("rack-units"),
  });
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: () => api.list("sites"),
  });
  const { data: datacenters } = useQuery({
    queryKey: ["datacenters"],
    queryFn: () => api.list("datacenters"),
  });
  const { data: floors } = useQuery({
    queryKey: ["datacenter-floors"],
    queryFn: () => api.list("datacenter-floors"),
  });
  // Phase 5 Task 26/27 — a rack may resolve its floor via a Room or a
  // Section instead of a direct datacenter_floor_id (Req 21.1/22.1).
  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api.list("rooms"),
  });
  const { data: sections } = useQuery({
    queryKey: ["sections"],
    queryFn: () => api.list("sections"),
  });
  // FEAT-6 (6A/6C): port + owner data, only used on the back face.
  const { data: interfaces } = useQuery({
    queryKey: ["device-interfaces"],
    queryFn: () => api.list("device-interfaces"),
  });
  const { data: powerOutlets } = useQuery({
    queryKey: ["power-outlets"],
    queryFn: () => api.list("power-outlets"),
  });
  const { data: networkDevices } = useQuery({
    queryKey: ["network-devices"],
    queryFn: () => api.list("network-devices"),
  });
  const { data: physicalServers } = useQuery({
    queryKey: ["physical-servers"],
    queryFn: () => api.list("physical-servers"),
  });
  const { data: workstations } = useQuery({
    queryKey: ["workstations"],
    queryFn: () => api.list("workstations"),
  });
  // Phase 5 Task 21 — Generic_Entity owners (rack_placement/network_ports).
  const { data: genericEntities } = useQuery({
    queryKey: ["generic-entities"],
    queryFn: () => api.list("generic-entities"),
  });
  // Req 14 — resolving a per-unit stencil needs the owning power device (for
  // its device_type_id) and the three device-type lookups' stencil columns.
  const { data: powerDevices } = useQuery({
    queryKey: ["power-devices"],
    queryFn: () => api.list("power-devices"),
  });
  const { data: networkDeviceTypes } = useQuery({
    queryKey: ["network-device-types"],
    queryFn: () => api.list("network-device-types"),
  });
  const { data: computeDeviceTypes } = useQuery({
    queryKey: ["compute-device-types"],
    queryFn: () => api.list("compute-device-types"),
  });
  const { data: powerDeviceTypes } = useQuery({
    queryKey: ["power-device-types"],
    queryFn: () => api.list("power-device-types"),
  });
  // Phase 4 Req 20 — every cable, so back-face dots can resolve connection
  // state and the info panel can show/edit/remove the specific cable.
  const { data: cables } = useQuery({
    queryKey: ["cables"],
    queryFn: () => api.list("cables"),
  });

  const [site, setSite] = useState<Filter>(ALL);
  const [dc, setDc] = useState<Filter>(ALL);
  const [floor, setFloor] = useState<Filter>(ALL);
  const [rack, setRack] = useState<Filter>(ALL);
  const [face, setFace] = useState<"front" | "back">("front");
  // FEAT-6 (6C) / Phase 4 Req 20 — the source port the Connect panel is open
  // for, and the cable it's re-cabling away from when editing an existing
  // connection (null for a fresh connection).
  const [connectSource, setConnectSource] = useState<{
    port: RackPort;
    editingCable?: CableRow | null;
  } | null>(null);
  // Phase 4 Req 20 — the connected port the info panel (view/edit/remove) is
  // open for.
  const [connectInfo, setConnectInfo] = useState<{
    port: RackPort;
    resolution: ConnectionResolution;
  } | null>(null);
  // Req 13: the front-face slot RackSlotEditor is open for.
  const [slotEditor, setSlotEditor] = useState<{
    rackId: number;
    unitNumber: number;
    unit: Row | null;
  } | null>(null);

  // Req 11.3 — deep link: `?rackId=` pre-selects that rack's full breadcrumb
  // path (site > datacenter > floor > rack) once the hierarchy data is in.
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedDeepLink = useRef(false);

  // Owner lookup: slug -> Map(id -> owner row) for rack/U resolution (rule A).
  // Phase 4 Req 20 also needs "power-devices" here, since a far end of a
  // connection can be a PDU/UPS outlet owner, not just an interface owner.
  const ownerById = useMemo(() => {
    const m: Record<string, Map<number, Row>> = {
      "network-devices": new Map((networkDevices ?? []).map((d) => [d.id, d])),
      "physical-servers": new Map((physicalServers ?? []).map((d) => [d.id, d])),
      workstations: new Map((workstations ?? []).map((d) => [d.id, d])),
      "power-devices": new Map((powerDevices ?? []).map((d) => [d.id, d])),
      "generic-entities": new Map((genericEntities ?? []).map((d) => [d.id, d])),
    };
    return m;
  }, [networkDevices, physicalServers, workstations, powerDevices, genericEntities]);

  // Phase 4 Req 20 — display name + rack id for a resolved far end, so the
  // ConnectionInfoPanel can show who it's connected to and jump there.
  const describeOwner = (ref: { type: string | null | undefined; id: number | null | undefined }) => {
    if (!ref.type || ref.id == null) return { name: "Unknown device", rackId: null as number | null };
    const row = ownerById[ref.type]?.get(ref.id);
    return { name: nameOf(row, ref.type), rackId: row?.rack_id ?? null };
  };

  // Resolve an interface's owner (owner pair wins, else network_device_id).
  const interfaceOwner = (iface: Row): { slug: string; id: number } | null => {
    if (iface.owner_device_type && iface.owner_device_id)
      return { slug: String(iface.owner_device_type), id: Number(iface.owner_device_id) };
    if (iface.network_device_id)
      return { slug: "network-devices", id: Number(iface.network_device_id) };
    return null;
  };

  // FEAT-6 (6A/6C): all back-face ports grouped by rack_id, each carrying the
  // owner's base U so the diagram can place its connector dot.
  const portsByRack = useMemo(() => {
    const byRack = new Map<number, RackPort[]>();
    const push = (rackId: number | null | undefined, p: RackPort) => {
      if (!rackId) return;
      const arr = byRack.get(rackId) ?? [];
      arr.push(p);
      byRack.set(rackId, arr);
    };
    // Interfaces: resolve owner -> its rack_id + rack_unit.
    (interfaces ?? []).forEach((iface) => {
      const owner = interfaceOwner(iface);
      if (!owner) return;
      const ownerRow = ownerById[owner.slug]?.get(owner.id);
      if (!ownerRow || !ownerRow.rack_id) return;
      push(ownerRow.rack_id, {
        port_kind: "interface",
        port_id: iface.id,
        owner_type: owner.slug,
        owner_id: owner.id,
        label:
          iface.description ||
          (iface.port_number != null ? `port ${iface.port_number}` : `if#${iface.id}`),
        port_type: interfacePortType(iface),
        unit_number: ownerRow.rack_unit ?? null,
      });
    });
    // Power outlets: carry rack_id directly. They have no rack_unit column, so
    // pin them to U1 (bottom) as a sensible default for the power face.
    (powerOutlets ?? []).forEach((po) => {
      push(po.rack_id, {
        port_kind: "outlet",
        port_id: po.id,
        owner_type: "power-devices",
        owner_id: po.power_device_id ?? null,
        label: po.label || (po.port_number != null ? `outlet ${po.port_number}` : `po#${po.id}`),
        port_type: "power",
        unit_number: 1,
      });
    });
    return byRack;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interfaces, powerOutlets, ownerById]);

  // Req 14 — one stencil href per mounted `rack_units` row, resolved to the
  // SPECIFIC device-type row the mounted device actually uses (not the
  // coarse device_type string), for whichever face is currently showing.
  const stencilHrefByUnit = useMemo(() => {
    const powerDevicesById = new Map((powerDevices ?? []).map((d) => [d.id, d]));
    const networkDeviceTypesById = new Map((networkDeviceTypes ?? []).map((t) => [t.id, t]));
    const computeDeviceTypesById = new Map((computeDeviceTypes ?? []).map((t) => [t.id, t]));
    const powerDeviceTypesById = new Map((powerDeviceTypes ?? []).map((t) => [t.id, t]));

    const resolveOwnerAndTypeMap = (
      deviceTable: string | null | undefined,
      deviceId: number | null | undefined
    ): { resource: string; typeRow: Row | undefined } | null => {
      if (deviceId == null) return null;
      switch (deviceTable) {
        case "network-devices":
          return {
            resource: "network-device-types",
            typeRow: networkDeviceTypesById.get(
              ownerById["network-devices"]?.get(deviceId)?.device_type_id
            ),
          };
        case "physical-servers":
          return {
            resource: "compute-device-types",
            typeRow: computeDeviceTypesById.get(
              ownerById["physical-servers"]?.get(deviceId)?.device_type_id
            ),
          };
        case "workstations":
          return {
            resource: "compute-device-types",
            typeRow: computeDeviceTypesById.get(
              ownerById["workstations"]?.get(deviceId)?.device_type_id
            ),
          };
        case "power-devices":
          return {
            resource: "power-device-types",
            typeRow: powerDeviceTypesById.get(
              powerDevicesById.get(deviceId)?.device_type_id
            ),
          };
        default:
          return null; // e.g. patch-panels: no device-type/stencil concept
      }
    };

    const map: Record<number, string> = {};
    (allUnits ?? []).forEach((u) => {
      const resolved = resolveOwnerAndTypeMap(u.device_table, u.device_id);
      if (!resolved?.typeRow) return;
      const url = face === "back" ? resolved.typeRow.stencil_url_back : resolved.typeRow.stencil_url;
      if (!url) return;
      map[u.id] = api.stencilUrl(`${resolved.resource}-${resolved.typeRow.id}`, face);
    });
    return map;
  }, [allUnits, ownerById, powerDevices, networkDeviceTypes, computeDeviceTypes, powerDeviceTypes, face]);

  // Lookup maps for labelling rack cards with their DC/Floor/Rack breadcrumb.
  const dcById = useMemo(
    () => new Map((datacenters ?? []).map((d) => [d.id, d])),
    [datacenters]
  );
  const floorById = useMemo(
    () => new Map((floors ?? []).map((f) => [f.id, f])),
    [floors]
  );
  const siteById = useMemo(
    () => new Map((sites ?? []).map((s) => [s.id, s])),
    [sites]
  );
  // Phase 5 Task 26/27 — resolve a rack's floor through Room/Section when it
  // has no direct datacenter_floor_id (Req 21.1/22.1).
  const roomById = useMemo(
    () => new Map((rooms ?? []).map((r) => [r.id, r])),
    [rooms]
  );
  const sectionById = useMemo(
    () => new Map((sections ?? []).map((s) => [s.id, s])),
    [sections]
  );
  const effectiveFloorId = (r: Row): number | null => {
    if (r.datacenter_floor_id != null) return r.datacenter_floor_id;
    if (r.room_id != null) return roomById.get(r.room_id)?.datacenter_floor_id ?? null;
    if (r.section_id != null) {
      const section = sectionById.get(r.section_id);
      const room = section ? roomById.get(section.room_id) : undefined;
      return room?.datacenter_floor_id ?? null;
    }
    return null;
  };

  // Req 11.3 — resolve `?rackId=` to its full ancestry, once, as soon as
  // racks + floors + datacenters have all loaded.
  useEffect(() => {
    if (appliedDeepLink.current) return;
    const rackIdParam = searchParams.get("rackId");
    if (!rackIdParam) return;
    if (!racks || !floors || !datacenters) return;
    const targetRack = racks.find((r) => r.id === Number(rackIdParam));
    if (!targetRack) return;
    appliedDeepLink.current = true;
    setRack(targetRack.id);
    const fl = floorById.get(targetRack.datacenter_floor_id);
    const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
    if (fl) setFloor(fl.id);
    if (dcParent) setDc(dcParent.id);
    const resolvedSite = targetRack.site_id ?? dcParent?.site_id;
    if (resolvedSite != null) setSite(resolvedSite);
  }, [searchParams, racks, floors, datacenters, floorById, dcById]);

  // Keep the URL shareable: reflect the selected rack (if any) in `?rackId=`.
  useEffect(() => {
    if (!appliedDeepLink.current && rack === ALL) return; // avoid clobbering on first paint
    const next = new URLSearchParams(searchParams);
    if (rack === ALL) next.delete("rackId");
    else next.set("rackId", String(rack));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rack]);

  // Cascading option lists — each level filtered by the parent selection.
  const dcOptions = useMemo(
    () =>
      (datacenters ?? [])
        .filter((d) => site === ALL || d.site_id === site)
        .map((d) => ({ id: d.id, label: nameOf(d, "Datacenter") })),
    [datacenters, site]
  );

  const floorOptions = useMemo(
    () =>
      (floors ?? [])
        .filter((f) => {
          if (dc !== ALL) return f.datacenter_id === dc;
          if (site !== ALL) {
            const parent = dcById.get(f.datacenter_id);
            return parent && parent.site_id === site;
          }
          return true;
        })
        .map((f) => ({ id: f.id, label: nameOf(f, "Floor") })),
    [floors, dc, site, dcById]
  );

  const rackOptions = useMemo(
    () =>
      (racks ?? [])
        .filter((r) => matchesHierarchy(r, ALL))
        .map((r) => ({ id: r.id, label: nameOf(r, "Rack") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [racks, site, dc, floor, dcById, floorById, roomById, sectionById]
  );

  // Determine whether a rack matches the currently-selected hierarchy filters.
  // `overrideRack` lets rackOptions ignore the rack-level filter itself.
  function matchesHierarchy(r: Row, overrideRack: Filter): boolean {
    const rk = overrideRack === ALL ? rack : overrideRack;
    if (rk !== ALL && r.id !== rk) return false;
    const floorId = effectiveFloorId(r);
    if (floor !== ALL && floorId !== floor) return false;
    if (dc !== ALL) {
      const fl = floorById.get(floorId);
      if (!fl || fl.datacenter_id !== dc) return false;
    }
    if (site !== ALL) {
      // A rack belongs to a site directly, or via its floor->datacenter
      // (the floor itself resolved directly or via Room/Section).
      const fl = floorById.get(floorId);
      const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
      const siteViaFloor = dcParent?.site_id;
      if (r.site_id !== site && siteViaFloor !== site) return false;
    }
    return true;
  }

  if (isLoading) return <div className="text-slate-500">Loading racks…</div>;
  if (!racks || racks.length === 0)
    return (
      <div>
        <h1 className="text-xl font-semibold mb-2">Rack View</h1>
        <p className="text-slate-500">
          No racks defined yet. Add racks from the Sites &amp; Physical section.
        </p>
      </div>
    );

  const shown = racks.filter((r) => matchesHierarchy(r, ALL));

  const breadcrumb = (r: Row) => {
    const fl = floorById.get(effectiveFloorId(r) ?? -1);
    const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
    const st =
      siteById.get(r.site_id) ||
      (dcParent ? siteById.get(dcParent.site_id) : undefined);
    const parts = [
      st ? nameOf(st, "Site") : null,
      dcParent ? nameOf(dcParent, "DC") : null,
      fl ? nameOf(fl, "Floor") : null,
    ].filter(Boolean);
    return parts.join(" / ");
  };

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Rack Elevation View</h1>
          <p className="text-sm text-slate-500">
            {face === "front"
              ? "Front elevation of each rack, unit by unit. Colour indicates device type."
              : "Back of rack. Coloured dots are ports (blue=copper, orange=fiber, yellow=power). Click a port to connect it."}
          </p>
        </div>
        {/* Req 12 — the face toggle must be unmissable, not a subtle control. */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Viewing
          </span>
          <div className="inline-flex rounded-lg border-2 border-slate-800 overflow-hidden text-sm shadow-sm">
            {(["front", "back"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFace(f)}
                title={`Show the ${f} of each rack`}
                className={
                  "px-5 py-2 capitalize font-semibold flex items-center gap-1.5 transition-colors " +
                  (face === f
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100")
                }
              >
                <span aria-hidden="true">{f === "front" ? "▣" : "▤"}</span>
                {f}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            Click to flip — the back shows ports &amp; cabling
          </span>
        </div>
      </div>

      {/* Req 11: breadcrumb navigation, Site › Datacenter › Floor › Rack */}
      <BreadcrumbNav
        levels={[
          {
            key: "site",
            label: "Site",
            value: site,
            allLabel: "All Sites",
            options: (sites ?? []).map((s) => ({ id: s.id, label: nameOf(s, "Site") })),
            onChange: (v) => {
              setSite(v);
              setDc(ALL);
              setFloor(ALL);
              setRack(ALL);
            },
          },
          {
            key: "datacenter",
            label: "Datacenter",
            value: dc,
            allLabel: "All Datacenters",
            options: dcOptions,
            onChange: (v) => {
              setDc(v);
              setFloor(ALL);
              setRack(ALL);
            },
          },
          {
            key: "floor",
            label: "Floor",
            value: floor,
            allLabel: "All Floors",
            options: floorOptions,
            onChange: (v) => {
              setFloor(v);
              setRack(ALL);
            },
          },
          {
            key: "rack",
            label: "Rack",
            value: rack,
            allLabel: "All Racks",
            options: rackOptions,
            onChange: setRack,
          },
        ]}
      />
      <p className="text-xs text-slate-500 -mt-3 mb-4">
        Showing <span className="font-semibold">{shown.length}</span> rack
        {shown.length === 1 ? "" : "s"}
      </p>

      {/* Legend — device types (front) or port types (back) */}
      <div className="flex flex-wrap gap-3 mb-5 text-xs">
        {face === "front"
          ? Object.entries(TYPE_COLORS).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={`inline-block w-3 h-3 rounded border ${c}`} />
                {k}
              </span>
            ))
          : Object.entries(PORT_TYPE_HEX).map(([k, hex]) => (
              <span key={k} className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded-full border border-slate-700"
                  style={{ backgroundColor: hex }}
                />
                {k}
              </span>
            ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-slate-500">
          No racks match the selected filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {shown.map((r) => (
            <div
              key={r.id}
              className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
            >
              <div className="mb-2">
                <div className="text-sm font-semibold text-slate-800">
                  {nameOf(r, "Rack")}
                  <span className="text-slate-400 text-xs ml-2 font-normal">
                    {r.total_units || 42}U
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {breadcrumb(r) || "Unassigned location"}
                </div>
              </div>
              <RackDiagramSVG
                rack={r}
                units={(allUnits ?? []).filter((u) => u.rack_id === r.id)}
                face={face}
                ports={face === "back" ? portsByRack.get(r.id) ?? [] : []}
                cables={(cables ?? []) as CableRow[]}
                stencilHrefByUnit={stencilHrefByUnit}
                onPortClick={
                  face === "back"
                    ? (port, resolution) =>
                        resolution.connected
                          ? setConnectInfo({ port, resolution })
                          : setConnectSource({ port })
                    : undefined
                }
                onSlotClick={
                  face === "front"
                    ? (info) => setSlotEditor({ rackId: r.id, ...info })
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* FEAT-6 (6C) / Phase 4 Req 20: connect a clicked back-face port to a
          destination, or re-cable it away from an existing connection. */}
      {connectSource && (
        <ConnectPanel
          source={connectSource.port}
          editingCable={connectSource.editingCable}
          onClose={() => setConnectSource(null)}
        />
      )}

      {/* Phase 4 Req 20: view/edit/remove an existing connection. */}
      {connectInfo && (
        <ConnectionInfoPanel
          source={connectInfo.port}
          resolution={connectInfo.resolution}
          farEndOwnerName={describeOwner(connectInfo.resolution.farEnd ?? {
            type: null,
            id: null,
          }).name}
          farEndRackId={
            describeOwner(connectInfo.resolution.farEnd ?? { type: null, id: null }).rackId
          }
          onClose={() => setConnectInfo(null)}
          onEdit={() => {
            setConnectSource({
              port: connectInfo.port,
              editingCable: connectInfo.resolution.cable,
            });
            setConnectInfo(null);
          }}
        />
      )}

      {/* Req 13: add/edit/remove equipment for a clicked front-face U slot */}
      {slotEditor && (
        <RackSlotEditor
          rackId={slotEditor.rackId}
          unitNumber={slotEditor.unitNumber}
          unit={slotEditor.unit}
          onClose={() => setSlotEditor(null)}
        />
      )}
    </div>
  );
}
