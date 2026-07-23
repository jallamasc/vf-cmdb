import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, Family, Row } from "../api";
import { lookupLabel } from "../lib/columns";

// ---------------------------------------------------------------------------
// Shared UI primitives (mirrors the Hierarchy / Subnets page styling)
// ---------------------------------------------------------------------------
const inputCls = "border border-slate-300 rounded px-2 py-1.5 text-sm w-full";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-200 rounded-lg bg-white mb-5 shadow-sm">
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-800">{title}</h2>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const ZONES = [
  "management",
  "servers",
  "storage",
  "services",
  "cluster",
  "dmz",
  "lan",
  "wlan",
  "vpn",
  "public",
  "private",
];

const RESERVATION_ROLES = [
  "gateway",
  "firewall",
  "core-switch",
  "switch",
  "router",
  "vip",
  "dns",
  "dhcp",
  "loadbalancer",
  "other",
];

// ---------------------------------------------------------------------------
// Utilization bar — total / used / reserved / available (Phase 2 requirement)
// ---------------------------------------------------------------------------
type Util = {
  total_usable: number;
  used: number;
  reserved: number;
  available: number;
  utilization_pct: number;
  used_pct: number;
  reserved_pct: number;
};

function UtilizationBar({ util }: { util: Util }) {
  const usedPct = Math.min(util.used_pct, 100);
  const resPct = Math.min(util.reserved_pct, 100 - usedPct);
  return (
    <div>
      <div className="w-full bg-slate-200 rounded h-4 overflow-hidden flex">
        <div
          className="h-4 bg-blue-500"
          style={{ width: `${usedPct}%` }}
          title={`Used: ${util.used}`}
        />
        <div
          className="h-4 bg-amber-500"
          style={{ width: `${resPct}%` }}
          title={`Reserved: ${util.reserved}`}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
          Used {util.used}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
          Reserved {util.reserved}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 border border-slate-300 inline-block" />
          Available {util.available}
        </span>
        <span className="text-slate-400">
          Total usable {util.total_usable} · {util.utilization_pct}% consumed
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VLAN management
// ---------------------------------------------------------------------------
function VlanSection({
  siteId,
  selectedVlanId,
  onSelectVlan,
}: {
  siteId: number;
  selectedVlanId: number | null;
  onSelectVlan: (id: number | null) => void;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const { data: vlans } = useQuery({
    queryKey: ["ipam-vlans", siteId],
    queryFn: () => api.ipamVlans(siteId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ipam-vlans", siteId] });
    qc.invalidateQueries({ queryKey: ["vlans"] });
  };

  const createMut = useMutation({
    mutationFn: (payload: Row) => api.create("vlans", payload),
    onSuccess: () => {
      setErr("");
      setAdding(false);
      invalidate();
    },
    onError: (e: Error) => setErr(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Row }) =>
      api.update("vlans", id, payload),
    onSuccess: () => {
      setErr("");
      setEditId(null);
      invalidate();
    },
    onError: (e: Error) => setErr(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.remove("vlans", id),
    onSuccess: (_d, id) => {
      if (selectedVlanId === id) onSelectVlan(null);
      invalidate();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const rows = vlans ?? [];

  return (
    <Section
      title="VLANs"
      subtitle="Layer-2 segments for this site. VLAN numbers cannot be reused on other sites."
      right={
        <button
          onClick={() => {
            setAdding((a) => !a);
            setEditId(null);
          }}
          className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          {adding ? "Close" : "+ Add VLAN"}
        </button>
      }
    >
      {err && (
        <div className="mb-3 px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          {err}
        </div>
      )}

      {adding && (
        <div className="border border-blue-100 bg-blue-50/40 rounded-md p-3 mb-3">
          <VlanForm
            siteId={siteId}
            pending={createMut.isPending}
            onSubmit={(payload) => createMut.mutate(payload)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-xs text-slate-400 italic">
          No VLANs for this site yet.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">VLAN ID</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Zone</th>
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) =>
              editId === v.id ? (
                <tr key={v.id} className="border-t border-slate-100 bg-blue-50/40">
                  <td colSpan={5} className="px-3 py-3">
                    <VlanForm
                      siteId={siteId}
                      initial={v}
                      pending={updateMut.isPending}
                      onSubmit={(payload) =>
                        updateMut.mutate({ id: v.id, payload })
                      }
                      onCancel={() => setEditId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr
                  key={v.id}
                  className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${
                    selectedVlanId === v.id ? "bg-blue-50" : ""
                  }`}
                  onClick={() => onSelectVlan(v.id)}
                >
                  <td className="px-3 py-2 font-mono">{v.vlan_id}</td>
                  <td className="px-3 py-2">{v.name ?? "—"}</td>
                  <td className="px-3 py-2">{v.zone ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {v.description ?? "—"}
                  </td>
                  <td
                    className="px-3 py-2 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setEditId(v.id);
                        setAdding(false);
                      }}
                      className="px-2 py-0.5 text-xs bg-slate-200 rounded hover:bg-slate-300 mr-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete VLAN ${v.vlan_id}?`))
                          deleteMut.mutate(v.id);
                      }}
                      className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function VlanForm({
  siteId,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  siteId: number;
  initial?: Row;
  pending: boolean;
  onSubmit: (payload: Row) => void;
  onCancel: () => void;
}) {
  const [vlanId, setVlanId] = useState(String(initial?.vlan_id ?? ""));
  const [name, setName] = useState(initial?.name ?? "");
  const [zone, setZone] = useState(initial?.zone ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          vlan_id: vlanId ? Number(vlanId) : null,
          name: name || null,
          zone: zone || null,
          description: description || null,
          site_id: siteId,
        });
      }}
      className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end"
    >
      <Field label="VLAN ID">
        <input
          type="number"
          className={inputCls}
          value={vlanId}
          onChange={(e) => setVlanId(e.target.value)}
          required
        />
      </Field>
      <Field label="Name">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Zone">
        <select
          className={inputCls}
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          <option value="">— zone —</option>
          {ZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description">
        <input
          className={inputCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="col-span-2 md:col-span-4 flex gap-2">
        <button
          type="submit"
          disabled={!vlanId || pending}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : initial ? "Save" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-slate-200 rounded text-sm hover:bg-slate-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Subnet management (scoped to selected VLAN; site auto-derived)
// ---------------------------------------------------------------------------
function SubnetSection({
  siteId,
  family,
  vlanId,
}: {
  siteId: number;
  family: Family;
  vlanId: number;
}) {
  const qc = useQueryClient();
  const slug = family === "ipv4" ? "subnets-ipv4" : "subnets-ipv6";
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const { data: subnets } = useQuery({
    queryKey: ["ipam-subnets", siteId, family, vlanId],
    queryFn: () => api.ipamSubnets(siteId, family, vlanId),
  });

  const createMut = useMutation({
    mutationFn: (payload: Row) => api.create(slug, payload),
    onSuccess: () => {
      setErr("");
      setAdding(false);
      qc.invalidateQueries({
        queryKey: ["ipam-subnets", siteId, family, vlanId],
      });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const rows = subnets ?? [];

  return (
    <Section
      title={`Subnets (${family.toUpperCase()})`}
      subtitle="Segments under the selected VLAN. The site is auto-derived from the VLAN."
      right={
        <button
          onClick={() => setAdding((a) => !a)}
          className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          {adding ? "Close" : "+ Add Subnet"}
        </button>
      }
    >
      {err && (
        <div className="mb-3 px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          {err}
        </div>
      )}

      {adding && (
        <div className="border border-blue-100 bg-blue-50/40 rounded-md p-3 mb-4">
          <SubnetForm
            family={family}
            pending={createMut.isPending}
            onSubmit={(payload) =>
              createMut.mutate({
                ...payload,
                vlan_id: vlanId,
                site_id: siteId,
              })
            }
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-xs text-slate-400 italic">
          No subnets under this VLAN yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((s) => (
            <SubnetCard
              key={s.id}
              subnet={s}
              family={family}
              slug={slug}
              onChanged={() =>
                qc.invalidateQueries({
                  queryKey: ["ipam-subnets", siteId, family, vlanId],
                })
              }
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function SubnetForm({
  family,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  family: Family;
  initial?: Row;
  pending: boolean;
  onSubmit: (payload: Row) => void;
  onCancel: () => void;
}) {
  const [cidr, setCidr] = useState(initial?.network_cidr ?? "");
  const [gateway, setGateway] = useState(initial?.gateway ?? "");
  const [rangeFrom, setRangeFrom] = useState(initial?.range_from ?? "");
  const [rangeTo, setRangeTo] = useState(initial?.range_to ?? "");
  const [reservedCount, setReservedCount] = useState(
    String(initial?.reserved_count ?? 0),
  );
  const [anchor, setAnchor] = useState(
    initial?.reservation_anchor ?? "from_end",
  );
  const [description, setDescription] = useState(initial?.description ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const payload: Row = {
          network_cidr: cidr || null,
          range_from: rangeFrom || null,
          range_to: rangeTo || null,
          reserved_count: reservedCount ? Number(reservedCount) : 0,
          reservation_anchor: anchor,
          description: description || null,
        };
        if (family === "ipv4") payload.gateway = gateway || null;
        onSubmit(payload);
      }}
      className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end"
    >
      <Field label="Network CIDR">
        <input
          className={inputCls}
          placeholder="192.168.0.0/24"
          value={cidr}
          onChange={(e) => setCidr(e.target.value)}
          required
        />
      </Field>
      {family === "ipv4" && (
        <Field label="Gateway">
          <input
            className={inputCls}
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
          />
        </Field>
      )}
      <Field label="Reserved count">
        <input
          type="number"
          min={0}
          className={inputCls}
          value={reservedCount}
          onChange={(e) => setReservedCount(e.target.value)}
        />
      </Field>
      <Field label="Reservation anchor">
        <select
          className={inputCls}
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
        >
          <option value="from_end">from_end (last IP downward)</option>
          <option value="from_start">from_start (first IP upward)</option>
        </select>
      </Field>
      <Field label="Range from">
        <input
          className={inputCls}
          value={rangeFrom}
          onChange={(e) => setRangeFrom(e.target.value)}
        />
      </Field>
      <Field label="Range to">
        <input
          className={inputCls}
          value={rangeTo}
          onChange={(e) => setRangeTo(e.target.value)}
        />
      </Field>
      <Field label="Description">
        <input
          className={inputCls}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="col-span-2 md:col-span-3 flex gap-2">
        <button
          type="submit"
          disabled={!cidr || pending}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : initial ? "Save" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-slate-200 rounded text-sm hover:bg-slate-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Subnet card: utilization + anchor toggle + reservations + next-IP helper
// ---------------------------------------------------------------------------
function SubnetCard({
  subnet,
  family,
  slug,
  onChanged,
}: {
  subnet: Row;
  family: Family;
  slug: string;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [nextIp, setNextIp] = useState<string | null>(null);
  const hasCidr = Boolean(subnet.network_cidr);

  const utilKey = ["ipam-util", family, subnet.id];
  const resKey = ["ipam-reservations", family, subnet.id];

  const { data: util } = useQuery<Util>({
    queryKey: utilKey,
    queryFn: () => api.utilization(subnet.id, family),
    enabled: hasCidr,
    retry: false,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: utilKey });
    qc.invalidateQueries({ queryKey: resKey });
  };

  const updateMut = useMutation({
    mutationFn: (payload: Row) => api.update(slug, subnet.id, payload),
    onSuccess: () => {
      refreshAll();
      onChanged();
    },
  });

  const nextIpMut = useMutation({
    mutationFn: () => api.nextIp(subnet.id, family),
    onSuccess: (d: any) => setNextIp(d.next_ip ?? "none free"),
    onError: () => setNextIp("no free IP"),
  });

  const anchor = subnet.reservation_anchor ?? "from_end";

  return (
    <div className="border border-slate-200 rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-t-lg">
        <div className="font-mono text-sm font-semibold text-slate-800">
          {subnet.network_cidr ?? "(no CIDR)"}
          {family === "ipv4" && subnet.gateway && (
            <span className="ml-3 text-xs font-normal text-slate-500">
              gw {subnet.gateway}
            </span>
          )}
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="px-2 py-0.5 text-xs bg-slate-200 rounded hover:bg-slate-300"
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      <div className="p-3">
        {editing && (
          <div className="border border-blue-100 bg-blue-50/40 rounded-md p-3 mb-3">
            <SubnetForm
              family={family}
              initial={subnet}
              pending={updateMut.isPending}
              onSubmit={(payload) => {
                updateMut.mutate(payload);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        )}

        {/* Utilization */}
        {!hasCidr ? (
          <div className="text-xs text-slate-400 italic">
            No CIDR — utilization unavailable.
          </div>
        ) : util ? (
          <UtilizationBar util={util} />
        ) : (
          <div className="text-xs text-slate-400">Loading utilization…</div>
        )}

        {/* Anchor toggle + next-IP helper */}
        {hasCidr && (
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                Allocation anchor:
              </span>
              <div className="inline-flex rounded overflow-hidden border border-slate-300">
                {(["from_start", "from_end"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() =>
                      anchor !== a &&
                      updateMut.mutate({ reservation_anchor: a })
                    }
                    className={`px-2.5 py-1 text-xs ${
                      anchor === a
                        ? "bg-blue-600 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => nextIpMut.mutate()}
                className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Suggest next free IP
              </button>
              {nextIp && (
                <span className="font-mono text-sm text-emerald-700">
                  {nextIp}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Reservations */}
        {hasCidr && (
          <ReservationManager
            subnetId={subnet.id}
            family={family}
            onChanged={refreshAll}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reserved-IP pool manager per subnet
// ---------------------------------------------------------------------------
type ReservationsResp = {
  reservations: Row[];
  reserved_pool: string[];
  auto_reserved: string[];
  reserved_count: number;
  reservation_anchor: string;
  next_reserved: string | null;
  next_reserved_gap: string | null;
};

function ReservationManager({
  subnetId,
  family,
  onChanged,
}: {
  subnetId: number;
  family: Family;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const resKey = ["ipam-reservations", family, subnetId];
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const { data } = useQuery<ReservationsResp>({
    queryKey: resKey,
    queryFn: () => api.reservations(subnetId, family),
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: resKey });
    onChanged();
  };

  const addMut = useMutation({
    mutationFn: (payload: Row) => api.addReservation(subnetId, payload, family),
    onSuccess: () => {
      setErr("");
      setAdding(false);
      refresh();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const removeMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) =>
      api.removeReservation(subnetId, id, family, force),
    onSuccess: () => {
      setErr("");
      refresh();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const addrField = family === "ipv4" ? "ipv4_address" : "ipv6_address";
  const reservations = data?.reservations ?? [];

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-slate-700">
          Reserved IP pool
          <span className="ml-2 text-xs font-normal text-slate-400">
            {data
              ? `${reservations.length} reserved · anchor ${data.reservation_anchor} · target ${data.reserved_count}`
              : "…"}
          </span>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="px-2 py-0.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600"
        >
          {adding ? "Close" : "+ Reserve IP"}
        </button>
      </div>

      {err && (
        <div className="mb-2 px-3 py-1.5 bg-red-100 text-red-800 rounded text-xs">
          {err}
        </div>
      )}

      {/* Next reserved suggestion (gap-aware) */}
      {data?.next_reserved && (
        <div className="mb-2 text-xs text-slate-600">
          Next reserved suggestion:{" "}
          <span className="font-mono text-amber-700">{data.next_reserved}</span>
          {data.next_reserved_gap && (
            <span className="ml-2 text-slate-400">
              (gap available at{" "}
              <span className="font-mono">{data.next_reserved_gap}</span>)
            </span>
          )}
        </div>
      )}

      {adding && (
        <div className="border border-amber-100 bg-amber-50/50 rounded-md p-3 mb-3">
          <ReservationForm
            family={family}
            suggestion={data?.next_reserved ?? ""}
            pending={addMut.isPending}
            onSubmit={(payload) => addMut.mutate(payload)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {reservations.length === 0 ? (
        <div className="text-xs text-slate-400 italic">
          No reservations yet.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="text-left px-2 py-1.5">Role</th>
              <th className="text-left px-2 py-1.5">Label</th>
              <th className="text-left px-2 py-1.5">IP</th>
              <th className="text-left px-2 py-1.5">Locked</th>
              <th className="text-right px-2 py-1.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((r) => {
              const ip = r[addrField];
              const locked = Boolean(r.is_locked);
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">{r.role ?? "—"}</td>
                  <td className="px-2 py-1.5 text-slate-500">
                    {r.label ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono">
                    {ip ? String(ip).split("/")[0] : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    {locked ? (
                      <span
                        className="inline-flex items-center gap-1 text-amber-700"
                        title="Locked — protected from auto-reallocation"
                      >
                        🔒 locked
                      </span>
                    ) : (
                      <span className="text-slate-400">unlocked</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => {
                        if (
                          locked &&
                          !confirm(
                            "This reservation is locked. Remove it anyway?",
                          )
                        )
                          return;
                        removeMut.mutate({ id: r.id, force: locked });
                      }}
                      className="px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReservationForm({
  family,
  suggestion,
  pending,
  onSubmit,
  onCancel,
}: {
  family: Family;
  suggestion: string;
  pending: boolean;
  onSubmit: (payload: Row) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState("gateway");
  const [label, setLabel] = useState("");
  const [ip, setIp] = useState("");
  const [locked, setLocked] = useState(false);
  const [auto, setAuto] = useState(true);
  const addrField = family === "ipv4" ? "ipv4_address" : "ipv6_address";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const payload: Row = {
          role,
          label: label || null,
          is_locked: locked,
        };
        if (!auto && ip) payload[addrField] = ip;
        onSubmit(payload);
      }}
      className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end"
    >
      <Field label="Role">
        <select
          className={inputCls}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {RESERVATION_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label (optional)">
        <input
          className={inputCls}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <Field label="IP address">
        <input
          className={inputCls}
          value={auto ? "" : ip}
          disabled={auto}
          placeholder={auto ? suggestion || "auto" : ""}
          onChange={(e) => setIp(e.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Auto (next reserved{suggestion ? ` — ${suggestion}` : ""})
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => setLocked(e.target.checked)}
          />
          🔒 Lock reservation
        </label>
      </div>
      <div className="col-span-2 md:col-span-4 flex gap-2">
        <button
          type="submit"
          disabled={pending || (!auto && !ip)}
          className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Reserve"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-slate-200 rounded text-sm hover:bg-slate-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function IPAM() {
  const [siteId, setSiteId] = useState<number | null>(null);
  const [family, setFamily] = useState<Family>("ipv4");
  const [selectedVlanId, setSelectedVlanId] = useState<number | null>(null);

  const { data: sites, isLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: () => api.list("sites"),
  });

  const { data: vlans } = useQuery({
    queryKey: ["ipam-vlans", siteId],
    queryFn: () => api.ipamVlans(siteId ?? undefined),
    enabled: siteId != null,
  });

  const selectedVlan = useMemo(
    () => (vlans ?? []).find((v) => v.id === selectedVlanId) ?? null,
    [vlans, selectedVlanId],
  );

  if (isLoading) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-1">IPAM by Site</h1>
      <p className="text-sm text-slate-500 mb-4">
        Site-scoped VLANs and subnets with configurable, gap-aware reserved-IP
        pools. Select a site to scope everything below.
      </p>

      {/* Scope controls */}
      <div className="flex flex-wrap items-end gap-4 mb-5">
        <Field label="Site">
          <select
            className={`${inputCls} min-w-[16rem]`}
            value={siteId ?? ""}
            onChange={(e) => {
              setSiteId(e.target.value ? Number(e.target.value) : null);
              setSelectedVlanId(null);
            }}
          >
            <option value="">— select a site —</option>
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {lookupLabel(s)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Address family">
          <div className="inline-flex rounded overflow-hidden border border-slate-300">
            {(["ipv4", "ipv6"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFamily(f)}
                className={`px-3 py-1.5 text-sm ${
                  family === f
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {siteId == null ? (
        <div className="text-sm text-slate-400 italic border border-dashed border-slate-300 rounded-lg p-8 text-center">
          Select a site to manage its VLANs, subnets and reserved-IP pools.
        </div>
      ) : (
        <>
          <VlanSection
            siteId={siteId}
            selectedVlanId={selectedVlanId}
            onSelectVlan={setSelectedVlanId}
          />

          {selectedVlanId == null ? (
            <div className="text-sm text-slate-400 italic border border-dashed border-slate-300 rounded-lg p-6 text-center">
              Select a VLAN above to manage its subnets and reservations.
            </div>
          ) : (
            <div>
              <div className="text-sm text-slate-600 mb-2">
                Subnets for VLAN{" "}
                <span className="font-semibold">
                  {selectedVlan?.vlan_id}
                  {selectedVlan?.name ? ` (${selectedVlan.name})` : ""}
                </span>
              </div>
              <SubnetSection
                siteId={siteId}
                family={family}
                vlanId={selectedVlanId}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
