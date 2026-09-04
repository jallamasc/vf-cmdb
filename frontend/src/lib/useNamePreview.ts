import { useEffect, useRef, useState } from "react";
import { api, NamePreview } from "../api";

/**
 * UX-4 — live name preview for a not-yet-created entity.
 *
 * Every change to the passed parameters (typically foreign-key pickers) is
 * debounced by 300 ms and then sent to ``GET /api/v1/naming/generate``, which
 * runs the very same naming engine the create endpoint uses. Responses that
 * arrive out of order are discarded, so the card always shows the answer for
 * the *current* selection.
 *
 * @param entityType Backend entity type, e.g. "site" / "rack" / "datacenter".
 * @param params     Model columns to preview with (site_id, code, name, …).
 * @param enabled    Set false to suspend polling (e.g. a closed form).
 */
export function useNamePreview(
  entityType: string,
  params: Record<string, unknown>,
  enabled = true,
) {
  // Serialise the params so the effect only re-runs on a real value change,
  // not on every re-render of the caller.
  const key = JSON.stringify(params);
  const [preview, setPreview] = useState<NamePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .generateNames(entityType, JSON.parse(key) as Record<string, unknown>)
        .then((result) => {
          if (seq.current !== mine) return; // a newer request has started
          setPreview(result);
          setError("");
        })
        .catch((e: Error) => {
          if (seq.current !== mine) return;
          setError(e.message);
        })
        .finally(() => {
          if (seq.current === mine) setLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [entityType, key, enabled]);

  return { preview, loading, error };
}

export default useNamePreview;
