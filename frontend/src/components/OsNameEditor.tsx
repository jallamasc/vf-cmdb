import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ICellEditorParams } from "ag-grid-community";
import { fuzzyFilter } from "../lib/fuzzy";
import { OS_NAME_SUGGESTIONS } from "../lib/osNames";

export type OsNameEditorParams = ICellEditorParams;

/**
 * Naming-convention modifications (item 5) — OsFamily.full_name picker: a
 * free-text field with curated OS/platform-name suggestions (Android,
 * Ubuntu, Windows Server, Cisco IOS, ...), so creating a well-known OS
 * means picking it instead of hand-typing it — without losing the ability
 * to type something that isn't on the list, since a homegrown/rare OS is
 * still a legitimate `full_name`.
 *
 * Unlike `FuzzySelectEditor` (a CLOSED list — only one of its own `values`
 * can ever be committed), this is a text input WITH suggestions: Enter
 * commits whatever is currently typed (matching a suggestion or not);
 * clicking a suggestion commits that exact value immediately. Shares the
 * same `setDataValue`-on-click commit path as every other popup editor in
 * this app (see `FuzzySelectEditor.tsx`'s comment on why).
 */
const OsNameEditor = forwardRef((props: OsNameEditorParams, ref) => {
  const initial = props.value == null ? "" : String(props.value);
  const [query, setQuery] = useState(initial);
  const [committed, setCommitted] = useState<unknown>(props.value ?? null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => fuzzyFilter(query, OS_NAME_SUGGESTIONS, (v) => v),
    [query]
  );

  useEffect(() => setHighlight(0), [query]);

  useImperativeHandle(ref, () => ({
    getValue: () => committed,
    isPopup: () => true,
    isCancelBeforeStart: () => false,
    isCancelAfterEnd: () => false,
    afterGuiAttached: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  const commit = (value: string) => {
    setCommitted(value);
    props.node?.setDataValue?.(props.column, value);
    setTimeout(() => props.api.stopEditing(), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // A highlighted suggestion wins; otherwise commit exactly what was
      // typed (a legitimate custom OS name not on the curated list).
      const m = matches[highlight];
      const typed = query.trim();
      if (m) commit(m.item);
      else if (typed) commit(typed);
    } else if (e.key === "Escape") {
      props.api.stopEditing(true);
    }
  };

  return (
    <div className="vf-fuzzy-editor ag-custom-component-popup" data-testid="os-name-editor">
      <input
        ref={inputRef}
        className="vf-fuzzy-editor-input"
        value={query}
        placeholder="Type or search a well-known OS name…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul className="vf-fuzzy-editor-list" role="listbox">
        {matches.length === 0 && (
          <li className="vf-fuzzy-editor-empty">
            {query.trim()
              ? `No suggestions match — press Enter to use “${query.trim()}” as typed.`
              : "Type to search, or just type any OS name."}
          </li>
        )}
        {matches.map((m, i) => (
          <li
            key={m.item}
            role="option"
            aria-selected={i === highlight}
            className={
              "vf-fuzzy-editor-option" + (i === highlight ? " is-highlighted" : "")
            }
            onMouseDown={(e) => {
              e.preventDefault();
              commit(m.item);
            }}
            onMouseEnter={() => setHighlight(i)}
          >
            {m.label}
          </li>
        ))}
      </ul>
    </div>
  );
});

OsNameEditor.displayName = "OsNameEditor";
export default OsNameEditor;
