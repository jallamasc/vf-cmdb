import { useEffect, useRef, useState } from "react";
import { api, Airport } from "../api";

/**
 * FEAT-5 — city autocomplete that resolves to an IATA airport code.
 *
 * The datacenter's ``vf_long_name`` is built from the parent site name plus
 * this IATA code, so the code has to be right. Typing a city queries
 * ``GET /naming/airport-code`` (250 ms debounced) and offers the matching
 * airports; picking one fills both the city and the code. The code stays
 * editable for the rare airport the built-in catalogue does not know.
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
  const [matches, setMatches] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [best, setBest] = useState<Airport | null>(null);
  // Guards against an older answer landing after a newer one.
  const seq = useRef(0);
  // Suppresses the lookup that the "pick a suggestion" state update triggers.
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const term = city.trim();
    if (term.length < 2) {
      setMatches([]);
      setBest(null);
      setOpen(false);
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
  }, [city]);

  const pick = (a: Airport) => {
    skipNext.current = true;
    setOpen(false);
    setMatches([]);
    setBest(a);
    onChange(a.city, a.iata);
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="col-span-2 flex flex-col gap-1 relative">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <input
          className={inputCls}
          value={city}
          placeholder="Start typing, e.g. Bogota"
          onChange={(e) => onChange(e.target.value, iataCode)}
          onFocus={() => matches.length > 0 && setOpen(true)}
          // Delay so a click on a suggestion registers before the list closes.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
        />
        {open && matches.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-auto rounded border border-slate-300 bg-white shadow-lg">
            {matches.map((m) => (
              <li key={m.iata}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  className="w-full px-2 py-1.5 text-left text-sm hover:bg-blue-50"
                >
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
        <p className="text-[11px] text-slate-400">
          {loading
            ? "Looking up airports…"
            : best && best.iata !== iataCode
              ? `Best match: ${best.iata} — ${best.name}`
              : "Pick a city to fill the airport code used in the VF long name."}
        </p>
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
  );
}
