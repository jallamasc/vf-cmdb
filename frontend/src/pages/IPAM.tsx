import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";
import { lookupLabel } from "../lib/columns";

// The next-reserved endpoint historically returned the address under different
// keys; accept either so the UI stays robust.
function extractNextIp(d: any): string {
  return (d?.ip ?? d?.next_reserved_ip ?? "") as string;
}

/**
 * Site scoping rule (BUG-B).
 *
 * A record is visible when: no site is selected ("All sites"), the record
 * belongs to the selected site, OR the record has no site at all. Rows with
 * ``site_id = NULL`` (legacy / imported data) must never disappear silently —
 * that is exactly what made the IPAM page look empty.
 */
function inSiteScope(row: Row, siteId: number | null): boolean {
  return siteId == null || row.site_id === siteId || row.site_id == null;
}

/** Human label for a site id; unassigned rows are called out explicitly. */
function siteLabel(sites: Row[], id: number | null | undefined): string {
  if (id == null) return "unassigned";
  const s = sites.find((x) => x.id === id);
  return s ? lookupLabel(s) : `Site #${id}`;
}

// Column counts of the segment tables (kept next to the headers so the
// expandable reservation rows always span the full width).
const IPV4_COLS = 10;
const IPV6_COLS = 8;

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

  // Pre-populate the IP field with the suggested next reserved address when the
  // manager opens. On failure (e.g. subnet has no CIDR) leave the field empty
  // so the user can type manually — never fall back to a hardcoded IP.
  useEffect(() => {
    let active = true;
    api
      .nextReserved(subnetId, family)
      .then((d: any) => {
        if (active) setAddr((cur) => (cur ? cur : extractNextIp(d)));
      })
      .catch(() => {
        /* no CIDR / no free address — leave the field empty */
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subnetId, family]);

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
      setAddr(extractNextIp(d));
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
          placeholder={family === "ipv4" ? "IPv4 address" : "IPv6 address"}
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
function Ipv4SegmentRow({
  subnet,
  vlanLabel,
  site,
}: {
  subnet: Row;
  vlanLabel: string;
  site: string;
}) {
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
        <td
          className={`px-3 py-2 text-xs ${
            subnet.site_id == null ? "text-amber-600 italic" : "text-slate-600"
          }`}
        >
          {site}
        </td>
        {/* BUG-D: Excel-imported range / expansion fields */}
        <td className="px-3 py-2 font-mono text-xs">{subnet.range_from ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-xs">{subnet.range_to ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-xs">
          {subnet.expansion_ceiling ?? "—"}
        </td>
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
          {util
            ? `${util.reserved_used}/${util.reserved_count}`
            : `0/${subnet.reserved_count ?? 0}`}
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
          <td colSpan={IPV4_COLS} className="p-0">
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
function Ipv6SegmentRow({
  subnet,
  vlanLabel,
  site,
}: {
  subnet: Row;
  vlanLabel: string;
  site: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-3 py-2 font-mono text-xs">{subnet.network_cidr ?? "—"}</td>
        <td className="px-3 py-2">{vlanLabel}</td>
        <td
          className={`px-3 py-2 text-xs ${
            subnet.site_id == null ? "text-amber-600 italic" : "text-slate-600"
          }`}
        >
          {site}
        </td>
        {/* BUG-D: range fields from the imported data */}
        <td className="px-3 py-2 font-mono text-xs">{subnet.range_from ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-xs">{subnet.range_to ?? "—"}</td>
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
          <td colSpan={IPV6_COLS} className="p-0">
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

  // BUG-B: never hide VLANs whose site is unset — show them in every scope.
  const scoped = useMemo(
    () => (vlans ?? []).filter((v) => inSiteScope(v, siteId)),
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
function SegmentsTab({
  siteId,
  sites,
}: {
  siteId: number | null;
  sites: Row[];
}) {
  const { data: v4 } = useQuery({ queryKey: ["subnets-ipv4"], queryFn: () => api.list("subnets-ipv4") });
  const { data: v6 } = useQuery({ queryKey: ["subnets-ipv6"], queryFn: () => api.list("subnets-ipv6") });
  const { data: vlans } = useQuery({ queryKey: ["vlans"], queryFn: () => api.list("vlans") });
  const [showV6, setShowV6] = useState(false);

  const vlanLabel = (id: number | null) => {
    const v = (vlans ?? []).find((x) => x.id === id);
    return v ? `${v.vlan_id ?? ""} ${v.name ?? ""}`.trim() : "—";
  };

  // BUG-B: unassigned (site_id = NULL) segments stay visible in every scope.
  const scoped4 = (v4 ?? []).filter((s) => inSiteScope(s, siteId));
  const scoped6 = (v6 ?? []).filter((s) => inSiteScope(s, siteId));
  const hidden4 = (v4 ?? []).length - scoped4.length;
  const hidden6 = (v6 ?? []).length - scoped6.length;

  return (
    <div>
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Network</th>
              <th className="text-left px-3 py-2">Gateway</th>
              <th className="text-left px-3 py-2">VLAN</th>
              <th className="text-left px-3 py-2">Site</th>
              <th className="text-left px-3 py-2">Range from</th>
              <th className="text-left px-3 py-2">Range to</th>
              <th className="text-left px-3 py-2">Expansion ceiling</th>
              <th className="text-left px-3 py-2">Utilisation</th>
              <th className="text-left px-3 py-2">Reserved (used/ceiling · anchor)</th>
              <th className="text-left px-3 py-2">Reservations</th>
            </tr>
          </thead>
          <tbody>
            {scoped4.length === 0 && (
              <tr>
                <td colSpan={IPV4_COLS} className="px-3 py-3 text-slate-400 text-sm">
                  No IPv4 segments for this site yet.
                  {hidden4 > 0 &&
                    ` ${hidden4} segment(s) belong to another site — switch to “All sites” to see them.`}
                </td>
              </tr>
            )}
            {scoped4.map((s) => (
              <Ipv4SegmentRow
                key={s.id}
                subnet={s}
                vlanLabel={vlanLabel(s.vlan_id)}
                site={siteLabel(sites, s.site_id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {scoped4.length > 0 && hidden4 > 0 && (
        <p className="text-xs text-slate-400 mb-3">
          {hidden4} IPv4 segment(s) from other sites are hidden — switch to “All
          sites” to see every segment.
        </p>
      )}

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
                <th className="text-left px-3 py-2">Site</th>
                <th className="text-left px-3 py-2">Range from</th>
                <th className="text-left px-3 py-2">Range to</th>
                <th className="text-left px-3 py-2">Reserved · anchor</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-left px-3 py-2">Reservations</th>
              </tr>
            </thead>
            <tbody>
              {scoped6.length === 0 && (
                <tr>
                  <td colSpan={IPV6_COLS} className="px-3 py-3 text-slate-400 text-sm">
                    No IPv6 segments for this site yet.
                    {hidden6 > 0 &&
                      ` ${hidden6} segment(s) belong to another site — switch to “All sites” to see them.`}
                  </td>
                </tr>
              )}
              {scoped6.map((s) => (
                <Ipv6SegmentRow
                  key={s.id}
                  subnet={s}
                  vlanLabel={vlanLabel(s.vlan_id)}
                  site={siteLabel(sites, s.site_id)}
                />
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
  const { data: v4 } = useQuery({
    queryKey: ["subnets-ipv4"],
    queryFn: () => api.list("subnets-ipv4"),
  });
  const { data: v6 } = useQuery({
    queryKey: ["subnets-ipv6"],
    queryFn: () => api.list("subnets-ipv6"),
  });
  // ``null`` means "All sites". The user's choice always wins once made.
  const [siteId, setSiteId] = useState<number | null>(null);
  const [siteChosen, setSiteChosen] = useState(false);
  const [tab, setTab] = useState<"vlans" | "segments">("segments");

  const siteList = sites ?? [];

  // How many segments each site owns — used both for the smart default and to
  // annotate the dropdown so an empty test site is obvious.
  const segmentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    [...(v4 ?? []), ...(v6 ?? [])].forEach((s) => {
      if (s.site_id != null)
        counts.set(s.site_id, (counts.get(s.site_id) ?? 0) + 1);
    });
    return counts;
  }, [v4, v6]);

  // BUG-B: default to the site that actually holds the most segments instead
  // of blindly picking sites[0] (which could be an empty QA artifact). If no
  // site owns any segment we stay on "All sites" so nothing is hidden.
  useEffect(() => {
    if (siteChosen || siteId != null) return;
    if (segmentCounts.size === 0) return;
    let best: number | null = null;
    let bestCount = 0;
    segmentCounts.forEach((count, id) => {
      if (count > bestCount) {
        best = id;
        bestCount = count;
      }
    });
    if (best != null) setSiteId(best);
  }, [segmentCounts, siteChosen, siteId]);

  const effectiveSite = siteId;
  const unassignedSegments = [...(v4 ?? []), ...(v6 ?? [])].filter(
    (s) => s.site_id == null,
  ).length;

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
          onChange={(e) => {
            setSiteChosen(true);
            setSiteId(e.target.value ? Number(e.target.value) : null);
          }}
          className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white"
        >
          <option value="">All sites</option>
          {siteList.map((s) => (
            <option key={s.id} value={s.id}>
              {lookupLabel(s)} ({segmentCounts.get(s.id) ?? 0} segments)
            </option>
          ))}
        </select>
        {unassignedSegments > 0 && (
          <span className="text-xs text-amber-600">
            {unassignedSegments} segment(s) have no site yet — they are listed in
            every scope until a site is assigned.
          </span>
        )}

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
        <SegmentsTab siteId={effectiveSite} sites={siteList} />
      ) : (
        <VlansTab siteId={effectiveSite} />
      )}
    </div>
  );
}
