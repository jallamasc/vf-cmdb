import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ICellEditorParams } from "ag-grid-community";
import { api, Airport } from "../api";
import CountryFlag from "../lib/countryFlags";

export type AirportCellEditorParams = ICellEditorParams;

/**
 * Phase 4 Req 9 — search and select an airport IATA code directly in a grid
 * cell, instead of having to recall the code from memory.
 *
 * Opens with the cell's current value pre-filled, debounces (250 ms) queries
 * against `GET /naming/airport-code` as the operator types a city or code,
 * and commits the selected airport's IATA code on click/Enter. Implements the
 * same AG Grid ICellEditorComp contract as FuzzySelectEditor.
 *
 * Phase 5 Task 30 (Req 25.1/25.2/25.3) — the search input is gated behind a
 * required Country selector and scoped to it; a manually typed code is only
 * committed as-typed when "not listed in the catalogue" is checked.
 */
const AirportCellEditor = forwardRef((props: AirportCellEditorParams, ref) => {
  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [notListed, setNotListed] = useState(false);
  const [query, setQuery] = useState(props.value ?? "");
  const [matches, setMatches] = useState<Airport[]>([]);
  const [loading, setLoading] = useState(false);
  const [committed, setCommitted] = useState<unknown>(props.value ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const initialized = useRef(false);

  useEffect(() => {
    api
      .airportCountries()
      .then((r) => setCountries(r.countries ?? []))
      .catch(() => setCountries([]));
  }, []);

  // Req 25.1 — best-effort resolve the Country for a pre-existing code so
  // re-opening the editor on an already-set cell doesn't start locked out.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const term = String(props.value ?? "").trim();
    if (!term) return;
    api
      .airportCode(term)
      .then((r) => {
        if (r.country) setCountry(r.country);
        else setNotListed(true);
      })
      .catch(() => setNotListed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disabled = !country && !notListed;

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || disabled) {
      setMatches([]);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .airportCode(term, 25, notListed ? "" : country)
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
  }, [query, country, notListed, disabled]);

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
    // See FuzzySelectEditor.tsx's comment on `ag-custom-component-popup` —
    // required for stopEditingWhenCellsLoseFocus to treat clicks inside this
    // popup as inside the grid, or every option click just closes the list.
    <div className="vf-fuzzy-editor ag-custom-component-popup" data-testid="airport-cell-editor">
      <select
        className="vf-fuzzy-editor-input"
        aria-label="Country"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
      >
        <option value="">Select a country…</option>
        {countries.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs px-1 py-1">
        <input
          type="checkbox"
          checked={notListed}
          onChange={(e) => setNotListed(e.target.checked)}
        />
        Not listed in the catalogue
      </label>
      <input
        ref={inputRef}
        className="vf-fuzzy-editor-input"
        value={query}
        disabled={disabled}
        placeholder={disabled ? "Select a country first…" : "City or IATA code…"}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          // Typing manually (no selection yet) still lets the operator commit
          // a code the built-in catalogue does not know, uppercased like
          // before — but only once "not listed" opts out of catalogue
          // matching (Req 25.2/25.3); otherwise only picking a suggestion
          // below can commit a value.
          if (notListed) {
            setCommitted(v.toUpperCase().replace(/[^A-Z0-9]/g, ""));
          }
        }}
        onKeyDown={onKeyDown}
      />
      <ul className="vf-fuzzy-editor-list" role="listbox">
        {loading && <li className="vf-fuzzy-editor-empty">Searching…</li>}
        {!loading && disabled && (
          <li className="vf-fuzzy-editor-empty">Select a country above…</li>
        )}
        {!loading && !disabled && matches.length === 0 && (
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
              <CountryFlag country={m.country} className="mr-1" />
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
