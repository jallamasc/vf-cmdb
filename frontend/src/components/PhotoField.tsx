import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";

interface Props {
  /** Resource slug, e.g. "generic-entities". */
  resource: string;
  /** The specific record the photo belongs to. */
  row: Row;
}

/**
 * Phase 5 Task 22/23 (Req 18.1, 19.1) — upload/view a photo for one record.
 *
 * Mirrors `StencilField.tsx`'s `StencilFaceRow` URL+upload idiom, but a
 * photo is simpler than a stencil in two ways this component reflects: it
 * belongs to one specific record (not a device *model* shared by many
 * instances, so no `{resource}-{id}` model-slug plumbing is needed beyond
 * what `api.uploadPhoto` already does internally), and there is no
 * front/back face split — just one image.
 */
export default function PhotoField({ resource, row }: Props) {
  const qc = useQueryClient();
  const [url, setUrl] = useState<string>(row.photo_url ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: [resource] });

  const saveUrl = useMutation({
    mutationFn: () => api.update(resource, row.id, { photo_url: url || null }),
    onSuccess: () => {
      setStatus("Photo URL saved");
      invalidate();
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Save failed"),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadPhoto(resource, row.id, file),
    onSuccess: (res) => {
      setUrl(res.photo_url);
      setStatus("Photo uploaded");
      invalidate();
    },
    onError: (e: unknown) => setStatus(e instanceof Error ? e.message : "Upload failed"),
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {row.photo_url ? (
        <img
          src={row.photo_url}
          alt=""
          className="w-12 h-12 object-cover rounded border border-slate-300"
        />
      ) : (
        <span className="w-12 h-12 flex items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">
          no photo
        </span>
      )}
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…/photo.jpg"
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
        {upload.isPending ? "Uploading…" : "Upload photo"}
      </button>
      {status && <span className="text-xs text-slate-500">{status}</span>}
    </div>
  );
}
