import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import EntityGrid from "../components/EntityGrid";
import { api } from "../api";
import { useLookups, textCol, roCol, numCol, fkCol, selectCol } from "../lib/columns";

/**
 * Phase 5 Task 4 — Subnets used to be a hand-written, entirely read-only pair
 * of tables (no add/edit/delete). It now uses the same `EntityGrid` CRUD
 * pattern as every other section; the backend already supported full CRUD
 * for `subnets-ipv4`/`subnets-ipv6`, only the frontend was a dead end. The
 * two custom, per-row behaviors that don't fit a plain column (live
 * utilization and "next free IP") survive as AG-Grid cell renderers instead
 * of being dropped.
 */

function UtilBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-24 bg-slate-200 rounded h-3 overflow-hidden inline-block align-middle">
      <div className={`h-3 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function UtilizationCell(p: ICellRendererParams) {
  const subnetId: number | undefined = p.data?.id;
  const hasCidr = Boolean(p.data?.network_cidr);
  const { data: util } = useQuery({
    queryKey: ["utilization", subnetId],
    queryFn: () => api.utilization(subnetId as number),
    enabled: hasCidr && subnetId != null,
    retry: false,
  });
  if (!hasCidr) return <span className="text-slate-400 text-xs">no CIDR</span>;
  if (!util) return <span className="text-slate-400 text-xs">…</span>;
  return (
    <span className="flex items-center gap-2">
      <UtilBar pct={util.utilization_pct} />
      <span className="text-xs text-slate-600">
        {util.used}/{util.total_usable} ({util.utilization_pct}%)
      </span>
    </span>
  );
}

function NextFreeIpCell(p: ICellRendererParams) {
  const subnetId: number | undefined = p.data?.id;
  const hasCidr = Boolean(p.data?.network_cidr);
  const [nextIp, setNextIp] = useState<string | null>(null);
  const nextMut = useMutation({
    mutationFn: () => api.nextIp(subnetId as number),
    onSuccess: (d: any) => setNextIp(d.next_ip ?? "none free"),
    onError: () => setNextIp("no free IP"),
  });
  return (
    <span>
      <button
        onClick={() => nextMut.mutate()}
        disabled={!hasCidr || subnetId == null}
        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
      >
        Next free IP
      </button>
      {nextIp && <span className="ml-2 font-mono text-sm text-emerald-700">{nextIp}</span>}
    </span>
  );
}

const ANCHOR_VALUES = ["from_end", "from_start"];

const REQUIRED_FIELDS = [
  { field: "reserved_count", label: "Reserved Count", hint: "Defaults to 0 — cannot be cleared." },
  { field: "reservation_anchor", label: "Anchor", hint: "Pick from_end or from_start." },
];

function useSubnetColumns(kind: "v4" | "v6"): ColDef[] {
  const { map, isLoading } = useLookups(["sites", "vlans"]);
  if (isLoading) return [];
  const shared: ColDef[] = [
    roCol("id", "ID", 70),
    textCol("description", "Description", 220),
    textCol("network_cidr", "Network CIDR", 160),
  ];
  const gateway: ColDef[] = kind === "v4" ? [textCol("gateway", "Gateway", 140)] : [];
  const middle: ColDef[] = [
    fkCol("vlan_id", "VLAN", map.vlans),
    fkCol("site_id", "Site", map.sites),
    textCol("range_from", "Range From", 140),
    textCol("range_to", "Range To", 140),
  ];
  const expansion: ColDef[] =
    kind === "v4" ? [textCol("expansion_ceiling", "Expansion Ceiling", 150)] : [];
  const reservation: ColDef[] = [
    numCol("reserved_count", "Reserved Count"),
    selectCol("reservation_anchor", "Anchor", ANCHOR_VALUES),
  ];
  const actions: ColDef[] =
    kind === "v4"
      ? [
          { field: "__utilization", headerName: "Utilisation", editable: false, width: 190, cellRenderer: UtilizationCell },
          { field: "__next_ip", headerName: "Next Free IP", editable: false, width: 190, cellRenderer: NextFreeIpCell },
        ]
      : [];
  return [...shared, ...gateway, ...middle, ...expansion, ...reservation, ...actions];
}

export default function Subnets() {
  const [tab, setTab] = useState<"v4" | "v6">("v4");
  const v4Columns = useSubnetColumns("v4");
  const v6Columns = useSubnetColumns("v6");

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Subnets (IPAM)</h1>
      <p className="text-sm text-slate-500 mb-4">
        Add, edit, and delete subnets directly in the grid. Live utilisation is
        calculated from IP assignments and role slots. Use “Next free IP” to
        grab the lowest unused address.
      </p>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab("v4")}
          className={`px-3 py-1.5 rounded text-sm ${tab === "v4" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
        >
          IPv4
        </button>
        <button
          onClick={() => setTab("v6")}
          className={`px-3 py-1.5 rounded text-sm ${tab === "v6" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
        >
          IPv6
        </button>
      </div>

      {tab === "v4" ? (
        v4Columns.length > 0 && (
          <EntityGrid
            resource="subnets-ipv4"
            title="IPv4 Subnets"
            columns={v4Columns}
            newRowDefaults={{ reserved_count: 0, reservation_anchor: "from_end" }}
            requiredFields={REQUIRED_FIELDS}
          />
        )
      ) : (
        v6Columns.length > 0 && (
          <EntityGrid
            resource="subnets-ipv6"
            title="IPv6 Subnets"
            columns={v6Columns}
            newRowDefaults={{ reserved_count: 0, reservation_anchor: "from_end" }}
            requiredFields={REQUIRED_FIELDS}
          />
        )
      )}
    </div>
  );
}
