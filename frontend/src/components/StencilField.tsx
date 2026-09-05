import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";
import AnchorEditor from "./AnchorEditor";
import StencilLibraryPicker from "./StencilLibraryPicker";

interface Props {
  /** Device-type resource slug, e.g. "network-device-types". */
  resource: string;
}

/**
 * FEAT-6 (6B) — admin panel to attach a Visio Café stencil to a device model.
 *
 * For each device-type row it offers two ways to supply the SVG:
 *  - set ``stencil_url`` (persisted via the normal CRUD PATCH, so it is
 *    audited) — the backend downloads + caches it cache-first;
 *  - upload an SVG directly (air-gapped installs) via POST /stencils/{slug}-{id}.
 *
 * The stencil is keyed by ``{resource}-{id}`` — the same slug the rack diagram
 * asks the backend for — so an uploaded/downloaded SVG shows up on the model's
 * devices immediately.
 */
export default function StencilField({ resource }: Props) {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: [resource],
    queryFn: () => api.list(resource),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading models…</p>;
  if (!rows || rows.length === 0)
    return (
      <p className="text-sm text-slate-500">
        Add a model above, then attach a stencil to it here.
      </p>
    );

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Attach a Visio Café stencil (SVG) to a model. Devices of this model then
        render the graphic on the rack diagram instead of a plain rectangle. You
        can paste a URL (downloaded + cached) or upload an SVG (works offline).
      </p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <StencilRow
            key={row.id}
            resource={resource}
            row={row}
            onChanged={() => qc.invalidateQueries({ queryKey: [resource] })}
          />
        ))}
      </div>
    </div>
  );
}

function StencilRow({
  resource,
  row,
  onChanged,
}: {
  resource: string;
  row: Row;
  onChanged: () => void;
}) {
  const modelSlug = `${resource}-${row.id}`;
  const [showAnchors, setShowAnchors] = useState(false);

  const label = row.full_name
    ? `${row.full_name}${row.abbreviation ? ` (${row.abbreviation})` : ""}`
    : `#${row.id}`;

  return (
    <div className="border border-slate-200 rounded px-3 py-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-slate-700 min-w-[9rem]">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setShowAnchors((s) => !s)}
          className="ml-auto px-2.5 py-1 text-xs rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          {showAnchors ? "Hide anchors" : "Edit anchors"}
        </button>
      </div>

      <StencilFaceRow
        resource={resource}
        row={row}
        modelSlug={modelSlug}
        face="front"
        onChanged={onChanged}
      />
      <StencilFaceRow
        resource={resource}
        row={row}
        modelSlug={modelSlug}
        face="back"
        onChanged={onChanged}
      />

      {showAnchors && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <AnchorEditor resource={resource} row={row} face="front" />
          <AnchorEditor resource={resource} row={row} face="back" />
        </div>
      )}
    </div>
  );
}

/** One URL/upload control for a single face (front or back) of a stencil. */
function StencilFaceRow({
  resource,
  row,
  modelSlug,
  face,
  onChanged,
}: {
  resource: string;
  row: Row;
  modelSlug: string;
  face: "front" | "back";
  onChanged: () => void;
}) {
  const urlField = face === "back" ? "stencil_url_back" : "stencil_url";
  const [url, setUrl] = useState<string>(row[urlField] ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveUrl = useMutation({
    mutationFn: () => api.update(resource, row.id, { [urlField]: url || null }),
    onSuccess: () => {
      setStatus("URL saved");
      onChanged();
    },
    onError: (e: unknown) =>
      setStatus(e instanceof Error ? e.message : "Save failed"),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadStencil(modelSlug, file, face),
    onSuccess: () => {
      setStatus("SVG uploaded");
      onChanged();
    },
    onError: (e: unknown) =>
      setStatus(e instanceof Error ? e.message : "Upload failed"),
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs uppercase tracking-wide text-slate-400 w-12">
        {face}
      </span>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…/stencil.svg"
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
        accept="image/svg+xml,.svg"
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
        Upload SVG
      </button>
      {/* Phase 4 Task 31 — browse the curated GitHub/VisioCafe library instead
          of hand-authoring or manually sourcing an SVG. */}
      <button
        type="button"
        onClick={() => setShowLibrary(true)}
        className="px-2.5 py-1 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
      >
        Browse stencil library
      </button>
      <a
        href={api.stencilUrl(modelSlug, face)}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-blue-600 hover:underline"
        title="Preview the cached stencil (404 if none yet)"
      >
        preview
      </a>
      {status && <span className="text-xs text-slate-500">{status}</span>}

      {showLibrary && (
        <StencilLibraryPicker
          modelSlug={modelSlug}
          face={face}
          onApplied={() => {
            setStatus("Applied from stencil library");
            onChanged();
          }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}
