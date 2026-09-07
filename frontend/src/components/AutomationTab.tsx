import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, Row } from "../api";

interface Props {
  /** Resource slug, e.g. "generic-entities". */
  resource: string;
  /** The specific record whose Semaphore automation this is. */
  row: Row;
}

const TERMINAL_STATUSES = ["success", "error", "stopped"];

function isTerminal(status: string | undefined): boolean {
  return !!status && TERMINAL_STATUSES.includes(status);
}

/**
 * Phase 5 Task 39 (Req 31.2) — one launched task's status + on-demand
 * output, polling until the task reaches a terminal Semaphore status.
 * Session-local only: `taskId` comes from the parent's in-memory history
 * list (Task 39's design decision — no new vf-cmdb table for task history,
 * see design.md Sub-phase F).
 */
function TaskRow({
  resource,
  row,
  taskId,
  semaphoreUrl,
  projectId,
}: {
  resource: string;
  row: Row;
  taskId: number;
  semaphoreUrl: string | null;
  projectId: number | null;
}) {
  const [showOutput, setShowOutput] = useState(false);

  const { data: task } = useQuery({
    queryKey: ["automation-task", resource, row.id, taskId],
    queryFn: () => api.getAutomationTask(resource, row.id, taskId),
    refetchInterval: (query) => (isTerminal(query.state.data?.status) ? false : 2000),
  });

  const { data: output } = useQuery({
    queryKey: ["automation-task-output", resource, row.id, taskId],
    queryFn: () => api.getAutomationTaskOutput(resource, row.id, taskId),
    enabled: showOutput,
    refetchInterval: (query) =>
      showOutput && !isTerminal(task?.status) && (query.state.data?.length ?? 0) >= 0 ? 2000 : false,
  });

  // Deep link verified against Semaphore's real frontend route (Task 39
  // investigation): /project/:projectId/history?t=<task_id>.
  const deepLink =
    semaphoreUrl && projectId != null
      ? `${semaphoreUrl.replace(/\/$/, "")}/project/${projectId}/history?t=${taskId}`
      : null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-sm border-b border-slate-200 pb-1 last:border-b-0 last:pb-0">
      <span className="font-mono text-slate-600">#{taskId}</span>
      <span
        className={
          "px-1.5 py-0.5 rounded text-xs font-medium " +
          (task?.status === "success"
            ? "bg-green-100 text-green-800"
            : task?.status === "error"
            ? "bg-red-100 text-red-800"
            : task?.status === "stopped"
            ? "bg-slate-200 text-slate-700"
            : "bg-amber-100 text-amber-800")
        }
      >
        {task?.status ?? "…"}
      </span>
      <button
        type="button"
        onClick={() => setShowOutput((v) => !v)}
        className="px-2 py-0.5 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
      >
        {showOutput ? "Hide output" : "Show output"}
      </button>
      {deepLink && (
        <a
          href={deepLink}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 underline"
        >
          Open in Semaphore
        </a>
      )}
      {showOutput && (
        <pre className="w-full mt-1 p-2 bg-slate-900 text-slate-100 text-xs rounded overflow-x-auto max-h-48 overflow-y-auto">
          {(output ?? []).map((l) => l.output).join("\n") || "No output yet."}
        </pre>
      )}
    </div>
  );
}

/**
 * Phase 5 Task 39 (Req 31.1/31.2/31.3) — sync status, job-template launch,
 * inline output/history and a deep link to Semaphore for one record.
 * Rendered inside `GenericEntityView`'s `CapabilityPanel` for any record
 * whose Entity_Type_Def has the `ansible_managed` Capability, alongside
 * `CredentialField` (Task 34) which shares that same capability gate.
 */
export default function AutomationTab({ resource, row }: Props) {
  const [taskIds, setTaskIds] = useState<number[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const { data: automationStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["automation-status", resource, row.id],
    queryFn: () => api.automationStatus(resource, row.id),
  });

  const { data: templates } = useQuery({
    queryKey: ["automation-templates", resource, row.id],
    queryFn: () => api.automationTemplates(resource, row.id),
    enabled: !!automationStatus?.configured,
  });

  const launch = useMutation({
    mutationFn: () => api.launchAutomationTask(resource, row.id, Number(templateId)),
    onSuccess: (task) => {
      setTaskIds((ids) => [task.id, ...ids]);
      setStatus(null);
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Launch failed"),
  });

  if (statusLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!automationStatus?.configured) {
    return (
      <p className="text-sm text-slate-500">
        Semaphore automation is not configured for this project yet.
      </p>
    );
  }

  const hasInventory = automationStatus.inventory_id != null;

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-700">
        Inventory:{" "}
        <span className="font-mono">{hasInventory ? "Linked" : "Not linked"}</span>
        {"  ·  "}
        Credential:{" "}
        <span className="font-mono">
          {automationStatus.has_credential ? "Linked" : "Not linked"}
        </span>
      </p>
      {!hasInventory ? (
        <p className="text-sm text-slate-500">
          No Semaphore inventory linked for this record yet.
        </p>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            aria-label="Automation template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">Select a template…</option>
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => launch.mutate()}
            disabled={!templateId || launch.isPending}
            className="px-2.5 py-1 text-sm rounded bg-slate-800 text-white disabled:opacity-50"
          >
            {launch.isPending ? "Launching…" : "Launch"}
          </button>
        </div>
      )}
      {status && <span className="text-xs text-red-600">{status}</span>}
      {taskIds.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">History</p>
          <div className="space-y-1">
            {taskIds.map((id) => (
              <TaskRow
                key={id}
                resource={resource}
                row={row}
                taskId={id}
                semaphoreUrl={automationStatus.semaphore_url}
                projectId={automationStatus.project_id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
