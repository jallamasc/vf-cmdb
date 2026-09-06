import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";

interface Props {
  /** Resource slug, e.g. "rooms", "datacenter-floors", "sections". */
  resource: string;
  /** The specific record the blueprint belongs to. */
  row: Row;
}

/**
 * Phase 5 Task 26/27 (Req 21.3, 22.3) — upload/view a blueprint (floor plan
 * image) for one Floor/Room/Section record. Mirrors `PhotoField.tsx`
 * exactly — same URL-paste-or-upload idiom — just pointed at the separate
 * `blueprint_url` column/asset class and the `/blueprints/...` endpoints.
 */
export default function BlueprintField({ resource, row }: Props) {
  const qc = useQueryClient();
  const [url, setUrl] = useState<string>(row.blueprint_url ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: [resource] });

  const saveUrl = useMutation({
    mutationFn: () => api.update(resource, row.id, { blueprint_url: url || null }),
    onSuccess: () => {
      setStatus("Blueprint URL saved");
      invalidate();
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Save failed"),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadBlueprint(resource, row.id, file),
    onSuccess: (res) => {
      setUrl(res.blueprint_url);
      setStatus("Blueprint uploaded");
      invalidate();
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Upload failed"),
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {row.blueprint_url ? (
        <img
          src={row.blueprint_url}
          alt=""
          className="w-16 h-16 object-cover rounded border border-slate-300"
        />
      ) : (
        <span className="w-16 h-16 flex items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">
          no blueprint
        </span>
      )}
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…/floor-plan.png"
        className="border border-slate-300 rounded px-2 py-1 text-sm flex-1 min-w-[12rem]"
      />
      <button
        type="button"
        onClick={() => saveUrl.mutate()}
        disabled={saveUrl.isPending}
        className="px-2.5 py-1 text-sm rounded bg-slate-800 text-white disabled:opacity-50"
      >
        Save URL
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        className="px-2.5 py-1 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {upload.isPending ? "Uploading…" : "Upload blueprint"}
      </button>
      {status && <span className="text-xs text-slate-500">{status}</span>}
    </div>
  );
}
