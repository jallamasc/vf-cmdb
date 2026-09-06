import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";
import PatchPanelDiagramSVG, { PatchPanelPortRow } from "../components/PatchPanelDiagramSVG";
import { RackPort } from "../components/RackDiagramSVG";
import ConnectPanel from "../components/ConnectPanel";
import ConnectionInfoPanel from "../components/ConnectionInfoPanel";
import BreadcrumbNav, { ALL, BreadcrumbFilter } from "../components/BreadcrumbNav";
import { CableRow, ConnectionResolution } from "../lib/connections";

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

/**
 * Phase 4 Task 21 — graphical, breadcrumb-navigable, connection-editable
 * patch panel view (Requirement 16). Mirrors `RackView.tsx`'s structure with
 * one extra, final breadcrumb level ("Patch Panel") narrowing from a rack
 * down to a specific panel, since a rack can hold more than one.
 */
export default function PatchPanelView() {
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
  const { data: panels } = useQuery({
    queryKey: ["patch-panels"],
    queryFn: () => api.list("patch-panels"),
  });
  const { data: allPorts } = useQuery({
    queryKey: ["patch-panel-ports"],
    queryFn: () => api.list("patch-panel-ports"),
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
  const { data: powerDevices } = useQuery({
    queryKey: ["power-devices"],
    queryFn: () => api.list("power-devices"),
  });

  const [site, setSite] = useState<Filter>(ALL);
  const [dc, setDc] = useState<Filter>(ALL);
  const [floor, setFloor] = useState<Filter>(ALL);
  const [rack, setRack] = useState<Filter>(ALL);
  const [panel, setPanel] = useState<Filter>(ALL);

  const [connectSource, setConnectSource] = useState<{
    port: RackPort;
    editingCable?: CableRow | null;
  } | null>(null);
  const [connectInfo, setConnectInfo] = useState<{
    port: RackPort;
    resolution: ConnectionResolution;
  } | null>(null);

  // Deep link: `?panelId=` pre-selects that panel's full breadcrumb path.
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedDeepLink = useRef(false);

  const dcById = useMemo(() => new Map((datacenters ?? []).map((d) => [d.id, d])), [datacenters]);
  const floorById = useMemo(() => new Map((floors ?? []).map((f) => [f.id, f])), [floors]);
  const siteById = useMemo(() => new Map((sites ?? []).map((s) => [s.id, s])), [sites]);
  const rackById = useMemo(() => new Map((racks ?? []).map((r) => [r.id, r])), [racks]);

  // Owner lookup for the ConnectionInfoPanel's far-end name + jump target.
  const ownerById = useMemo(() => {
    const m: Record<string, Map<number, Row>> = {
      "network-devices": new Map((networkDevices ?? []).map((d) => [d.id, d])),
      "physical-servers": new Map((physicalServers ?? []).map((d) => [d.id, d])),
      workstations: new Map((workstations ?? []).map((d) => [d.id, d])),
      "power-devices": new Map((powerDevices ?? []).map((d) => [d.id, d])),
      "patch-panels": new Map((panels ?? []).map((p) => [p.id, p])),
    };
    return m;
  }, [networkDevices, physicalServers, workstations, powerDevices, panels]);

  const describeOwner = (ref: { type: string | null | undefined; id: number | null | undefined }) => {
    if (!ref.type || ref.id == null) return { name: "Unknown device", rackId: null as number | null };
    const row = ownerById[ref.type]?.get(ref.id);
    return { name: nameOf(row, ref.type), rackId: row?.rack_id ?? null };
  };

  // Whether a rack matches the current site/dc/floor filters (rack level
  // itself is applied separately, same split RackView uses for its options).
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

  function panelMatchesHierarchy(p: Row): boolean {
    if (panel !== ALL && p.id !== panel) return false;
    if (p.rack_id == null) return false;
    const r = rackById.get(p.rack_id);
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

  const panelOptions = useMemo(
    () =>
      (panels ?? [])
        .filter((p) => p.rack_id != null && rackById.get(p.rack_id) && rackMatchesHierarchy(rackById.get(p.rack_id)!))
        .map((p) => ({ id: p.id, label: nameOf(p, "Panel") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, rackById, site, dc, floor, rack, dcById, floorById]
  );

  // Deep-link resolution, mirroring RackView's `?rackId=` handling.
  useEffect(() => {
    if (appliedDeepLink.current) return;
    const panelIdParam = searchParams.get("panelId");
    if (!panelIdParam) return;
    if (!panels || !racks || !floors || !datacenters) return;
    const targetPanel = panels.find((p) => p.id === Number(panelIdParam));
    if (!targetPanel) return;
    appliedDeepLink.current = true;
    setPanel(targetPanel.id);
    const targetRack = targetPanel.rack_id != null ? rackById.get(targetPanel.rack_id) : undefined;
    if (targetRack) {
      setRack(targetRack.id);
      const fl = floorById.get(targetRack.datacenter_floor_id);
      const dcParent = fl ? dcById.get(fl.datacenter_id) : undefined;
      if (fl) setFloor(fl.id);
      if (dcParent) setDc(dcParent.id);
      const resolvedSite = targetRack.site_id ?? dcParent?.site_id;
      if (resolvedSite != null) setSite(resolvedSite);
    }
  }, [searchParams, panels, racks, floors, datacenters, rackById, floorById, dcById]);

  useEffect(() => {
    if (!appliedDeepLink.current && panel === ALL) return;
    const next = new URLSearchParams(searchParams);
    if (panel === ALL) next.delete("panelId");
    else next.set("panelId", String(panel));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  if (isLoading) return <div className="text-slate-500">Loading patch panels…</div>;
  if (!panels || panels.length === 0)
    return (
      <div>
        <h1 className="text-xl font-semibold mb-2">Patch Panel View</h1>
        <p className="text-slate-500">
          No patch panels defined yet. Add patch panels from the Sites &amp; Physical section.
        </p>
      </div>
    );

  const shown = panels.filter(panelMatchesHierarchy);
  // Req 5 — don't render every patch panel in the organization by default;
  // require the breadcrumb to reach at least Rack level first.
  const hasDrillDownSelection = rack !== ALL || panel !== ALL;

  const breadcrumbFor = (p: Row) => {
    const r = p.rack_id != null ? rackById.get(p.rack_id) : undefined;
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
        <h1 className="text-xl font-semibold">Patch Panel View</h1>
        <p className="text-sm text-slate-500">
          Each dot is a patch panel port. Hollow = free, filled = cabled. Click a port
          to connect, edit, or remove its connection.
        </p>
      </div>

      {/* Requirement 16.1: Breadcrumb_Nav down to a selected patch panel. */}
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
              setPanel(ALL);
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
              setPanel(ALL);
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
              setPanel(ALL);
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
              setPanel(ALL);
            },
          },
          {
            key: "panel",
            label: "Patch Panel",
            value: panel,
            allLabel: "All Panels",
            options: panelOptions,
            onChange: setPanel,
          },
        ]}
      />
      {hasDrillDownSelection && (
        <p className="text-xs text-slate-500 -mt-3 mb-4">
          Showing <span className="font-semibold">{shown.length}</span> patch panel
          {shown.length === 1 ? "" : "s"}
        </p>
      )}

      {!hasDrillDownSelection ? (
        <p className="text-slate-500">
          Select a rack (or a specific patch panel) above to view its diagram.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-slate-500">No patch panels match the selected filters.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {shown.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <div className="mb-2 text-[11px] text-slate-500">{breadcrumbFor(p) || "Unassigned location"}</div>
              <PatchPanelDiagramSVG
                panel={p}
                ports={
                  (allPorts ?? []).filter(
                    (pp) => pp.patch_panel_id === p.id
                  ) as PatchPanelPortRow[]
                }
                cables={(cables ?? []) as CableRow[]}
                onPortClick={(port, resolution) =>
                  resolution.connected
                    ? setConnectInfo({ port, resolution })
                    : setConnectSource({ port })
                }
              />
            </div>
          ))}
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
