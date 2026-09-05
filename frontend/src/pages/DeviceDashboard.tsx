/**
 * FEAT-7 — Device Detail Dashboard.
 *
 * Route: ``/devices/:type/:id`` where ``:type`` is one of ``physical_servers``,
 * ``virtual_machines``, ``workstations`` or ``network_devices``.
 *
 * One device, seven tabs. Which tabs exist is decided by the backend
 * (``GET /devices/{type}/{id}`` returns a ``relations`` list) so a tab that
 * could never hold data for a given device type — VMs on a workstation, for
 * instance — is not rendered at all rather than rendered empty.
 *
 * Every related tab reads a server-side filtered slice
 * (``/devices/{type}/{id}/related/{relation}``) but *writes* through the normal
 * CRUD routes, which is what keeps changelog and naming behaviour identical to
 * the full listing pages.
 */
import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import EntityGrid, { friendlyError } from "../components/EntityGrid";
import type { RequiredField } from "../components/EntityGrid";
import DeviceOverviewForm from "../components/DeviceOverviewForm";
import { api, DEVICE_TYPE_KEYS, Row } from "../api";
import type { DeviceDetail, DeviceRelated, DeviceTypeKey } from "../api";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  ipCol,
  selectCol,
} from "../lib/columns";
import { DEVICE_SCHEMAS } from "../lib/deviceSchema";

/** Tab keys that are not backend relations. */
const OVERVIEW = "overview";
const FACTS = "facts";

const TAB_LABELS: Record<string, string> = {
  [OVERVIEW]: "Overview",
  interfaces: "Interfaces",
  "ip-assignments": "IP Assignments",
  "virtual-machines": "VMs & Containers",
  "containers-apps": "Containers",
  cables: "Cables",
  changelog: "Changelog",
  [FACTS]: "Ansible Facts",
};

function isDeviceType(value: string | undefined): value is DeviceTypeKey {
  return !!value && (DEVICE_TYPE_KEYS as string[]).includes(value);
}

const relatedKey = (type: DeviceTypeKey, id: number, relation: string) => [
  "device-related",
  type,
  id,
  relation,
];

/** Height given to each grid when a tab stacks more than one of them. */
const STACKED_GRID_HEIGHT = 440;

// ---------------------------------------------------------------------------
// Related-record tab
// ---------------------------------------------------------------------------
interface RelatedGridProps {
  detail: DeviceDetail;
  relation: string;
  title: string;
  columns: ColDef[];
  /** Values a newly added row must carry so it stays attached to this device. */
  newRowDefaults?: (rel: DeviceRelated) => Row;
  requiredFields?: RequiredField[];
  /** Force "read only" even when the backend says the rows are owned. */
  readOnly?: boolean;
}

/**
 * One AG Grid bound to a device relation.
 *
 * ``owned`` from the API decides whether rows can be added or deleted here: a
 * physical server, for example, can *see* the switch ports it is patched into
 * but cannot create one, because ``device_interfaces.network_device_id`` is
 * NOT NULL and belongs to the switch.
 */
