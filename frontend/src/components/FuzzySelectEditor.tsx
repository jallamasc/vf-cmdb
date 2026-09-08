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

export interface FuzzySelectEditorParams extends ICellEditorParams {
  /** Every value the picker can commit (including `null` when clearable). */
  values: unknown[];
  /** Render a value as its human label. Defaults to String(value). */
  formatOption?: (value: unknown) => string;
  placeholder?: string;
}

/**
 * Phase 4 Req 5 — a custom AG Grid cell editor: opens in ONE click (paired
 * with `singleClickEdit` on the grid), and lets the operator fuzzy-search the
 * option list instead of scrolling a native <select>.
 *
 * Implements the AG Grid ICellEditorComp contract via `useImperativeHandle`:
 * `getValue()` is read on commit, `isPopup()` renders the list above the grid
 * body instead of being clipped by the cell, and `afterGuiAttached` focuses
 * the search input immediately so typing works with zero extra clicks.
 */
const FuzzySelectEditor = forwardRef((props: FuzzySelectEditorParams, ref) => {
  const format = props.formatOption ?? ((v: unknown) => (v == null ? "" : String(v)));
  const initialLabel = props.value == null ? "" : format(props.value);
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState<unknown>(props.value);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => fuzzyFilter(query, props.values, format),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, props.values]
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

  const commit = (value: unknown) => {
    setCommitted(value);
    // Write the value straight into the row via the grid API instead of
    // relying solely on AG Grid's own getValue()/stopEditing() handshake:
    // that handshake depends on AG Grid successfully round-tripping focus
    // through this popup's own DOM subtree (rendered in AG Grid's popup
    // layer, outside the grid's main DOM), which stopEditingWhenCellsLose
    // Focus (EntityGrid.tsx) can race — an option click could get treated
    // as "focus left the grid" before our stopEditing() call below ever
    // applies the value, silently discarding the selection. setDataValue
    // applies immediately and unconditionally, independent of any of that.
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
      const m = matches[highlight];
      if (m) commit(m.item);
    } else if (e.key === "Escape") {
      props.api.stopEditing(true);
    }
  };

  return (
    // `ag-custom-component-popup` is AG Grid's own convention for marking a
    // custom popup editor's root element as "part of the grid" for focus
    // purposes: with `stopEditingWhenCellsLoseFocus` on (EntityGrid.tsx),
    // AG Grid's FocusService otherwise treats a mousedown inside this popup
    // (which lives outside the grid's own DOM subtree, in AG Grid's popup
    // layer) as a click OUTSIDE the grid and calls stopEditing() itself —
    // racing our own onMouseDown handler below and discarding the pending
    // selection before `commit()` ever runs. Without this class, every
    // click on an option appeared to just close the list with no effect.
    <div className="vf-fuzzy-editor ag-custom-component-popup" data-testid="fuzzy-select-editor">
      <input
        ref={inputRef}
        className="vf-fuzzy-editor-input"
        defaultValue={initialLabel}
        placeholder={props.placeholder ?? "Type to search…"}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul className="vf-fuzzy-editor-list" role="listbox">
        {matches.length === 0 && (
          <li className="vf-fuzzy-editor-empty">No matches</li>
        )}
        {matches.map((m, i) => (
          <li
            key={String(m.item)}
            role="option"
            aria-selected={i === highlight}
            className={
              "vf-fuzzy-editor-option" + (i === highlight ? " is-highlighted" : "")
            }
            onMouseDown={(e) => {
              // mousedown (not click) so the input's blur doesn't cancel first.
              e.preventDefault();
              commit(m.item);
            }}
            onMouseEnter={() => setHighlight(i)}
          >
            {m.label || <span className="vf-dd-empty">— clear —</span>}
          </li>
        ))}
      </ul>
    </div>
  );
});

FuzzySelectEditor.displayName = "FuzzySelectEditor";
export default FuzzySelectEditor;
