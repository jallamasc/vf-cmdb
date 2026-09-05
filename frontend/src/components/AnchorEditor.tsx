import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";

interface Props {
  /** Device-type resource slug, e.g. "network-device-types". */
  resource: string;
  /** The device-type row the stencil belongs to. */
  row: Row;
  face: "front" | "back";
}

interface PendingClick {
  x: number;
  y: number;
}

/**
 * Phase 4 Req 19 — click-to-place editor for precise stencil port/U anchors.
 *
 * Renders the cached stencil image (falls back to a message when none is
 * cached yet) inside a click-tracking container. Clicking a spot on the image
 * records its position as a normalized (0..1) fraction of the image box, then
 * asks for the port identifier that anchor represents. Existing anchors are
 * drawn as small numbered markers on the image and can be deleted from the
 * list below it. When no anchor exists for a port, the graphical views fall
 * back to a computed layout — mapping here is optional, not required.
 */
export default function AnchorEditor({ resource, row, face }: Props) {
  const qc = useQueryClient();
  const modelSlug = `${resource}-${row.id}`;
  const [pending, setPending] = useState<PendingClick | null>(null);
  const [portKey, setPortKey] = useState("");
  const [label, setLabel] = useState("");
  const [imgOk, setImgOk] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  const { data: anchors } = useQuery({
    queryKey: ["stencil-anchors", modelSlug, face],
    queryFn: () => api.stencilAnchors(modelSlug, face),
  });

  const create = useMutation({
    mutationFn: () =>
      api.create("stencil-anchors", {
        owner_resource: resource,
        owner_id: row.id,
        face,
        port_key: portKey.trim(),
        x: pending!.x,
        y: pending!.y,
        label: label.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stencil-anchors", modelSlug, face] });
      setPending(null);
      setPortKey("");
      setLabel("");
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.remove("stencil-anchors", id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["stencil-anchors", modelSlug, face] }),
  });

  const onImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPending({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  };

  return (
    <div className="border border-slate-200 rounded p-2 bg-slate-50">
      <p className="text-xs text-slate-500 mb-2">
        Click the {face} stencil where a port/connector sits, name it, and it
        will be used for precise placement instead of the computed layout.
      </p>
      {imgOk ? (
        <div
          className="relative inline-block border border-slate-300 bg-white cursor-crosshair"
          style={{ maxWidth: 320 }}
          onClick={onImageClick}
        >
          <img
            ref={imgRef}
            src={api.stencilUrl(modelSlug, face)}
            alt={`${modelSlug} ${face} stencil`}
            style={{ display: "block", maxWidth: 320 }}
            onError={() => setImgOk(false)}
            draggable={false}
          />
          {(anchors ?? []).map((a) => (
            <span
              key={a.id}
              title={`${a.port_key}${a.label ? ` — ${a.label}` : ""}`}
              className="absolute w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-blue-600 border border-white shadow"
              style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
            />
          ))}
          {pending && (
            <span
              className="absolute w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-amber-500 border border-white shadow animate-pulse"
              style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-amber-600 italic">
          No cached {face} stencil yet — set a URL or upload one above, then
          anchors can be mapped here.
        </p>
      )}

      {pending && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <input
            autoFocus
            value={portKey}
            onChange={(e) => setPortKey(e.target.value)}
            placeholder="Port identifier, e.g. 24"
            className="border border-slate-300 rounded px-2 py-1 text-sm w-40"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="border border-slate-300 rounded px-2 py-1 text-sm w-40"
          />
          <button
            type="button"
            disabled={!portKey.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="px-2.5 py-1 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
          >
            Add anchor
          </button>
          <button
            type="button"
            onClick={() => setPending(null)}
            className="px-2.5 py-1 text-sm rounded border border-slate-300"
          >
            Cancel
          </button>
        </div>
      )}

      {(anchors ?? []).length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {(anchors ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 text-xs bg-white border border-slate-300 rounded px-1.5 py-0.5"
            >
              <span className="font-mono">{a.port_key}</span>
              {a.label && <span className="text-slate-400">({a.label})</span>}
              <button
                type="button"
                onClick={() => remove.mutate(a.id)}
                className="text-slate-400 hover:text-red-600"
                aria-label={`Delete anchor ${a.port_key}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
