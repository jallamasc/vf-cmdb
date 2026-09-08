import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import EntityGrid from "../components/EntityGrid";
import { StencilPanel } from "../components/StencilField";
import {
  useLookups,
  textCol,
  roCol,
  numCol,
  fkCol,
  ipCol,
  selectCol,
  generatedCol,
} from "../lib/columns";
import { Row } from "../api";

const LK = [
  "virtual-machines",
  "physical-servers",
  "sites",
  "app-types",
  "device-roles",
];

export default function ContainersApps() {
  const qc = useQueryClient();
  const { map, isLoading } = useLookups(LK);
  // Phase 6 Task 27 (Req 10.2-10.4) — ContainerApp has no dedicated per-id
  // detail page (unlike physical-servers/virtual-machines/etc's
  // DeviceDashboard route), so its own grid's selection panel is the entry
  // point for the stencil override this page's model now carries (Task 26).
  const [selected, setSelected] = useState<Row | null>(null);
  const handleSelection = useCallback(
    (rows: Row[]) => setSelected(rows.length === 1 ? rows[0] : null),
    []
  );
  const columns = useMemo(
    () => [
      roCol("id", "ID", 70),
      // Bug fix (post-Phase-6 QA, round 3) — column-order convention: ID ->
      // Fantastic Name -> VF Long Name -> VF Short Name -> rest.
      // ContainerApp has no `vf_long_name`, so this is Fantastic Name
      // (`friendly_name`) -> VF Short Name.
      textCol("friendly_name", "Fantastic Name", 160),
      generatedCol("vf_short_name", "VF Short Name", 130),
      selectCol("container_type", "Type", ["cn", "ap"], { width: 120 }),
      fkCol("host_vm_id", "Host VM", map["virtual-machines"]),
      fkCol("host_server_id", "Host Server", map["physical-servers"]),
      fkCol("site_id", "Site", map["sites"]),
      fkCol("app_type_id", "App Type", map["app-types"]),
      fkCol("role_id", "Role", map["device-roles"]),
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
    <EntityGrid
      resource="containers-apps"
      title="Containers & Applications"
      description="Containerised workloads and applications running on VMs or servers."
      columns={columns}
      newRowDefaults={{ container_type: "cn" }}
      panel={
        <StencilPanel
          resource="containers-apps"
          label="container/app"
          selected={selected}
          onChanged={() => qc.invalidateQueries({ queryKey: ["containers-apps"] })}
        />
      }
      onSelectionChanged={handleSelection}
    />
  );
}
