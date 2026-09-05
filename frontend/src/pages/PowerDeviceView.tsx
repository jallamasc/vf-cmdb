import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";
import PowerDiagramSVG, { PowerOutletRow } from "../components/PowerDiagramSVG";
import { RackPort } from "../components/RackDiagramSVG";
import ConnectPanel from "../components/ConnectPanel";
import ConnectionInfoPanel from "../components/ConnectionInfoPanel";
import BreadcrumbNav, { ALL, BreadcrumbFilter } from "../components/BreadcrumbNav";
import { CableRow, ConnectionResolution } from "../lib/connections";
import { AnchorRow } from "../lib/anchors";

type Filter = BreadcrumbFilter;

function nameOf(row: Row | undefined, fallback: string) {
  if (!row) return fallback;
  return (
    row.vf_long_name ||
    row.name ||
    row.simple_name ||
    row.model ||
    row.code ||
    `${fallback} ${row.id}`
  );
}

// Requirement 17 doesn't call for a front/back split the way the rack view
// does (a PDU/UPS's outlets are just "the outlets", not a distinct back
// face) — front is used consistently, matching PowerDeviceType.stencil_url.
const FACE = "front" as const;

/**
 * Phase 4 Task 23 — graphical, breadcrumb-navigable, stencil-aware power
 * device view (Requirement 17). Mirrors `PatchPanelView.tsx`'s structure,
 * with the final breadcrumb level narrowing to a specific power device.
 */
