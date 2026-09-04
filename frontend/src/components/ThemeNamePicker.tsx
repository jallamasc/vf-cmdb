import { useEffect, useMemo, useRef, useState } from "react";
import { api, ThemeCategory, ThemeName } from "../api";

/**
 * FEAT-3 — modal picker for the built-in themed "fun" name catalogues.
 *
 * One tab per category (Star Wars, Greek Mythology, Mountain Peaks, Space
 * Missions), a debounced search box and a clickable result list. Selecting a
 * name closes the modal and reports both the name and the category it came
 * from, so the caller can persist ``theme_name`` + ``theme_category``.
 */
export interface ThemeSelection {
  name: string;
  category: string;
}

interface Props {
  open: boolean;
  /** Category tab to open on; falls back to the first one. */
  initialCategory?: string;
  /** Name to highlight as currently chosen. */
  selectedName?: string | null;
  onSelect: (selection: ThemeSelection) => void;
  onClose: () => void;
}

export default function ThemeNamePicker({
  open,
  initialCategory,
  selectedName,
  onSelect,
  onClose,
}: Props) {
  const [categories, setCategories] = useState<ThemeCategory[]>([]);
  const [category, setCategory] = useState(initialCategory || "");
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<ThemeName[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Guards against out-of-order responses while the user keeps typing.
  const seq = useRef(0);

  // Re-sync the active tab whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setCategory(initialCategory || "");
      setQuery("");
    }
  }, [open, initialCategory]);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .themeNames(category, query)
        .then((result) => {
          if (seq.current !== mine) return;
          setCategories(result.categories);
          // The very first load has no tab selected yet — adopt the first one
          // the backend reports so the UI never shows an empty tab strip.
          if (!category && result.categories.length) {
            setCategory(result.categories[0].category);
          }
          setNames(result.names);
          setError("");
        })
        .catch((e: Error) => {
          if (seq.current !== mine) return;
          setError(e.message);
        })
        .finally(() => {
          if (seq.current === mine) setLoading(false);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [open, category, query]);

  // Close on Escape like every other dialog in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const activeLabel = useMemo(
    () => categories.find((c) => c.category === category)?.label ?? "",
    [categories, category],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[620px] max-w-[92vw] max-h-[88vh] flex flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Pick a themed name</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Themed names are memorable aliases for a site. The strict
          auto-generated VF names are unaffected — only the site code changes.
        </p>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {categories.map((c) => (
            <button
              key={c.category}
              onClick={() => setCategory(c.category)}
              className={
                "px-3 py-1.5 rounded text-sm border " +
                (c.category === category
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100")
              }
            >
              {c.label}
              <span
                className={
                  "ml-1.5 text-xs " +
                  (c.category === category ? "text-blue-100" : "text-slate-400")
                }
              >
                {c.count}
              </span>
            </button>
          ))}
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${activeLabel || "names"}…`}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-3"
        />

        {error && (
          <div className="text-sm text-red-600 mb-2">Could not load: {error}</div>
        )}

        <div className="flex-1 overflow-auto border border-slate-200 rounded">
          {loading && !names.length ? (
            <div className="p-3 text-sm text-slate-500">Loading…</div>
          ) : names.length === 0 ? (
            <div className="p-3 text-sm text-slate-500">
              No name matches “{query}”.
            </div>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-0.5 p-1">
              {names.map((n) => (
                <li key={`${n.category}:${n.name}`}>
                  <button
                    onClick={() =>
                      onSelect({ name: n.name, category: n.category })
                    }
                    className={
                      "w-full text-left px-2 py-1.5 rounded text-sm truncate " +
                      (n.name === selectedName
                        ? "bg-blue-100 text-blue-900 font-medium"
                        : "hover:bg-slate-100 text-slate-700")
                    }
                    title={`${n.name} — ${n.label}`}
                  >
                    {n.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {names.length} name{names.length === 1 ? "" : "s"}
          {activeLabel ? ` in ${activeLabel}` : ""}
          {query ? ` matching “${query}”` : ""}
        </div>
      </div>
    </div>
  );
}
