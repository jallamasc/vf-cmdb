import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";

function UtilBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-32 bg-slate-200 rounded h-3 overflow-hidden inline-block align-middle">
      <div className={`h-3 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function Ipv4Row({ subnet, vlanLabel }: { subnet: Row; vlanLabel: string }) {
  const [nextIp, setNextIp] = useState<string | null>(null);
  const hasCidr = Boolean(subnet.network_cidr);
  const { data: util } = useQuery({
    queryKey: ["utilization", subnet.id],
    queryFn: () => api.utilization(subnet.id),
    enabled: hasCidr,
    retry: false,
  });
  const nextMut = useMutation({
    mutationFn: () => api.nextIp(subnet.id),
    onSuccess: (d: any) => setNextIp(d.next_ip ?? "none free"),
    onError: () => setNextIp("no free IP"),
  });
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-mono text-sm">{subnet.network_cidr}</td>
      <td className="px-3 py-2 font-mono text-xs">{subnet.gateway ?? "—"}</td>
      <td className="px-3 py-2">{vlanLabel}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {!hasCidr ? (
          <span className="text-slate-400 text-xs">no CIDR</span>
        ) : util ? (
          <span className="flex items-center gap-2">
            <UtilBar pct={util.utilization_pct} />
            <span className="text-xs text-slate-600">
              {util.used}/{util.total_usable} ({util.utilization_pct}%)
            </span>
          </span>
        ) : (
          <span className="text-slate-400 text-xs">…</span>
        )}
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => nextMut.mutate()}
          disabled={!hasCidr}
          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
        >
          Next free IP
        </button>
        {nextIp && (
          <span className="ml-2 font-mono text-sm text-emerald-700">{nextIp}</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-slate-500">{subnet.description}</td>
    </tr>
  );
}

export default function Subnets() {
  const qc = useQueryClient();
  const { data: v4 } = useQuery({ queryKey: ["subnets-ipv4"], queryFn: () => api.list("subnets-ipv4") });
  const { data: v6 } = useQuery({ queryKey: ["subnets-ipv6"], queryFn: () => api.list("subnets-ipv6") });
  const { data: vlans } = useQuery({ queryKey: ["vlans"], queryFn: () => api.list("vlans") });
  const [tab, setTab] = useState<"v4" | "v6">("v4");

  const vlanLabel = (id: number | null) => {
    const v = (vlans ?? []).find((x) => x.id === id);
    return v ? `${v.vlan_id ?? ""} ${v.name ?? ""}`.trim() : "—";
  };

  void qc;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Subnets (IPAM)</h1>
      <p className="text-sm text-slate-500 mb-4">
        Live utilisation is calculated from IP assignments and role slots. Use
        “Next free IP” to grab the lowest unused address.
      </p>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab("v4")}
          className={`px-3 py-1.5 rounded text-sm ${tab === "v4" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
        >
          IPv4 ({v4?.length ?? 0})
        </button>
        <button
          onClick={() => setTab("v6")}
          className={`px-3 py-1.5 rounded text-sm ${tab === "v6" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
        >
          IPv6 ({v6?.length ?? 0})
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
        {tab === "v4" ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Network</th>
                <th className="text-left px-3 py-2">Gateway</th>
                <th className="text-left px-3 py-2">VLAN</th>
                <th className="text-left px-3 py-2">Utilisation</th>
                <th className="text-left px-3 py-2">IPAM</th>
                <th className="text-left px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {(v4 ?? []).map((s) => (
                <Ipv4Row key={s.id} subnet={s} vlanLabel={vlanLabel(s.vlan_id)} />
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Network</th>
                <th className="text-left px-3 py-2">VLAN</th>
                <th className="text-left px-3 py-2">Range from</th>
                <th className="text-left px-3 py-2">Range to</th>
                <th className="text-left px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {(v6 ?? []).map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{s.network_cidr}</td>
                  <td className="px-3 py-2">{vlanLabel(s.vlan_id)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.range_from ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.range_to ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
