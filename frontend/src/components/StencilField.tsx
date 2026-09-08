import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, Row } from "../api";
import AnchorEditor from "./AnchorEditor";
import StencilLibraryPicker from "./StencilLibraryPicker";

/**
 * FEAT-6 (6B) — stencil + anchor management for a single device-type record.
 *
 * Offers two ways to supply the SVG for each face:
 *  - set ``stencil_url`` (persisted via the normal CRUD PATCH, so it is
 *    audited) — the backend downloads + caches it cache-first;
 *  - upload an SVG directly (air-gapped installs) via POST /stencils/{slug}-{id}.
 *
 * The stencil is keyed by ``{resource}-{id}`` — the same slug the rack diagram
 * asks the backend for — so an uploaded/downloaded SVG shows up on the model's
 * devices immediately.
 *
 * Phase 5 Task 29 (Req 24.1/24.2) removed this module's original default
 * export, which rendered every row of a device-type resource in its own
 * always-open list — a second, disconnected copy of the same rows the grid
 * above it already showed (Requirement 24.2's "standalone stencil-only admin
 * page"). `Naming.tsx` now renders `StencilRow` directly, scoped to whichever
 * single row is selected in the grid, via `EntityGrid`'s `panel` prop — the
 * same selection-driven idiom `GenericEntityView.tsx`'s capability panel
 * already used to reuse this exact component for a single Generic_Entity
 * record (Task 22, Req 18.2).
 */
export function StencilRow({
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

/**
 * Phase 5 Task 29 (Req 24.1/24.2) / Phase 6 Task 27 (Req 10.2-10.4) —
 * collapsible "manage this row's stencil" wrapper around `StencilRow`,
 * driven by whichever single row is currently selected in the caller's
 * grid (or explicitly passed in, e.g. from a device's own detail page).
 * Originally local to `Naming.tsx`; promoted here once
 * `SimpleGridPage.tsx`/`DeviceOverviewForm.tsx`/`RackSlotEditor.tsx` all
 * needed the exact same "select a row below to manage its stencil" idiom
 * for the Universal_Stencil_Override (every device/entity instance table
 * now carries its own stencil_url/stencil_url_back, Req 10.1).
 */
export function StencilPanel({
  resource,
  label,
  selected,
  onChanged,
}: {
  resource: string;
  label: string;
  selected: Row | null;
  onChanged: () => void;
}) {
  if (!selected) {
    return (
      <div className="mb-3 px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
        Select a {label} row below to manage its stencil.
      </div>
    );
  }
  return (
    <details className="mb-3 border border-slate-200 rounded-lg" open>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
        Stencil — {selected.full_name ? String(selected.full_name) : `#${selected.id}`}
      </summary>
      <div className="px-3 pb-3">
        <StencilRow resource={resource} row={selected} onChanged={onChanged} />
      </div>
    </details>
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
  // Bug fix (post-Phase-6 QA) — this input's local state only ever ran its
  // initializer once; after an upload/library-apply persists the column
  // server-side and `onChanged()` refetches, the freshly-fetched `row`
  // prop changes but this input kept showing the stale (often blank)
  // value it started with. Re-sync whenever the row's own URL changes.
  useEffect(() => {
    setUrl(row[urlField] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row[urlField]]);
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
