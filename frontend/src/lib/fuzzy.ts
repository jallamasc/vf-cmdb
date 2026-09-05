// Phase 4 Req 5/6 — a small, dependency-free fuzzy matcher shared by the
// in-cell FuzzySelectEditor and the per-section EntityGrid search box.
//
// Scoring: every character of the (case/accent-insensitive) query must appear
// in order somewhere in the target. Matches score higher when characters are
// contiguous and closer to the start of the target, so "swi" ranks "Switch"
// above "Firewall Switch". An empty query matches everything with score 0.

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase();
}

/**
 * Score how well `query` fuzzy-matches `target`. Returns null when the query
 * characters do not all appear in order (no match), otherwise a non-negative
 * number where LOWER is a BETTER match (so results can be sorted ascending).
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = normalize(query.trim());
  const t = normalize(target);
  if (q === "") return 0;
  if (t === "") return null;

  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;
  let firstMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatchIndex === -1) firstMatchIndex = ti;
      // Reward contiguous matches (gap === 1 from the previous hit).
      const gap = lastMatchIndex === -1 ? 0 : ti - lastMatchIndex - 1;
      score += gap;
      lastMatchIndex = ti;
      qi++;
    }
  }

  if (qi < q.length) return null; // not every query character was found

  // Prefer matches that start earlier in the target (prefix-ish matches).
  score += firstMatchIndex;
  return score;
}

export interface FuzzyMatch<T> {
  item: T;
  label: string;
  score: number;
}

/**
 * Filter + rank `items` by fuzzy match against `query`, using `getLabel` to
 * derive the searchable text for each item. Results are sorted best-first.
 */
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getLabel: (item: T) => string
): FuzzyMatch<T>[] {
  const out: FuzzyMatch<T>[] = [];
  for (const item of items) {
    const label = getLabel(item);
    const score = fuzzyScore(query, label);
    if (score !== null) out.push({ item, label, score });
  }
  out.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  return out;
}

/**
 * Whether any of `values` fuzzy-matches `query` — used for the per-section
 * grid search, which must match if ANY column of a row matches.
 */
export function fuzzyMatchesAny(query: string, values: unknown[]): boolean {
  const q = query.trim();
  if (q === "") return true;
  return values.some((v) => {
    if (v == null) return false;
    return fuzzyScore(q, String(v)) !== null;
  });
}
