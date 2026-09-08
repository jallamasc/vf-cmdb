// Naming-convention modifications (item 6) — OS Versions grouping.
//
// OsVersion has no FK to OsFamily (they're flat, independent lookup
// tables — see `endoflife_client.py`'s comment on the same limitation).
// The two ARE related by a naming convention, though: every synced
// OsVersion's `abbreviation` is `"{family_abbr}-{slugified version name}"`
// (endoflife_client.py's `sync_products`), so a version can be matched
// back to its family by abbreviation PREFIX. Longest-prefix-match wins so
// a family whose abbreviation is itself a prefix of another (e.g. "centos"
// vs "centos-stream") never steals the other's versions.
import { Row } from "../api";

/** The OsFamily row a given OsVersion belongs to, or null if it can't be
 * matched to any known family (a manually-added version, or one whose
 * family was since deleted). */
export function familyForVersion(version: Row, families: Row[]): Row | null {
  const abbr = String(version.abbreviation ?? "").toLowerCase();
  if (!abbr) return null;
  let best: Row | null = null;
  let bestLen = -1;
  for (const family of families) {
    const familyAbbr = String(family.abbreviation ?? "").toLowerCase();
    if (!familyAbbr) continue;
    if (abbr.startsWith(`${familyAbbr}-`) && familyAbbr.length > bestLen) {
      best = family;
      bestLen = familyAbbr.length;
    }
  }
  return best;
}

/** Map of OsVersion.id -> its family's full_name, or "Other / ungrouped". */
export function familyLabelByVersionId(
  versions: Row[],
  families: Row[]
): Map<number, string> {
  const out = new Map<number, string>();
  for (const v of versions) {
    const family = familyForVersion(v, families);
    out.set(v.id as number, family ? String(family.full_name ?? "") : "Other / ungrouped");
  }
  return out;
}

/** Extract the first run of dot-separated numbers found anywhere in `text`
 * (e.g. "Ubuntu 24.04" -> [24, 4], "RHEL 9" -> [9]), for a natural-order
 * "newest first" comparison. No match sorts last. */
function versionKey(text: string): number[] {
  const match = text.match(/\d+(?:\.\d+)*/);
  if (!match) return [-Infinity];
  return match[0].split(".").map((n) => parseInt(n, 10));
}

/** Descending "newest first" comparator by the numeric version found in
 * each row's own `full_name` (falls back to `abbreviation`). */
export function compareVersionsDesc(a: Row, b: Row): number {
  const ka = versionKey(String(a.full_name ?? a.abbreviation ?? ""));
  const kb = versionKey(String(b.full_name ?? b.abbreviation ?? ""));
  const len = Math.max(ka.length, kb.length);
  for (let i = 0; i < len; i++) {
    const va = ka[i] ?? 0;
    const vb = kb[i] ?? 0;
    if (va !== vb) return vb - va;
  }
  return 0;
}

/** The set of OsVersion ids that are among the `limit` most recent
 * versions of their own family (ungrouped versions are always kept —
 * there's no family to rank them within). */
export function latestNPerFamily(
  versions: Row[],
  families: Row[],
  limit = 4
): Set<number> {
  const groups = new Map<string, Row[]>();
  for (const v of versions) {
    const family = familyForVersion(v, families);
    const key = family ? `f:${family.id}` : `v:${v.id}`;
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  }
  const keep = new Set<number>();
  for (const list of groups.values()) {
    const sorted = [...list].sort(compareVersionsDesc);
    for (const v of sorted.slice(0, limit)) keep.add(v.id as number);
  }
  return keep;
}
