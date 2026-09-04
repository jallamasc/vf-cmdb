import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function UtilBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="w-40 bg-slate-200 rounded h-3 overflow-hidden inline-block align-middle">
      <div className={`h-3 ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reservation manager (expandable per IPv4/IPv6 segment)
// ---------------------------------------------------------------------------
function ReservationManager({
  subnetId,
  family,
}: {
  subnetId: number;
  family: "ipv4" | "ipv6";
}) {
  const qc = useQueryClient();
  const addrKey = family === "ipv4" ? "ipv4_address" : "ipv6_address";
  const [addr, setAddr] = useState("");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const { data: reservations } = useQuery({
    queryKey: ["reservations", family, subnetId],
    queryFn: () => api.reservations(subnetId, family),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["reservations", family, subnetId] });
    qc.invalidateQueries({ queryKey: ["utilization", subnetId] });
  };

  const addMut = useMutation({
    mutationFn: () =>
      api.createReservation(subnetId, { [addrKey]: addr, label: label || null }, family),
    onSuccess: () => {
      setAddr("");
      setLabel("");
      setErr(null);
      invalidate();
    },
    onError: (e: any) => setErr(String(e.message ?? e)),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => api.deleteReservation(subnetId, id, family),
    onSuccess: invalidate,
    onError: (e: any) => setErr(String(e.message ?? e)),
  });

  const suggestMut = useMutation({
    mutationFn: () => api.nextReserved(subnetId, family),
    onSuccess: (d: any) => {
      setAddr(d.next_reserved_ip ?? "");
      setErr(null);
    },
    onError: (e: any) => setErr(String(e.message ?? e)),
  });

  return (
    <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
        Reserved pool ({family.toUpperCase()})
      </div>
      <table className="w-full text-sm mb-3">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left px-2 py-1">Address</th>
            <th className="text-left px-2 py-1">Label</th>
            <th className="text-left px-2 py-1">Role</th>
            <th className="text-left px-2 py-1">Locked</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {(reservations ?? []).length === 0 && (
            <tr>
              <td colSpan={5} className="px-2 py-2 text-slate-400 text-xs">
                No reservations yet.
              </td>
            </tr>
          )}
          {(reservations ?? []).map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-2 py-1 font-mono text-xs">{r[addrKey] ?? "—"}</td>
              <td className="px-2 py-1">{r.label ?? "—"}</td>
              <td className="px-2 py-1 text-slate-500">{r.role}</td>
              <td className="px-2 py-1">
                {r.is_locked ? (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-700 text-white">
                    locked
                  </span>
                ) : (
                  <span className="text-slate-400 text-xs">—</span>
                )}
              </td>
              <td className="px-2 py-1 text-right">
                <button
                  onClick={() => delMut.mutate(r.id)}
                  disabled={r.is_locked}
                  title={r.is_locked ? "Locked reservations cannot be deleted" : "Delete"}
                  className="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-30"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder={family === "ipv4" ? "192.168.1.254" : "fd00::254"}
          className="px-2 py-1 border border-slate-300 rounded text-sm font-mono w-44"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="px-2 py-1 border border-slate-300 rounded text-sm w-44"
        />
        <button
          onClick={() => suggestMut.mutate()}
          className="px-2 py-1 text-xs bg-slate-200 rounded hover:bg-slate-300"
        >
          Suggest next
        </button>
        <button
          onClick={() => addMut.mutate()}
          disabled={!addr}
          className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
        >
          Add reservation
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IPv4 segment row (with utilisation + expandable reservations)
// ---------------------------------------------------------------------------
function Ipv4SegmentRow({ subnet, vlanLabel }: { subnet: Row; vlanLabel: string }) {
  const [open, setOpen] = useState(false);
  const hasCidr = Boolean(subnet.network_cidr);
  const { data: util } = useQuery({
    queryKey: ["utilization", subnet.id],
    queryFn: () => api.utilization(subnet.id),
    enabled: hasCidr,
    retry: false,
  });
  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-3 py-2 font-mono text-sm">{subnet.network_cidr ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-xs">{subnet.gateway ?? "—"}</td>
        <td className="px-3 py-2">{vlanLabel}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          {util ? (
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
        <td className="px-3 py-2 text-xs text-slate-600">
          {util ? `${util.reserved_used}/${util.reserved_count}` : "—"}
          <span className="text-slate-400"> · {subnet.reservation_anchor ?? "from_end"}</span>
        </td>
        <td className="px-3 py-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {open ? "Hide" : "Manage"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="p-0">
            <ReservationManager subnetId={subnet.id} family="ipv4" />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// IPv6 segment row (collapsible reservations)
// ---------------------------------------------------------------------------
function Ipv6SegmentRow({ subnet, vlanLabel }: { subnet: Row; vlanLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-3 py-2 font-mono text-xs">{subnet.network_cidr ?? "—"}</td>
        <td className="px-3 py-2">{vlanLabel}</td>
        <td className="px-3 py-2 text-xs text-slate-500">
          {subnet.reserved_count ?? 0} · {subnet.reservation_anchor ?? "from_end"}
        </td>
        <td className="px-3 py-2 text-slate-500 text-sm">{subnet.description}</td>
        <td className="px-3 py-2">
          <button
            onClick={() => setOpen((o) => !o)}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {open ? "Hide" : "Manage"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="p-0">
            <ReservationManager subnetId={subnet.id} family="ipv6" />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// VLANs tab (site-scoped, with quick-add)
// ---------------------------------------------------------------------------
function VlansTab({ siteId }: { siteId: number | null }) {
  const qc = useQueryClient();
  const { data: vlans } = useQuery({ queryKey: ["vlans"], queryFn: () => api.list("vlans") });
  const [vlanId, setVlanId] = useState("");
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const scoped = useMemo(
    () => (vlans ?? []).filter((v) => siteId == null || v.site_id === siteId),
    [vlans, siteId],
  );

  const addMut = useMutation({
    mutationFn: () =>
      api.create("vlans", {
        vlan_id: vlanId ? Number(vlanId) : null,
        name: name || null,
        zone: zone || null,
        site_id: siteId,
      }),
    onSuccess: () => {
      setVlanId("");
      setName("");
      setZone("");
      setErr(null);
      qc.invalidateQueries({ queryKey: ["vlans"] });
    },
    onError: (e: any) => setErr(String(e.message ?? e)),
  });

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">VLAN ID</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Zone</th>
              <th className="text-left px-3 py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {scoped.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-slate-400 text-sm">
                  No VLANs for this site yet.
                </td>
              </tr>
            )}
            {scoped.map((v) => (
              <tr key={v.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono">{v.vlan_id ?? "—"}</td>
                <td className="px-3 py-2">{v.name ?? "—"}</td>
                <td className="px-3 py-2">{v.zone ?? "—"}</td>
                <td className="px-3 py-2 text-slate-500">{v.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <div className="text-sm font-semibold text-slate-700 mb-2">Quick-add VLAN</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={vlanId}
            onChange={(e) => setVlanId(e.target.value)}
            placeholder="VLAN ID"
            className="px-2 py-1 border border-slate-300 rounded text-sm w-28"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="px-2 py-1 border border-slate-300 rounded text-sm w-48"
          />
          <input
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Zone"
            className="px-2 py-1 border border-slate-300 rounded text-sm w-32"
          />
          <button
            onClick={() => addMut.mutate()}
            disabled={!siteId || !vlanId}
            className="px-3 py-1 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-40"
          >
            Add VLAN
          </button>
        </div>
        {!siteId && (
          <div className="mt-2 text-xs text-amber-600">Select a site first.</div>
        )}
        {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segments tab (IPv4 primary + IPv6 collapsible)
// ---------------------------------------------------------------------------
function SegmentsTab({ siteId }: { siteId: number | null }) {
  const { data: v4 } = useQuery({ queryKey: ["subnets-ipv4"], queryFn: () => api.list("subnets-ipv4") });
  const { data: v6 } = useQuery({ queryKey: ["subnets-ipv6"], queryFn: () => api.list("subnets-ipv6") });
  const { data: vlans } = useQuery({ queryKey: ["vlans"], queryFn: () => api.list("vlans") });
  const [showV6, setShowV6] = useState(false);

  const vlanLabel = (id: number | null) => {
    const v = (vlans ?? []).find((x) => x.id === id);
    return v ? `${v.vlan_id ?? ""} ${v.name ?? ""}`.trim() : "—";
  };

  const scoped4 = (v4 ?? []).filter((s) => siteId == null || s.site_id === siteId);
  const scoped6 = (v6 ?? []).filter((s) => siteId == null || s.site_id === siteId);

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Network</th>
              <th className="text-left px-3 py-2">Gateway</th>
              <th className="text-left px-3 py-2">VLAN</th>
              <th className="text-left px-3 py-2">Utilisation</th>
              <th className="text-left px-3 py-2">Reserved (used/ceiling · anchor)</th>
              <th className="text-left px-3 py-2">Reservations</th>
            </tr>
          </thead>
          <tbody>
            {scoped4.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-slate-400 text-sm">
                  No IPv4 segments for this site yet.
                </td>
              </tr>
            )}
            {scoped4.map((s) => (
              <Ipv4SegmentRow key={s.id} subnet={s} vlanLabel={vlanLabel(s.vlan_id)} />
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={() => setShowV6((o) => !o)}
        className="text-sm text-blue-700 hover:underline mb-2"
      >
        {showV6 ? "▼" : "▶"} IPv6 segments ({scoped6.length})
      </button>
      {showV6 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Network</th>
                <th className="text-left px-3 py-2">VLAN</th>
                <th className="text-left px-3 py-2">Reserved · anchor</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-left px-3 py-2">Reservations</th>
              </tr>
            </thead>
            <tbody>
              {scoped6.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-400 text-sm">
                    No IPv6 segments for this site yet.
                  </td>
                </tr>
              )}
              {scoped6.map((s) => (
                <Ipv6SegmentRow key={s.id} subnet={s} vlanLabel={vlanLabel(s.vlan_id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function IPAM() {
  const { data: sites } = useQuery({ queryKey: ["sites"], queryFn: () => api.list("sites") });
  const [siteId, setSiteId] = useState<number | null>(null);
  const [tab, setTab] = useState<"vlans" | "segments">("segments");

  // Default to the first site once loaded.
  const effectiveSite = siteId ?? (sites && sites.length ? sites[0].id : null);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">IPAM by Site</h1>
      <p className="text-sm text-slate-500 mb-4">
        VLANs and IP segments scoped per site. Manage each segment's reserved
        pool (gateway auto-reserved &amp; locked), with anchor-aware “suggest
        next” allocation.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm text-slate-600">Site</label>
        <select
          value={effectiveSite ?? ""}
          onChange={(e) => setSiteId(e.target.value ? Number(e.target.value) : null)}
          className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white"
        >
          {(sites ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name ?? s.code ?? `Site #${s.id}`}
            </option>
          ))}
        </select>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setTab("segments")}
            className={`px-3 py-1.5 rounded text-sm ${tab === "segments" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
          >
            Segments
          </button>
          <button
            onClick={() => setTab("vlans")}
            className={`px-3 py-1.5 rounded text-sm ${tab === "vlans" ? "bg-blue-600 text-white" : "bg-slate-200"}`}
          >
            VLANs
          </button>
        </div>
      </div>

      {tab === "segments" ? (
        <SegmentsTab siteId={effectiveSite} />
      ) : (
        <VlansTab siteId={effectiveSite} />
      )}
    </div>
  );
}
