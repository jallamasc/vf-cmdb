import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, Row } from "../api";

interface Props {
  /** Resource slug, e.g. "generic-entities". */
  resource: string;
  /** The specific record whose default admin credential this is. */
  row: Row;
}

/**
 * Phase 5 Task 34 (Req 28.2/28.3) — masked default-admin-credential
 * indicator with reveal/regenerate actions for one record.
 *
 * The password itself is never stored anywhere in this app — `row` only
 * ever carries `admin_username`/`bw_secret_id` (the Secrets_Client's own
 * reference). Reveal/regenerate fetch the plaintext value on demand from
 * the backend (which fetches it from Bitwarden), and it's kept only in this
 * component's local state — never written to `localStorage`, the react-query
 * cache, or anywhere else that would outlive this render (Req 28.3).
 */
export default function CredentialField({ resource, row }: Props) {
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const reveal = useMutation({
    mutationFn: () => api.revealCredential(resource, row.id),
    onSuccess: (data) => {
      setRevealed(data);
      setStatus(null);
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Reveal failed"),
  });

  const regenerate = useMutation({
    mutationFn: () => api.regenerateCredential(resource, row.id),
    onSuccess: (data) => {
      setRevealed(data);
      setStatus("Regenerated");
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Regenerate failed"),
  });

  if (!row.bw_secret_id) {
    return (
      <p className="text-sm text-slate-500">
        No credential provisioned yet (Bitwarden may not be configured).
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-slate-700">
        Username: <span className="font-mono">{row.admin_username}</span>
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-sm text-slate-500 tracking-wider">
          {revealed ? revealed.password : "••••••••••••"}
        </span>
        <button
          type="button"
          onClick={() => reveal.mutate()}
          disabled={reveal.isPending}
          className="px-2.5 py-1 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {reveal.isPending ? "Revealing…" : "Reveal"}
        </button>
        <button
          type="button"
          onClick={() => regenerate.mutate()}
          disabled={regenerate.isPending}
          className="px-2.5 py-1 text-sm rounded bg-slate-800 text-white disabled:opacity-50"
        >
          {regenerate.isPending ? "Regenerating…" : "Regenerate"}
        </button>
      </div>
      {status && <span className="text-xs text-slate-500">{status}</span>}
    </div>
  );
}
