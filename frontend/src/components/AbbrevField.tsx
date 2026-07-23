import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Trim modes must stay in sync with the backend (app.models.TRIM_MODE_VALUES).
export const TRIM_MODES: { value: string; label: string }[] = [
  { value: "manual", label: "Manual (type it yourself)" },
  { value: "first_1", label: "First 1 character" },
  { value: "first_2", label: "First 2 characters" },
  { value: "first_3", label: "First 3 characters" },
  { value: "first_4", label: "First 4 characters" },
  { value: "acronym", label: "Acronym (first letter of each word)" },
  { value: "consonants", label: "Consonants only (drop vowels)" },
];

export const CASE_MODES: { value: string; label: string }[] = [
  { value: "mixed", label: "Mixed (as typed)" },
  { value: "uppercase", label: "UPPERCASE" },
  { value: "lowercase", label: "lowercase" },
];

// Only letters, digits and hyphens; no leading/trailing/consecutive hyphen.
const DOMAIN_RE = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

interface Props {
  /** Current abbreviation / code value. */
  value: string;
  onChange: (value: string) => void;
  /** Full name used to auto-derive the abbreviation when a trim mode is set. */
  fullName: string;
  /** Selected trim mode + change handler. */
  trimMode: string;
  onTrimModeChange: (mode: string) => void;
  /** Case enforcement applied to the preview + stored value. */
  caseEnforcement: string;
  /** Owning entity (so the record excludes itself from the uniqueness check). */
  entityType?: string;
  entityId?: number;
  label?: string;
  /** Reports whether the current value is valid + available. */
  onValidityChange?: (ok: boolean) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "taken"; owner: string }
  | { kind: "invalid" };

/**
 * Abbreviation / code input with a live trim-mode preview and an asynchronous
 * global-uniqueness check. When the trim mode is not "manual" the value is
 * derived from the full name; the user can still edit it afterwards.
 */
export default function AbbrevField({
  value,
  onChange,
  fullName,
  trimMode,
  onTrimModeChange,
  caseEnforcement,
  entityType = "",
  entityId,
  label = "Abbreviation / Code",
  onValidityChange,
}: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const debounce = useRef<number | undefined>(undefined);

  // Auto-derive from the full name whenever a trim mode / name / case changes.
  useEffect(() => {
    if (trimMode === "manual") return;
    let cancelled = false;
    api
      .previewAbbrev(fullName, trimMode, caseEnforcement)
      .then((r) => {
        if (!cancelled && r.abbreviation !== value) onChange(r.abbreviation);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, trimMode, caseEnforcement]);

  // Debounced charset + global uniqueness check on the value.
  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    if (!value) {
      setStatus({ kind: "idle" });
      onValidityChange?.(false);
      return;
    }
    if (!DOMAIN_RE.test(value)) {
      setStatus({ kind: "invalid" });
      onValidityChange?.(false);
      return;
    }
    setStatus({ kind: "checking" });
    debounce.current = window.setTimeout(async () => {
      try {
        const r = await api.checkAbbrev(value, entityType, entityId);
        if (r.available) {
          setStatus({ kind: "ok" });
          onValidityChange?.(true);
        } else {
          const owner = r.owner
            ? `${r.owner.entity_type} #${r.owner.entity_id}`
            : "another record";
          setStatus({ kind: "taken", owner });
          onValidityChange?.(false);
        }
      } catch {
        setStatus({ kind: "idle" });
      }
    }, 350);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, entityType, entityId]);

  const applyCase = (v: string) =>
    caseEnforcement === "uppercase"
      ? v.toUpperCase()
      : caseEnforcement === "lowercase"
        ? v.toLowerCase()
        : v;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="flex gap-2">
        <select
          value={trimMode}
          onChange={(e) => onTrimModeChange(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1.5 text-sm w-1/2"
          title="How the abbreviation is derived from the full name"
        >
          {TRIM_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          value={value}
          onChange={(e) => onChange(applyCase(e.target.value))}
          placeholder="code"
          disabled={trimMode !== "manual"}
          className={`border rounded px-2 py-1.5 text-sm w-1/2 ${
            status.kind === "taken" || status.kind === "invalid"
              ? "border-red-400"
              : status.kind === "ok"
                ? "border-green-500"
                : "border-slate-300"
          } ${trimMode !== "manual" ? "bg-slate-100" : ""}`}
        />
      </div>
      <div className="text-xs min-h-[1rem]">
        {status.kind === "checking" && (
          <span className="text-slate-400">Checking availability…</span>
        )}
        {status.kind === "ok" && (
          <span className="text-green-600">✓ “{value}” is available.</span>
        )}
        {status.kind === "taken" && (
          <span className="text-red-600">
            ✗ “{value}” is already used by {status.owner}.
          </span>
        )}
        {status.kind === "invalid" && (
          <span className="text-red-600">
            ✗ Only letters, digits and single hyphens are allowed.
          </span>
        )}
      </div>
    </div>
  );
}
