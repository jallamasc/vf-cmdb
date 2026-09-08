import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { api, Row } from "../api";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  ipCol,
  selectCol,
} from "../lib/columns";

/**
 * Post-Phase-6 QA (round 3) — "IP assignments are completely manual... I
 * should see all available IPs on a dropdown from IPv4 and IPv6."
 *
 * There is no endpoint that enumerates EVERY free address in a subnet (and
 * a literal dropdown of, say, a /16's ~65,000 free hosts wouldn't be
 * usable anyway) — the backend only ever computes ONE next-free address at
 * a time (`/ipam/subnets/{id}/next-ip` for IPv4, gap-aware and
 * range_from/range_to-respecting; `/next-reserved?family=ipv6` for IPv6,
 * same gap-aware walk honoring the subnet's reservation anchor). This
 * panel — shown once a row is selected, mirroring the `SuggestAbbreviation`/
 * `StencilPanel` idiom already used elsewhere in this app — offers a
 * one-click "Suggest next free IP" for whichever subnet that row already
 * has picked, instead of requiring the operator to look one up by hand and
 * type it in. There is also NO IPv4-to-IPv6 correspondence table anywhere
 * in this schema (only `IpAssignment` carrying both address columns on the
 * SAME row) — suggesting one address never touches or assumes anything
 * about the other.
 */
function SuggestIpPanel({
  row,
  onChanged,
}: {
  row: Row;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);

  const suggestV4 = useMutation({
    mutationFn: async () => {
      const result = await api.nextIp(Number(row.subnet_ipv4_id));
      await api.update("ip-assignments", row.id, { ipv4_address: result.next_ip });
      return result.next_ip as string;
    },
    onSuccess: (ip) => {
      setStatus(`IPv4 set to ${ip}.`);
      onChanged();
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "No free IPv4 address"),
  });

  const suggestV6 = useMutation({
    mutationFn: async () => {
      const result = await api.nextReserved(Number(row.subnet_ipv6_id), "ipv6");
      await api.update("ip-assignments", row.id, { ipv6_address: result.ip });
      return result.ip as string;
    },
    onSuccess: (ip) => {
      setStatus(`IPv6 set to ${ip}.`);
      onChanged();
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "No free IPv6 address"),
  });

  return (
    <div className="px-3 py-2 border border-slate-200 bg-slate-50 rounded flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => {
          setStatus(null);
          suggestV4.mutate();
        }}
        disabled={suggestV4.isPending || !row.subnet_ipv4_id}
        className="px-2.5 py-1 text-sm rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
        title={row.subnet_ipv4_id ? undefined : "Pick an IPv4 Subnet on this row first"}
      >
        {suggestV4.isPending ? "Looking up…" : "Suggest next free IPv4"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStatus(null);
          suggestV6.mutate();
        }}
        disabled={suggestV6.isPending || !row.subnet_ipv6_id}
        className="px-2.5 py-1 text-sm rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
        title={row.subnet_ipv6_id ? undefined : "Pick an IPv6 Subnet on this row first"}
      >
        {suggestV6.isPending ? "Looking up…" : "Suggest next free IPv6"}
      </button>
      {status && <span className="text-xs text-slate-500">{status}</span>}
    </div>
  );
}

export default function IpAssignments() {
  const qc = useQueryClient();
  const { map, isLoading } = useLookups(["subnets-ipv4", "subnets-ipv6"]);
  const [selected, setSelected] = useState<Row | null>(null);
  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );

  const subnetOpts = (map["subnets-ipv4"] ?? []).map((s) => ({
    id: s.id,
    abbreviation: s.network_cidr,
  }));
  const subnet6Opts = (map["subnets-ipv6"] ?? []).map((s) => ({
    id: s.id,
    abbreviation: s.network_cidr,
  }));

  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      fkCol("subnet_ipv4_id", "IPv4 Subnet", subnetOpts),
      ipCol("ipv4_address", "IPv4", "lan"),
      fkCol("subnet_ipv6_id", "IPv6 Subnet", subnet6Opts),
      ipCol("ipv6_address", "IPv6", "lan"),
      textCol("assigned_to_type", "Assigned Type", 150),
      numCol("assigned_to_id", "Assigned ID"),
      textCol("interface_name", "Interface"),
      textCol("dns_name", "DNS Name", 200),
      selectCol("is_primary", "Primary", [true, false], { width: 120 }),
      selectCol("status", "Status", ["active", "reserved", "deprecated"], {
        width: 140,
      }),
      textCol("notes", "Notes"),
    ],
    [map]
  );
  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  return (
    <EntityGrid
      resource="ip-assignments"
      title="IP Assignments"
      description="Individual IP address bindings to devices, VMs and interfaces. Pick a Subnet first, then select the row below to suggest its next free address instead of typing one by hand."
      columns={columns}
      newRowDefaults={{ status: "active", is_primary: false }}
      onSelectionChanged={handleSelection}
      panel={
        selected ? (
          <SuggestIpPanel
            row={selected}
            onChanged={() => qc.invalidateQueries({ queryKey: ["ip-assignments"] })}
          />
        ) : (
          <div className="px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
            Select a row below to suggest its next free IPv4/IPv6 address.
          </div>
        )
      }
    />
  );
}
