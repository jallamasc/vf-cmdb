// FEAT-003 — footer version string + non-modal update-available pill with a
// one-click "Update now" affordance. The running version and update detection
// come from the backend /api/v1/meta/version; a failed version query degrades
// silently to the build-time __APP_VERSION__ with no badge and no thrown error
// (Task D.5 / NFR 1). No global error handler, boundary, or toast is added.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type UpdateStatus } from "../api";

export default function VersionFooter() {
  const { data } = useQuery({
    queryKey: ["meta-version"],
    queryFn: api.metaVersion,
    refetchInterval: 60_000, // Task D.6: modest background poll
    refetchOnWindowFocus: true,
    retry: false, // Task D.5: fail silent, no retry storm
    staleTime: 55_000,
  });

  // On any failure data is undefined -> show build-time version only, no badge.
  const running = data?.version ?? __APP_VERSION__;

  return (
    <div className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-700">
      <div>Single-user · No auth · Home network</div>
      <div className="mt-1 flex items-center gap-2">
        <span>v{running}</span>
        {data?.updateAvailable && data.latest && (
          <UpdateBadge latest={data.latest} />
        )}
      </div>
    </div>
  );
}

/** A terminal state ends polling; everything else means a run is in flight. */
function isTerminal(state: UpdateStatus["state"] | undefined): boolean {
  return state === "succeeded" || state === "failed";
}

function UpdateBadge({ latest }: { latest: string }) {
  const queryClient = useQueryClient();
  // Null until the operator clicks; then it tracks the live update run.
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [polling, setPolling] = useState(false);
  // Finding 4: a transient idle/absent/unreachable window right after the POST
  // is "still starting", not failed. We only trust an 'idle' once the host has
  // actually started the run (observed a non-idle state at least once).
  const sawActive = useRef(false);

  const mutation = useMutation({
    mutationFn: api.requestUpdate,
    onSuccess: (initial) => {
      setStatus(initial); // state 'requested' from the backend
      setPolling(true);
    },
  });

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const next = await api.updateStatus();
        if (cancelled) return;
        if (next.state !== "idle") sawActive.current = true;
        // Finding 4: before the host writes its first 'running', the status
        // file may be absent -> backend returns 'idle'. Treat that early idle
        // (and any transient idle before we've seen activity) as still-starting
        // rather than letting it look like the run never happened.
        if (next.state === "idle" && !sawActive.current) {
          return; // keep showing "still starting", keep polling
        }
        setStatus(next);
        if (isTerminal(next.state)) {
          setPolling(false);
          if (next.state === "succeeded") {
            // Re-read the (now new) running version into the footer.
            queryClient.invalidateQueries({ queryKey: ["meta-version"] });
          }
        }
      } catch {
        // Finding 4: the backend restarts mid-update, so an unreachable window
        // is expected — treat it as "still running", not a failure. Keep the
        // last known status and keep polling.
      }
    }, 3_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [polling, queryClient]);

  const state = status?.state;
  const running = state === "running";
  // Finding 3: disable "Update now" while a run is in flight.
  const inFlight = mutation.isPending || polling;
  const target = status?.requestedVersion ?? "latest";

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-amber-900/40 px-2 py-0.5 text-amber-300">
      {status ? (
        <span>
          {state === "succeeded"
            ? `Updated → v${latest}`
            : state === "failed"
              ? `Update failed${status.message ? `: ${status.message}` : ""}`
              : `Updating → ${target === "latest" ? "latest" : `v${target}`}${
                  status.message ? ` — ${status.message}` : ""
                }`}
        </span>
      ) : (
        <span>Update available → v{latest}</span>
      )}
      {mutation.isError && (
        <span className="text-red-300">
          {(mutation.error as Error).message}
        </span>
      )}
      {!isTerminal(state) && (
        <button
          type="button"
          aria-label={`Update now to version ${latest}`}
          disabled={inFlight}
          onClick={() => mutation.mutate()}
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            inFlight
              ? "cursor-not-allowed bg-slate-700 text-slate-400"
              : "bg-amber-600 text-white hover:bg-amber-500"
          }`}
        >
          {running ? "Updating…" : "Update now"}
        </button>
      )}
    </span>
  );
}
