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
import { ICON_LIBRARY_NAMES } from "../lib/iconLibrary";
import { resolveIcon } from "../lib/iconLibrary";

export interface IconPickerEditorParams extends ICellEditorParams {
  /** Whether "no icon" is a valid choice (defaults to true — every registry
   * row starts with a null icon until an administrator picks one). */
  clearable?: boolean;
}

/**
 * Phase 6 Task 10 (Req 4.2) — the Icon_Picker: a fuzzy-searchable list of
 * every name in `ICON_LIBRARY_NAMES`, each rendered with a live SVG preview
 * next to its name, opened via a single click on the cell (paired with
 * `singleClickEdit` on the grid, same as `FuzzySelectEditor` — the cell's
 * own `DropdownCellRenderer` chevron is what an operator clicks).
 *
 * Implements the AG Grid ICellEditorComp contract exactly like
 * `FuzzySelectEditor` (this app's established custom-popup-editor shape).
 */
const IconPickerEditor = forwardRef((props: IconPickerEditorParams, ref) => {
  const clearable = props.clearable ?? true;
  const options = clearable ? [null, ...ICON_LIBRARY_NAMES] : [...ICON_LIBRARY_NAMES];
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState<unknown>(props.value ?? null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => fuzzyFilter(query, options, (v) => (v == null ? "" : String(v))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    },
  }));

  const commit = (value: unknown) => {
    setCommitted(value);
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
      const m = matches[highlight];
      if (m) commit(m.item);
    } else if (e.key === "Escape") {
      props.api.stopEditing(true);
    }
  };

  return (
    // See FuzzySelectEditor.tsx's comment on `ag-custom-component-popup` —
    // required for stopEditingWhenCellsLoseFocus to treat clicks inside this
    // popup as inside the grid, or every option click just closes the list.
    <div
      className="vf-fuzzy-editor vf-icon-picker ag-custom-component-popup"
      data-testid="icon-picker-editor"
    >
      <input
        ref={inputRef}
        className="vf-fuzzy-editor-input"
        placeholder="Search icons…"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul className="vf-fuzzy-editor-list vf-icon-picker-list" role="listbox">
        {matches.length === 0 && <li className="vf-fuzzy-editor-empty">No matches</li>}
        {matches.map((m, i) => {
          const name = m.item as string | null;
          const Icon = resolveIcon(name);
          return (
            <li
              key={String(name)}
              role="option"
              aria-selected={i === highlight}
              className={
                "vf-fuzzy-editor-option vf-icon-picker-option" +
                (i === highlight ? " is-highlighted" : "")
              }
              onMouseDown={(e) => {
                e.preventDefault();
                commit(name);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {name == null ? (
                <span className="vf-dd-empty">— no icon —</span>
              ) : (
                <>
                  <Icon size={16} className="vf-icon-picker-preview" aria-hidden="true" />
                  <span>{name}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
});

IconPickerEditor.displayName = "IconPickerEditor";
export default IconPickerEditor;