function RelatedGrid({
  detail,
  relation,
  title,
  columns,
  newRowDefaults,
  requiredFields,
  readOnly = false,
}: RelatedGridProps) {
  const queryKey = relatedKey(detail.device_type, detail.id, relation);
  const fetchRelated = () =>
    api.deviceRelated(detail.device_type, detail.id, relation);

  const { data: rel, isError, error } = useQuery({
    queryKey,
    queryFn: fetchRelated,
  });

  const dataSource = useMemo(
    () => ({
      queryKey,
      fetch: fetchRelated,
      select: (d: unknown) => (d as DeviceRelated).rows,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail.device_type, detail.id, relation]
  );

  if (isError) {
    return (
      <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
        Failed to load {title}: {friendlyError((error as Error)?.message ?? "")}
      </div>
    );
  }

  const canWrite = !readOnly && (rel?.owned ?? false);

  return (
    <EntityGrid
      resource={detail.relation_resources[relation] ?? relation}
      title={title}
      description={
        <>
          {rel?.note}
          {!canWrite && rel && (
            <span className="ml-1 text-slate-400">
              Read-only here — edit these rows on their own page.
            </span>
          )}
        </>
      }
      columns={columns}
      dataSource={dataSource}
      newRowDefaults={() => (rel && newRowDefaults ? newRowDefaults(rel) : {})}
      requiredFields={requiredFields}
      allowAdd={canWrite && !!newRowDefaults}
      allowDelete={canWrite}
      minHeight={360}
      footerHint={
        canWrite
          ? "Click a cell to edit · Enter to save · Esc to cancel · new rows are pre-linked to this device · every change is written to the changelog."
          : "These rows belong to another record, so they cannot be added or deleted from this tab."
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
function InterfacesTab({ detail }: { detail: DeviceDetail }) {
  const { map, isLoading } = useLookups(["network-devices", "vlans"]);
  const owned = detail.device_type === "network_devices";

  const deviceOpts = (map["network-devices"] ?? []).map((d) => ({
    id: d.id,
    abbreviation: d.vf_friendly_name || d.vf_long_name || `dev-${d.id}`,
  }));
  const vlanOpts = (map["vlans"] ?? []).map((v) => ({
    id: v.id,
    abbreviation: `${v.vlan_id ?? ""} ${v.name ?? ""}`.trim() || `vlan-${v.id}`,
  }));

  const columns = useMemo<ColDef[]>(
    () => [
      roCol("id", "ID", 70),
      // Only meaningful when looking at ports that belong to *another* switch.
      ...(owned ? [] : [fkCol("network_device_id", "Switch", deviceOpts)]),
      numCol("port_number", "Port"),
      selectCol("port_mode", "Mode", ["access", "trunk", "aggregation", "disabled"], {
        width: 150,
      }),
      textCol("portgroup", "Port group"),
      textCol("aggregation_id", "Agg ID"),
      fkCol("pvid_vlan_id", "PVID VLAN", vlanOpts),
      textCol("objective", "Objective", 150),
      textCol("speed", "Speed"),
      textCol("connected_device_type", "Conn type"),
      numCol("connected_device_id", "Conn ID"),
      textCol("connected_port", "Conn port"),
      selectCol("admin_status", "Admin", ["up", "down"], { width: 120 }),
      textCol("description", "Description", 180),
      textCol("notes", "Notes"),
    ],
    [map, owned]
  );

  if (isLoading) return <div className="text-slate-500">Loading…</div>;

  return (
    <>
      <RelatedGrid
        detail={detail}
        relation="interfaces"
        title="Interfaces"
        columns={columns}
        newRowDefaults={
          owned
            ? (rel) => ({
                [rel.fk_field ?? "network_device_id"]: detail.id,
                admin_status: "up",
                port_mode: "access",
              })
            : undefined
        }
        requiredFields={[
          {
            field: "network_device_id",
            label: "Switch",
            hint: "A port always belongs to a network device.",
          },
        ]}
      />
      {!owned && (
        <p className="text-xs text-slate-400 mt-2">
          Ports are stored against the switch that provides them
          (<code>device_interfaces.network_device_id</code> is NOT NULL). The rows
          above are the ones whose <code>connected_device_type</code> /
          <code> connected_device_id</code> point back at this device. Create new
          ports from{" "}
          <Link to="/port-config" className="text-blue-600 hover:underline">
            Device Port Config
          </Link>
          .
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// IP assignments
// ---------------------------------------------------------------------------
function IpAssignmentsTab({ detail }: { detail: DeviceDetail }) {
  const { map, isLoading } = useLookups(["subnets-ipv4", "subnets-ipv6"]);
  const subnet4 = (map["subnets-ipv4"] ?? []).map((s) => ({
    id: s.id,
    abbreviation: s.network_cidr,
  }));
  const subnet6 = (map["subnets-ipv6"] ?? []).map((s) => ({
    id: s.id,
    abbreviation: s.network_cidr,
  }));

  const columns = useMemo<ColDef[]>(
    () => [
      roCol("id", "ID", 70),
      ipCol("ipv4_address", "IPv4", "lan"),
      ipCol("ipv6_address", "IPv6", "lan"),
      fkCol("subnet_ipv4_id", "IPv4 subnet", subnet4),
      fkCol("subnet_ipv6_id", "IPv6 subnet", subnet6),
      textCol("interface_name", "Interface"),
      textCol("dns_name", "DNS name", 200),
      selectCol("is_primary", "Primary", [true, false], { width: 120 }),
      selectCol("status", "Status", ["active", "reserved", "deprecated"], {
        width: 140,
      }),
      textCol("notes", "Notes"),
      roCol("assigned_to_type", "Assigned type", 150),
      roCol("assigned_to_id", "Assigned ID", 120),
    ],
    [map]
  );

  if (isLoading) return <div className="text-slate-500">Loading…</div>;

  return (
    <RelatedGrid
      detail={detail}
      relation="ip-assignments"
      title="IP Assignments"
      columns={columns}
      newRowDefaults={(rel) => ({
        assigned_to_type: rel.assigned_to_type,
        [rel.fk_field ?? "assigned_to_id"]: detail.id,
        status: "active",
        is_primary: false,
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// VMs & containers (physical servers) / containers (VMs)
// ---------------------------------------------------------------------------
function GuestsTab({ detail }: { detail: DeviceDetail }) {
  const hostsVms = detail.relations.includes("virtual-machines");
  const hostsContainers = detail.relations.includes("containers-apps");
  const { map, isLoading } = useLookups([
    "sites",
    "cluster-types",
    "device-roles",
    "os-families",
    "os-versions",
    "app-types",
  ]);

  const vmColumns = useMemo<ColDef[]>(
    () => [
      roCol("id", "ID", 70),
      roCol("vf_short_name", "Short name", 140),
      textCol("friendly_name", "Friendly name", 160),
      fkCol("site_id", "Site", map["sites"]),
      fkCol("cluster_type_id", "Cluster", map["cluster-types"]),
      fkCol("role_id", "Role", map["device-roles"]),
      fkCol("os_family_id", "OS family", map["os-families"]),
      fkCol("os_version_id", "OS version", map["os-versions"]),
      numCol("consecutive", "Seq"),
      ipCol("management_ipv4", "Mgmt IPv4", "servers"),
      ipCol("management_ipv6", "Mgmt IPv6", "servers"),
      textCol("management_fqdn", "Mgmt FQDN", 200),
      textCol("description", "Description", 200),
      textCol("notes", "Notes"),
    ],
    [map]
  );

  const containerColumns = useMemo<ColDef[]>(
    () => [
      roCol("id", "ID", 70),
      roCol("vf_short_name", "Short name", 140),
      textCol("friendly_name", "Friendly name", 160),
      selectCol("container_type", "Type", ["cn", "ap"], { width: 120 }),
      fkCol("app_type_id", "App type", map["app-types"]),
      fkCol("role_id", "Role", map["device-roles"]),
      fkCol("site_id", "Site", map["sites"]),
      textCol("version", "Version"),
      numCol("consecutive", "Seq"),
      ipCol("ipv4_address", "IPv4", "services"),
      ipCol("ipv6_address", "IPv6", "services"),
      textCol("description", "Description", 200),
      textCol("notes", "Notes"),
    ],
    [map]
  );

  if (isLoading) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* AG Grid sizes itself with height:100%, which only resolves against a
          parent whose height is *definite*. Single-grid tabs inherit the
          definite height of the tab panel, but stacking two grids means each
          one needs its own explicit height or the grid body collapses to 0. */}
      {hostsVms && (
        <div style={{ height: STACKED_GRID_HEIGHT }}>
          <RelatedGrid
            detail={detail}
            relation="virtual-machines"
            title="Virtual Machines"
            columns={vmColumns}
            newRowDefaults={(rel) => ({
              [rel.fk_field ?? "host_server_id"]: detail.id,
            })}
          />
        </div>
      )}
      {hostsContainers && (
        <div style={{ height: STACKED_GRID_HEIGHT }}>
          <RelatedGrid
            detail={detail}
            relation="containers-apps"
            title="Containers & Applications"
            columns={containerColumns}
            newRowDefaults={(rel) => ({
              [rel.fk_field ?? "host_server_id"]: detail.id,
              container_type: "cn",
            })}
          />
        </div>
      )}
      {hostsVms && (
        <p className="text-xs text-slate-400">
          A VM added here is pre-linked to this host; its short name is generated
          from role, OS family and sequence as soon as those are set. Containers
          nested inside one of these VMs appear on that VM&apos;s own dashboard.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cables
// ---------------------------------------------------------------------------
function CablesTab({ detail }: { detail: DeviceDetail }) {
  const columns = useMemo<ColDef[]>(
    () => [
      roCol("id", "ID", 70),
      selectCol("cable_type", "Type", ["structured", "patchcord"]),
      textCol("port_a_type", "A type"),
      numCol("port_a_id", "A ID"),
      textCol("label_a", "A label"),
      textCol("port_b_type", "B type"),
      numCol("port_b_id", "B ID"),
      textCol("label_b", "B label"),
      textCol("media_type", "Media"),
      numCol("length_meters", "Length (m)"),
      textCol("notes", "Notes"),
    ],
    []
  );

  return (
    <>
      <RelatedGrid
        detail={detail}
        relation="cables"
        title="Cables"
        columns={columns}
        newRowDefaults={(rel) => ({
          cable_type: "patchcord",
          port_a_type: rel.port_type,
          port_a_id: detail.id,
        })}
      />
      <p className="text-xs text-slate-400 mt-2">
        A cable end is polymorphic: <code>port_a_type</code> /{" "}
        <code>port_b_type</code> name the kind of thing the end lands on and{" "}
        <code>port_a_id</code> / <code>port_b_id</code> its row id. Rows are
        matched here on either end, and a cable added from this tab gets end A
        pre-filled with <code>{detail.resource}</code> #{detail.id}.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Changelog
// ---------------------------------------------------------------------------
function ChangelogTab({ detail }: { detail: DeviceDetail }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: relatedKey(detail.device_type, detail.id, "changelog"),
    queryFn: () => api.deviceRelated(detail.device_type, detail.id, "changelog"),
  });

  if (isLoading) return <div className="text-slate-500">Loading…</div>;
  if (isError) {
    return (
      <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
        Failed to load the changelog:{" "}
        {friendlyError((error as Error)?.message ?? "")}
      </div>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-lg font-semibold">Changelog</h2>
        <Link to="/changelog" className="text-sm text-blue-600 hover:underline">
          All tables →
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-3">
        {data?.note} {rows.length} entr{rows.length === 1 ? "y" : "ies"}, newest
        first.
      </p>

      {rows.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-500 text-sm">
          No recorded changes for this record yet. Every create, update and
          delete made through the API — including Ansible fact ingestion — is
          appended here automatically.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Field</th>
                <th className="text-left px-3 py-2">Old → New</th>
                <th className="text-left px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: Row) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(c.changed_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{c.field_name}</td>
                  <td className="px-3 py-2 text-slate-600 break-all">
                    <span className="text-red-600">{c.old_value ?? "∅"}</span> →{" "}
                    <span className="text-green-700">{c.new_value ?? "∅"}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-xs">
                      {c.change_source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ansible facts (Phase 4 Req 21)
// ---------------------------------------------------------------------------
/** Phase 4 Req 21.2 — the columns every fact-collectable device type promotes. */
const PROMOTED_FACT_FIELDS: { field: string; label: string }[] = [
  { field: "cpu_cores", label: "CPU Cores" },
  { field: "memory_mb", label: "Memory (MB)" },
  { field: "os_distribution", label: "OS Distribution" },
];

/**
 * Recursive, dependency-free JSON tree viewer for the `ansible_facts` blob.
 * Objects/arrays render as a collapsible `<details>`; primitives render as
 * plain key: value text. Root-level object opens expanded so the blob's
 * shape is visible at a glance without extra clicks.
 */
export function JsonTree({ data, defaultOpen = false }: { data: unknown; defaultOpen?: boolean }) {
  if (data === null || data === undefined) {
    return <span className="text-slate-400 italic">null</span>;
  }
  if (typeof data !== "object") {
    return <span className="text-slate-700">{String(data)}</span>;
  }
  const entries = Array.isArray(data)
    ? data.map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) {
    return <span className="text-slate-400 italic">{Array.isArray(data) ? "[]" : "{}"}</span>;
  }
  return (
    <details open={defaultOpen} className="ml-2">
      <summary className="cursor-pointer text-slate-500 select-none">
        {Array.isArray(data) ? `Array(${entries.length})` : `Object(${entries.length})`}
      </summary>
      <div className="ml-3 border-l border-slate-200 pl-3">
        {entries.map(([key, value]) => (
          <div key={key} className="text-xs py-0.5">
            <span className="font-mono text-slate-500">{key}: </span>
            {typeof value === "object" && value !== null ? (
              <JsonTree data={value} />
            ) : (
              <span className="text-slate-800">{JSON.stringify(value)}</span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * Requirement 21.4 — promoted fact columns + a collapsible view of the full
 * `ansible_facts` blob. Facts arrive via an EXTERNAL Ansible callback
 * (`POST /devices/{slug}/{id}/facts`) — this tab is read-only, matching
 * every other read-mostly dashboard tab; it does not trigger ingestion.
 */
export function AnsibleFactsTab({ detail }: { detail: DeviceDetail }) {
  const record = detail.record;
  const blob = record.ansible_facts as Record<string, unknown> | null | undefined;
  const lastSync = record.last_fact_sync_at as string | null | undefined;
  const anyPromoted = PROMOTED_FACT_FIELDS.some((f) => record[f.field] != null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Ansible Facts</h2>
        <p className="text-sm text-slate-500">
          {lastSync
            ? `Last synced ${new Date(lastSync).toLocaleString()}.`
            : "No fact collection has run against this record yet."}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Promoted fields</h3>
        {anyPromoted ? (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PROMOTED_FACT_FIELDS.map((f) => (
              <div key={f.field} className="bg-slate-50 border border-slate-200 rounded p-2">
                <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                  {f.label}
                </dt>
                <dd className="text-sm text-slate-800 font-medium">
                  {record[f.field] ?? <span className="text-slate-400 italic">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-400 italic">Nothing collected yet.</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Full facts blob</h3>
        {blob && Object.keys(blob).length > 0 ? (
          <div className="bg-white border border-slate-200 rounded p-3 max-h-96 overflow-auto">
            <JsonTree data={blob} defaultOpen />
          </div>
        ) : (
          <p className="text-sm text-slate-400 italic">No raw facts recorded yet.</p>
        )}
      </div>

      <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-slate-50">
        <p className="text-sm text-slate-600">Point a playbook at:</p>
        <pre className="mt-1 text-xs bg-slate-900 text-slate-100 rounded p-3 overflow-auto">
          {`POST /api/v1/devices/${detail.resource}/${detail.id}/facts
Content-Type: application/json

{ "cpu_cores": 8, "memory_mb": 16384, "os_distribution": "Ubuntu 22.04", "...": "..." }`}
        </pre>
        <p className="text-xs text-slate-400 mt-2">
          Promoted keys (cpu_cores, memory_mb, os_distribution) get their own column;
          every key — promoted or not — is also kept in the full facts blob above.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DeviceDashboard() {
  const { type, id } = useParams();
  const [params, setParams] = useSearchParams();
  const deviceId = Number(id);
  const valid = isDeviceType(type) && Number.isFinite(deviceId);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["device", type, deviceId],
    queryFn: () => api.deviceDetail(type as string, deviceId),
    enabled: valid,
  });

  if (!valid) {
    return (
      <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
        “{type}/{id}” is not a device. Expected one of:{" "}
        {DEVICE_TYPE_KEYS.join(", ")} and a numeric id.
      </div>
    );
  }
  if (isLoading) return <div className="text-slate-500">Loading device…</div>;
  if (isError || !data) {
    return (
      <div className="space-y-3">
        <div className="px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          {friendlyError((error as Error)?.message ?? "Device not found")}
        </div>
        <Link
          to={`/${DEVICE_SCHEMAS[type as DeviceTypeKey].resource}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to {DEVICE_SCHEMAS[type as DeviceTypeKey].label}s
        </Link>
      </div>
    );
  }

  const detail = data;
  // "containers-apps" is folded into the VMs tab for hosts that have both.
  const relationTabs = detail.relations.filter(
    (r) =>
      !(r === "containers-apps" && detail.relations.includes("virtual-machines"))
  );
  const tabs = [OVERVIEW, ...relationTabs, FACTS];
  const requested = params.get("tab") ?? OVERVIEW;
  const active = tabs.includes(requested) ? requested : OVERVIEW;

  const selectTab = (tab: string) => {
    const next = new URLSearchParams(params);
    if (tab === OVERVIEW) next.delete("tab");
    else next.set("tab", tab);
    setParams(next, { replace: true });
  };

  const renderTab = () => {
    switch (active) {
      case OVERVIEW:
        return <DeviceOverviewForm detail={detail} />;
      case "interfaces":
        return <InterfacesTab detail={detail} />;
      case "ip-assignments":
        return <IpAssignmentsTab detail={detail} />;
      case "virtual-machines":
      case "containers-apps":
        return <GuestsTab detail={detail} />;
      case "cables":
        return <CablesTab detail={detail} />;
      case "changelog":
        return <ChangelogTab detail={detail} />;
      case FACTS:
        return <AnsibleFactsTab detail={detail} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <nav className="text-xs text-slate-500 mb-1">
        <Link to={`/${detail.resource}`} className="hover:underline">
          {detail.label}s
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-700">{detail.display_name}</span>
      </nav>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold break-all">{detail.display_name}</h1>
        <p className="text-sm text-slate-500">
          {detail.label} #{detail.id}
          {detail.context.position && (
            <>
              {" · "}
              {detail.context.position}
            </>
          )}
          {detail.context.host_server && (
            <>
              {" · host "}
              {detail.context.host_server}
            </>
          )}
        </p>
      </header>

      <div className="border-b border-slate-200 mb-4 overflow-x-auto">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => selectTab(tab)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                active === tab
                  ? "border-blue-600 text-blue-700 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {TAB_LABELS[tab] ?? tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">{renderTab()}</div>
    </div>
  );
}
