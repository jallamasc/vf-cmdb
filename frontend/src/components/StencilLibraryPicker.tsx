import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  StencilLibraryFetchResult,
  StencilLibrarySource,
} from "../api";
import { fuzzyScore } from "../lib/fuzzy";

const SOURCES: { key: StencilLibrarySource; label: string }[] = [
  { key: "github", label: "bhdicaire/visioStencils (GitHub)" },
  { key: "visiocafe", label: "VisioCafe" },
];

interface Props {
  /** {resource}-{id} of the device-type row a picked shape is applied to. */
  modelSlug: string;
  face: "front" | "back";
  onApplied: () => void;
  onClose: () => void;
}

/**
 * Phase 4 Task 31 / Requirement 22 — browse the curated stencil library
 * (source -> category -> file), fetch + convert the chosen file into
 * per-shape SVG previews, and apply exactly one shape as the stencil for
 * `modelSlug`'s `face` — through the EXISTING upload endpoint
 * (`api.uploadStencil`), so an applied shape is indistinguishable from a
 * manually-uploaded SVG once saved.
 */
export default function StencilLibraryPicker({ modelSlug, face, onApplied, onClose }: Props) {
  const qc = useQueryClient();
  const [source, setSource] = useState<StencilLibrarySource>("github");
  const [category, setCategory] = useState<string | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [result, setResult] = useState<StencilLibraryFetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyingTitle, setApplyingTitle] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["stencil-library-categories", source],
    queryFn: () => api.stencilLibraryCategories(source),
  });

  const files = useQuery({
    queryKey: ["stencil-library-files", source, category],
    queryFn: () => api.stencilLibraryFiles(source, category as string),
    enabled: category != null,
  });

  const fetchAndConvert = useMutation({
    mutationFn: (file: string) => api.stencilLibraryFetch(source, category as string, file),
    onSuccess: (data) => {
      setResult(data);
      setError(null);
    },
    onError: (e: unknown) => {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    },
  });

  const apply = useMutation({
    mutationFn: async (shape: { title: string; preview_url: string }) => {
      const resp = await fetch(shape.preview_url);
      if (!resp.ok) throw new Error(`Could not load preview: ${resp.status}`);
      const blob = await resp.blob();
      const file = new File([blob], `${shape.title}.svg`, { type: "image/svg+xml" });
      return api.uploadStencil(modelSlug, file, face);
    },
    onMutate: (shape) => setApplyingTitle(shape.title),
    onSuccess: () => {
      qc.invalidateQueries();
      onApplied();
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    onSettled: () => setApplyingTitle(null),
  });

  const filteredFiles = (files.data ?? []).filter(
    (f) => fileQuery.trim() === "" || fuzzyScore(fileQuery, f.name) !== null
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">
            Browse stencil library — {face} face
          </h2>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
          <label className="text-xs text-slate-500 uppercase tracking-wide">Source</label>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as StencilLibrarySource);
              setCategory(null);
              setResult(null);
              setError(null);
            }}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            {SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {categories.isLoading && <p className="text-sm text-slate-500">Loading categories…</p>}
          {categories.isError && (
            <p className="text-sm text-rose-600">
              Could not load categories: {(categories.error as Error)?.message}
            </p>
          )}
          {categories.data && categories.data.length === 0 && (
            <p className="text-sm text-slate-400 italic">
              No categories curated yet for this source. See{" "}
              <code>backend/app/stencil_sources.py</code> to add entries.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(categories.data ?? []).map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setCategory(c.key);
                  setResult(null);
                  setError(null);
                }}
                className={`px-2.5 py-1 text-xs rounded-full border ${
                  category === c.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {category != null && (
            <div className="space-y-2">
              <input
                value={fileQuery}
                onChange={(e) => setFileQuery(e.target.value)}
                placeholder="Search files in this category…"
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm"
              />
              {files.isLoading && <p className="text-sm text-slate-500">Loading files…</p>}
              {files.isError && (
                <p className="text-sm text-rose-600">
                  Could not load files: {(files.error as Error)?.message}
                </p>
              )}
              <ul className="max-h-40 overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
                {filteredFiles.map((f) => (
                  <li key={f.name}>
                    <button
                      type="button"
                      disabled={fetchAndConvert.isPending}
                      onClick={() => fetchAndConvert.mutate(f.name)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      {f.name}
                    </button>
                  </li>
                ))}
                {filteredFiles.length === 0 && !files.isLoading && (
                  <li className="px-3 py-2 text-sm text-slate-400 italic">No matching files.</li>
                )}
              </ul>
            </div>
          )}

          {fetchAndConvert.isPending && (
            <p className="text-sm text-slate-500">Fetching and converting…</p>
          )}

          {result && (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
                Pick the shape that matches your model — {result.file}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {result.shapes.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate(s)}
                    className="border border-slate-200 rounded p-2 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 flex flex-col items-center gap-1"
                  >
                    <img src={s.preview_url} alt={s.title} className="h-16 w-full object-contain" />
                    <span className="text-[11px] text-slate-600 text-center">{s.title}</span>
                    {applyingTitle === s.title && (
                      <span className="text-[10px] text-blue-600">Applying…</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="px-5 py-2 text-sm text-rose-600 border-t border-slate-200">{error}</p>
        )}

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
