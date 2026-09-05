import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ICellEditorParams } from "ag-grid-community";
import { api, Airport } from "../api";

export type AirportCellEditorParams = ICellEditorParams;

/**
 * Phase 4 Req 9 — search and select an airport IATA code directly in a grid
 * cell, instead of having to recall the code from memory.
 *
 * Opens with the cell's current value pre-filled, debounces (250 ms) queries
 * against `GET /naming/airport-code` as the operator types a city or code,
 * and commits the selected airport's IATA code on click/Enter. Implements the
 * same AG Grid ICellEditorComp contract as FuzzySelectEditor.
 */
const AirportCellEditor = forwardRef((props: AirportCellEditorParams, ref) => {
  const [query, setQuery] = useState(props.value ?? "");
  const [matches, setMatches] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(false);
  const [committed, setCommitted] = useState<unknown>(props.value ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setMatches([]);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .airportCode(term)
        .then((r) => {
          if (seq.current !== mine) return;
          setMatches(r.matches ?? []);
        })
        .catch(() => {
          if (seq.current !== mine) return;
          setMatches([]);
        })
        .finally(() => {
          if (seq.current === mine) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

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

  const commit = (airport: Airport) => {
    setCommitted(airport.iata);
    setQuery(airport.iata);
    setTimeout(() => props.api.stopEditing(), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && matches[0]) {
      e.preventDefault();
      commit(matches[0]);
    } else if (e.key === "Escape") {
      props.api.stopEditing(true);
    }
  };

  return (
    <div className="vf-fuzzy-editor" data-testid="airport-cell-editor">
      <input
        ref={inputRef}
        className="vf-fuzzy-editor-input"
        value={query}
        placeholder="City or IATA code…"
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          // Typing manually (no selection yet) still lets the operator commit
          // a code the built-in catalogue does not know, uppercased like the
          // existing CityAirportField behavior.
          setCommitted(v.toUpperCase().replace(/[^A-Z0-9]/g, ""));
        }}
        onKeyDown={onKeyDown}
      />
      <ul className="vf-fuzzy-editor-list" role="listbox">
        {loading && <li className="vf-fuzzy-editor-empty">Searching…</li>}
        {!loading && matches.length === 0 && (
          <li className="vf-fuzzy-editor-empty">
            {query.trim().length < 2 ? "Type a city or code…" : "No matches"}
          </li>
        )}
        {!loading &&
          matches.map((m) => (
            <li
              key={m.iata}
              role="option"
              className="vf-fuzzy-editor-option"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(m);
              }}
            >
              <span className="font-mono font-semibold">{m.iata}</span>{" "}
              {m.city}
              {m.country ? `, ${m.country}` : ""} — {m.name}
            </li>
          ))}
      </ul>
    </div>
  );
});

AirportCellEditor.displayName = "AirportCellEditor";
export default AirportCellEditor;
