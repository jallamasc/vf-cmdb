import { useEffect, useRef, useState } from "react";
import { api, Airport } from "../api";
import CountryFlag from "../lib/countryFlags";

/**
 * FEAT-5 — city autocomplete that resolves to an IATA airport code.
 *
 * The datacenter's ``vf_long_name`` is built from the parent site name plus
 * this IATA code, so the code has to be right. Typing a city queries
 * ``GET /naming/airport-code`` (250 ms debounced) and offers the matching
 * airports; picking one fills both the city and the code. The code stays
 * editable for the rare airport the built-in catalogue does not know.
 *
 * Phase 5 Task 30 (Req 25.1/25.2/25.3) — the City input is now gated behind a
 * required Country selector (a real location can't be entered without first
 * saying which country it's in), suggestions are scoped to that country, and
 * a typed city that doesn't match the country-filtered catalogue is rejected
 * on blur unless the operator has checked "not listed in the catalogue".
 */
interface Props {
  city: string;
  iataCode: string;
  onChange: (city: string, iataCode: string) => void;
  /** Rendered as the field label; defaults to "City". */
  label?: string;
}

const inputCls = "border border-slate-300 rounded px-2 py-1.5 text-sm w-full";

export default function CityAirportField({
  city,
  iataCode,
  onChange,
  label = "City",
}: Props) {
  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [notListed, setNotListed] = useState(false);
  // Local draft so a keystroke isn't committed to the parent until it either
  // matches the catalogue or the operator opts out via "not listed" — the
  // previous behavior committed every keystroke with no validation at all.
  const [draftCity, setDraftCity] = useState(city);
  const [matches, setMatches] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [best, setBest] = useState<Airport | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against an older answer landing after a newer one.
  const seq = useRef(0);
  const initialized = useRef(false);

  useEffect(() => {
    api
      .airportCountries()
      .then((r) => setCountries(r.countries ?? []))
      .catch(() => setCountries([]));
  }, []);

  // Req 25.1 — a pre-existing record already has a city/code; best-effort
  // resolve its Country once on mount so editing it doesn't start locked
  // out. If nothing in the catalogue matches, fall back to "not listed" so
  // the existing value stays visible/editable rather than being wiped.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const term = (iataCode || city).trim();
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

  // Keep the draft in sync when the parent's committed value changes for a
  // reason other than this component's own edits (e.g. loading a new row).
  useEffect(() => {
    setDraftCity(city);
  }, [city]);

  useEffect(() => {
    const term = draftCity.trim();
    if (term.length < 2 || (!country && !notListed)) {
      setMatches([]);
      setBest(null);
      setOpen(false);
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
          setBest(
            r.iata_code
              ? {
                  iata: r.iata_code,
                  city: r.city,
                  country: r.country ?? "",
                  name: r.airport ?? "",
                }
              : null,
          );
          setOpen((r.matches ?? []).length > 0);
        })
        .catch(() => {
          if (seq.current !== mine) return;
          setMatches([]);
          setBest(null);
        })
        .finally(() => {
          if (seq.current === mine) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [draftCity, country, notListed]);

  const pick = (a: Airport) => {
    setOpen(false);
    setMatches([]);
    setBest(a);
    setDraftCity(a.city);
    setError(null);
    onChange(a.city, a.iata);
  };

  /**
   * Req 25.2/25.3 — on blur, accept the typed city only if it matches the
   * (country-scoped, unless overridden) catalogue; otherwise revert to the
   * last committed value and show why.
   */
  const commitOrReject = () => {
    const typed = draftCity.trim();
    if (typed === (city ?? "").trim()) return;
    if (typed === "") {
      setError(null);
      setDraftCity("");
      onChange("", iataCode);
      return;
    }
    if (notListed) {
      setError(null);
      onChange(draftCity, iataCode);
      return;
    }
    const normalized = typed.toLowerCase();
    const matched =
      matches.find((m) => m.city.toLowerCase() === normalized) ??
      (best && best.city.toLowerCase() === normalized ? best : null);
    if (matched) {
      setError(null);
      setDraftCity(matched.city);
      onChange(matched.city, matched.iata || iataCode);
      return;
    }
    setError(
      `"${typed}" isn't in ${country ? `${country}'s` : "the selected country's"} ` +
        `catalogue. Check "not listed" below to enter it anyway.`,
    );
    setDraftCity(city);
  };

  const cityDisabled = !country && !notListed;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 max-w-xs">
        <label className="text-xs font-medium text-slate-600">Country</label>
        <select
          className={inputCls}
          aria-label="Country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setError(null);
          }}
        >
          <option value="">Select a country…</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 flex flex-col gap-1 relative">
          <label className="text-xs font-medium text-slate-600">{label}</label>
          <input
            className={inputCls}
            value={draftCity}
            disabled={cityDisabled}
            placeholder={
              cityDisabled ? "Select a country first" : "Start typing, e.g. Bogota"
            }
            onChange={(e) => {
              setDraftCity(e.target.value);
              setError(null);
            }}
            onFocus={() => {
              setFocused(true);
              if (matches.length > 0) setOpen(true);
            }}
            // Delay so a click on a suggestion registers before the list
            // closes, and so commitOrReject can still read a fresh `matches`.
            onBlur={() => {
              setTimeout(() => {
                setOpen(false);
                setFocused(false);
              }, 150);
              commitOrReject();
            }}
            autoComplete="off"
          />
          {open && focused && matches.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-auto rounded border border-slate-300 bg-white shadow-lg">
              {matches.map((m) => (
                <li key={m.iata}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(m)}
                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-blue-50"
                  >
                    <CountryFlag country={m.country} className="mr-1" />
                    <span className="font-mono font-semibold text-slate-800">
                      {m.iata}
                    </span>{" "}
                    <span className="text-slate-700">{m.city}</span>
                    <span className="text-slate-400">
                      {m.country ? `, ${m.country}` : ""} — {m.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className={`text-[11px] ${error ? "text-red-600" : "text-slate-400"}`}>
            {error
              ? error
              : loading
                ? "Looking up airports…"
                : cityDisabled
                  ? "Select a country to enable the city field."
                  : best && best.iata !== iataCode
                    ? `Best match: ${best.iata} — ${best.name}`
                    : "Pick a city to fill the airport code used in the VF long name."}
          </p>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={notListed}
              onChange={(e) => {
                setNotListed(e.target.checked);
                setError(null);
              }}
            />
            City not listed in the catalogue (enter it manually)
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">
            Airport (IATA)
          </label>
          <input
            className={`${inputCls} font-mono uppercase`}
            value={iataCode}
            maxLength={10}
            placeholder="BOG"
            onChange={(e) =>
              onChange(city, e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}
