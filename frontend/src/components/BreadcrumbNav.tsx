// Phase 4 Req 11 — shared breadcrumb navigation, reused by every graphical
// view (Rack, Patch Panel, Power Device, Port Configuration). Each level is
// a dropdown connected by a "›" separator, so the control reads as a
// breadcrumb trail while still behaving like the cascading selects the rack
// view already had: picking a shallower level narrows the view and clears
// every level below it (the caller's onChange is expected to do the
// clearing, exactly as RackView's existing handlers already do).
export const ALL = "all" as const;
export type BreadcrumbFilter = number | typeof ALL;

export interface BreadcrumbLevel {
  key: string;
  label: string;
  value: BreadcrumbFilter;
  options: { id: number; label: string }[];
  onChange: (v: BreadcrumbFilter) => void;
  allLabel: string;
  disabled?: boolean;
}

interface Props {
  levels: BreadcrumbLevel[];
}

export default function BreadcrumbNav({ levels }: Props) {
  return (
    <nav
      aria-label="Location breadcrumb"
      className="flex flex-wrap items-end gap-1.5 mb-5 bg-slate-50 border border-slate-200 rounded-lg p-3"
    >
      {levels.map((level, i) => (
        <div key={level.key} className="flex items-end gap-1.5">
          {i > 0 && (
            <span className="text-slate-400 text-sm pb-1.5" aria-hidden="true">
              ›
            </span>
          )}
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            <span className="font-medium uppercase tracking-wide">{level.label}</span>
            <select
              value={level.value}
              disabled={level.disabled}
              onChange={(e) =>
                level.onChange(e.target.value === ALL ? ALL : Number(e.target.value))
              }
              className="border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-700 min-w-[9rem] disabled:opacity-50 disabled:bg-slate-50"
            >
              <option value={ALL}>{level.allLabel}</option>
              {level.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
    </nav>
  );
}