export default function PowerDeviceView() {
  const { data: sites } = useQuery({ queryKey: ["sites"], queryFn: () => api.list("sites") });
  const { data: datacenters } = useQuery({
    queryKey: ["datacenters"],
    queryFn: () => api.list("datacenters"),
  });
  const { data: floors } = useQuery({
    queryKey: ["datacenter-floors"],
    queryFn: () => api.list("datacenter-floors"),
  });
  const { data: racks, isLoading } = useQuery({
    queryKey: ["racks"],
    queryFn: () => api.list("racks"),
  });
  const { data: devices } = useQuery({
    queryKey: ["power-devices"],
    queryFn: () => api.list("power-devices"),
  });
  const { data: allOutlets } = useQuery({
    queryKey: ["power-outlets"],
    queryFn: () => api.list("power-outlets"),
  });
  const { data: deviceTypes } = useQuery({
    queryKey: ["power-device-types"],
    queryFn: () => api.list("power-device-types"),
  });
  const { data: allAnchors } = useQuery({
    queryKey: ["stencil-anchors"],
    queryFn: () => api.list("stencil-anchors"),
  });
  const { data: cables } = useQuery({ queryKey: ["cables"], queryFn: () => api.list("cables") });
  // For resolving a connected far-end's display name + rack (Requirement 15.4).
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
  const { data: panels } = useQuery({
    queryKey: ["patch-panels"],
    queryFn: () => api.list("patch-panels"),
  });

  const [site, setSite] = useState<Filter>(ALL);
  const [dc, setDc] = useState<Filter>(ALL);
  const [floor, setFloor] = useState<Filter>(ALL);
  const [rack, setRack] = useState<Filter>(ALL);
  const [device, setDevice] = useState<Filter>(ALL);

  const [connectSource, setConnectSource] = useState<{
    port: RackPort;
    editingCable?: CableRow | null;
  } | null>(null);
  const [connectInfo, setConnectInfo] = useState<{
    port: RackPort;
    resolution: ConnectionResolution;
  } | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const appliedDeepLink = useRef(false);

  const dcById = useMemo(() => new Map((datacenters ?? []).map((d) => [d.id, d])), [datacenters]);
  const floorById = useMemo(() => new Map((floors ?? []).map((f) => [f.id, f])), [floors]);
  const siteById = useMemo(() => new Map((sites ?? []).map((s) => [s.id, s])), [sites]);
  const rackById = useMemo(() => new Map((racks ?? []).map((r) => [r.id, r])), [racks]);
  const deviceTypeById = useMemo(
    () => new Map((deviceTypes ?? []).map((t) => [t.id, t])),
    [deviceTypes]
  );

  const ownerById = useMemo(() => {
    const m: Record<string, Map<number, Row>> = {
      "network-devices": new Map((networkDevices ?? []).map((d) => [d.id, d])),
      "physical-servers": new Map((physicalServers ?? []).map((d) => [d.id, d])),
      workstations: new Map((workstations ?? []).map((d) => [d.id, d])),
      "power-devices": new Map((devices ?? []).map((d) => [d.id, d])),
      "patch-panels": new Map((panels ?? []).map((p) => [p.id, p])),
    };
    return m;
  }, [networkDevices, physicalServers, workstations, devices, panels]);

  const describeOwner = (ref: { type: string | null | undefined; id: number | null | undefined }) => {
    if (!ref.type || ref.id == null) return { name: "Unknown device", rackId: null as number | null };
    const row = ownerById[ref.type]?.get(ref.id);
    return { name: nameOf(row, ref.type), rackId: row?.rack_id ?? null };
  };

  function rackMatchesHierarchy(r: Row): boolean {
    if (rack !== ALL && r.id !== rack) return false;
    if (floor !== ALL && r.datacenter_floor_id !== floor) return false;
    if (dc !== ALL) {
      const fl = floorById.get(r.datacenter_floor_id);
      if (!fl || fl.datacenter_id !== dc) return false;
    }
    if (site !== ALL) {
      const fl = floorById.get(r.datacenter_floor_id);
      const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
      const siteViaFloor = dcParent?.site_id;
      if (r.site_id !== site && siteViaFloor !== site) return false;
    }
    return true;
  }

  function deviceMatchesHierarchy(d: Row): boolean {
    if (device !== ALL && d.id !== device) return false;
    if (d.rack_id == null) return false;
    const r = rackById.get(d.rack_id);
    if (!r) return false;
    return rackMatchesHierarchy(r);
  }

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
            const p = dcById.get(f.datacenter_id);
            return p && p.site_id === site;
          }
          return true;
        })
        .map((f) => ({ id: f.id, label: nameOf(f, "Floor") })),
    [floors, dc, site, dcById]
  );

  const rackOptions = useMemo(
    () => (racks ?? []).filter(rackMatchesHierarchy).map((r) => ({ id: r.id, label: nameOf(r, "Rack") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [racks, site, dc, floor, dcById, floorById]
  );

  const deviceOptions = useMemo(
    () =>
      (devices ?? [])
        .filter((d) => d.rack_id != null && rackById.get(d.rack_id) && rackMatchesHierarchy(rackById.get(d.rack_id)!))
        .map((d) => ({ id: d.id, label: nameOf(d, "Power Device") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devices, rackById, site, dc, floor, rack, dcById, floorById]
  );

  useEffect(() => {
    if (appliedDeepLink.current) return;
    const deviceIdParam = searchParams.get("deviceId");
    if (!deviceIdParam) return;
    if (!devices || !racks || !floors || !datacenters) return;
    const targetDevice = devices.find((d) => d.id === Number(deviceIdParam));
    if (!targetDevice) return;
    appliedDeepLink.current = true;
    setDevice(targetDevice.id);
    const targetRack = targetDevice.rack_id != null ? rackById.get(targetDevice.rack_id) : undefined;
    if (targetRack) {
      setRack(targetRack.id);
      const fl = floorById.get(targetRack.datacenter_floor_id);
      const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
      if (fl) setFloor(fl.id);
      if (dcParent) setDc(dcParent.id);
      const resolvedSite = targetRack.site_id ?? dcParent?.site_id;
      if (resolvedSite != null) setSite(resolvedSite);
    }
  }, [searchParams, devices, racks, floors, datacenters, rackById, floorById, dcById]);

  useEffect(() => {
    if (!appliedDeepLink.current && device === ALL) return;
    const next = new URLSearchParams(searchParams);
    if (device === ALL) next.delete("deviceId");
    else next.set("deviceId", String(device));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  if (isLoading) return <div className="text-slate-500">Loading power devices…</div>;
  if (!devices || devices.length === 0)
    return (
      <div>
        <h1 className="text-xl font-semibold mb-2">Power Device View</h1>
        <p className="text-slate-500">
          No power devices defined yet. Add power devices from the Sites &amp; Physical section.
        </p>
      </div>
    );

  const shown = devices.filter(deviceMatchesHierarchy);

  const breadcrumbFor = (d: Row) => {
    const r = d.rack_id != null ? rackById.get(d.rack_id) : undefined;
    const fl = r ? floorById.get(r.datacenter_floor_id) : undefined;
    const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
    const st = r ? siteById.get(r.site_id) || (dcParent ? siteById.get(dcParent.site_id) : undefined) : undefined;
    const parts = [
      st ? nameOf(st, "Site") : null,
      dcParent ? nameOf(dcParent, "DC") : null,
      fl ? nameOf(fl, "Floor") : null,
      r ? nameOf(r, "Rack") : null,
    ].filter(Boolean);
    return parts.join(" / ");
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Power Device View</h1>
        <p className="text-sm text-slate-500">
          Each dot is a power outlet. Hollow = free, filled = cabled. Click an outlet
          to connect, edit, or remove its connection.
        </p>
      </div>

      {/* Requirement 17.1: Breadcrumb_Nav down to a selected power device. */}
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
              setDevice(ALL);
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
              setDevice(ALL);
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
              setDevice(ALL);
            },
          },
          {
            key: "rack",
            label: "Rack",
            value: rack,
            allLabel: "All Racks",
            options: rackOptions,
            onChange: (v) => {
              setRack(v);
              setDevice(ALL);
            },
          },
          {
            key: "device",
            label: "Power Device",
            value: device,
            allLabel: "All Devices",
            options: deviceOptions,
            onChange: setDevice,
          },
        ]}
      />
      <p className="text-xs text-slate-500 -mt-3 mb-4">
        Showing <span className="font-semibold">{shown.length}</span> power device
        {shown.length === 1 ? "" : "s"}
      </p>

      {shown.length === 0 ? (
        <p className="text-slate-500">No power devices match the selected filters.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {shown.map((d) => {
            const type = d.device_type_id != null ? deviceTypeById.get(d.device_type_id) : undefined;
            const stencilHref =
              type && type.stencil_url ? api.stencilUrl(`power-device-types-${type.id}`, FACE) : null;
            const anchors = (allAnchors ?? []).filter(
              (a) =>
                a.owner_resource === "power-device-types" &&
                type != null &&
                a.owner_id === type.id &&
                a.face === FACE
            ) as AnchorRow[];
            return (
              <div key={d.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                <div className="mb-2 text-[11px] text-slate-500">{breadcrumbFor(d) || "Unassigned location"}</div>
                <PowerDiagramSVG
                  device={d}
                  outlets={
                    (allOutlets ?? []).filter((o) => o.power_device_id === d.id) as PowerOutletRow[]
                  }
                  stencilHref={stencilHref}
                  anchors={anchors}
                  cables={(cables ?? []) as CableRow[]}
                  onPortClick={(port, resolution) =>
                    resolution.connected
                      ? setConnectInfo({ port, resolution })
                      : setConnectSource({ port })
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {connectSource && (
        <ConnectPanel
          source={connectSource.port}
          editingCable={connectSource.editingCable}
          onClose={() => setConnectSource(null)}
        />
      )}

      {connectInfo && (
        <ConnectionInfoPanel
          source={connectInfo.port}
          resolution={connectInfo.resolution}
          farEndOwnerName={
            describeOwner(connectInfo.resolution.farEnd ?? { type: null, id: null }).name
          }
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
    </div>
  );
}
