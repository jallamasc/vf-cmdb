import { useState } from "react";
import { api } from "../api";

type Gaps = Awaited<ReturnType<typeof api.gaps>>;

/**
 * Inline sequence-number gap helper for the device creation flow.
 *
 * The user types a naming prefix (e.g. ``RTSL``); the component queries
 * ``/naming/gaps`` and, when gaps exist, prompts whether to reuse the next
 * available gap or continue with the next sequential number. The resolved
 * ``{ name_prefix, sequence_number }`` pair is handed back through
 * ``onPick`` so the caller can pre-fill a new device row.
 */
export default function SequenceGapHelper({
  onPick,
}: {
  onPick?: (prefix: string, sequence: number) => void;
}) {
  const [prefix, setPrefix] = useState("");
  const [data, setData] = useState<Gaps | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const scan = async () => {
    const p = prefix.trim();
    if (!p) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      setData(await api.gaps(p));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white p-4 mb-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold text-slate-800 text-sm">
          Sequence &amp; gap helper
        </span>
        <span className="text-xs text-slate-500">
          Reuse freed-up numbers before allocating a new one.
        </span>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">
            Naming prefix
          </label>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
            placeholder="e.g. RTSL"
            className="border border-slate-300 rounded px-2 py-1.5 text-sm w-48"
          />
        </div>
        <button
          onClick={scan}
          disabled={!prefix.trim() || loading}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Scanning…" : "Scan gaps"}
        </button>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          {error}
        </div>
      )}

      {data && (
        <div className="mt-3 text-sm">
          <div className="text-slate-700 mb-2">{data.message}</div>
          <div className="text-xs text-slate-500 mb-3">
            Used: {data.used.length ? data.used.join(", ") : "none"} · Gaps:{" "}
            {data.gaps.length ? data.gaps.join(", ") : "none"}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.next_gap != null && (
              <button
                onClick={() => onPick?.(data.prefix, data.next_gap as number)}
                className="px-3 py-1.5 bg-amber-500 text-white rounded text-xs hover:bg-amber-600"
              >
                Reuse gap → {data.prefix}
                {data.next_gap}
              </button>
            )}
            <button
              onClick={() => onPick?.(data.prefix, data.next_sequential)}
              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700"
            >
              Continue sequential → {data.prefix}
              {data.next_sequential}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
