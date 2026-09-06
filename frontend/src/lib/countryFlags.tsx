// Phase 5 Task 12 — country/region flags (Req 10).
//
// Every place a country appears in this app today (`site-addresses.country`,
// the airport search's `country` field) stores a free-text NAME, not an
// ISO 3166-1 alpha-2 code, so this module maps the country names actually in
// use (seed data + the airports catalogue + regionGeo.ts's mapped countries)
// to their code; an unrecognised name renders no flag rather than a broken
// one.
//
// Deliberately NOT importing the full `flag-icons` CSS: that file contains a
// background-image `url()` rule for every one of its ~250 flags, and Vite
// bundles every asset a CSS file references regardless of which classes are
// actually used at runtime — measured at +128KB gzip for functionality that
// only ever needs ~20 flags. Instead each supported flag is imported
// explicitly as its own small SVG (~1-4KB), so the bundle only ever contains
// the flags this app can actually display.
import type { ReactNode } from "react";
import coFlag from "flag-icons/flags/4x3/co.svg";
import usFlag from "flag-icons/flags/4x3/us.svg";
import caFlag from "flag-icons/flags/4x3/ca.svg";
import mxFlag from "flag-icons/flags/4x3/mx.svg";
import cuFlag from "flag-icons/flags/4x3/cu.svg";
import jmFlag from "flag-icons/flags/4x3/jm.svg";
import doFlag from "flag-icons/flags/4x3/do.svg";
import htFlag from "flag-icons/flags/4x3/ht.svg";
import bsFlag from "flag-icons/flags/4x3/bs.svg";
import prFlag from "flag-icons/flags/4x3/pr.svg";
import ttFlag from "flag-icons/flags/4x3/tt.svg";
import brFlag from "flag-icons/flags/4x3/br.svg";
import arFlag from "flag-icons/flags/4x3/ar.svg";
import clFlag from "flag-icons/flags/4x3/cl.svg";
import peFlag from "flag-icons/flags/4x3/pe.svg";
import boFlag from "flag-icons/flags/4x3/bo.svg";
import ecFlag from "flag-icons/flags/4x3/ec.svg";
import veFlag from "flag-icons/flags/4x3/ve.svg";
import pyFlag from "flag-icons/flags/4x3/py.svg";
import uyFlag from "flag-icons/flags/4x3/uy.svg";
import gyFlag from "flag-icons/flags/4x3/gy.svg";
import srFlag from "flag-icons/flags/4x3/sr.svg";
import paFlag from "flag-icons/flags/4x3/pa.svg";
import crFlag from "flag-icons/flags/4x3/cr.svg";
import gtFlag from "flag-icons/flags/4x3/gt.svg";
import hnFlag from "flag-icons/flags/4x3/hn.svg";
import svFlag from "flag-icons/flags/4x3/sv.svg";
import niFlag from "flag-icons/flags/4x3/ni.svg";
import esFlag from "flag-icons/flags/4x3/es.svg";
import gbFlag from "flag-icons/flags/4x3/gb.svg";
import frFlag from "flag-icons/flags/4x3/fr.svg";
import deFlag from "flag-icons/flags/4x3/de.svg";
import itFlag from "flag-icons/flags/4x3/it.svg";
import ptFlag from "flag-icons/flags/4x3/pt.svg";
import nlFlag from "flag-icons/flags/4x3/nl.svg";
import jpFlag from "flag-icons/flags/4x3/jp.svg";
import cnFlag from "flag-icons/flags/4x3/cn.svg";
import inFlag from "flag-icons/flags/4x3/in.svg";
import auFlag from "flag-icons/flags/4x3/au.svg";

export const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  colombia: "co",
  "united states": "us",
  "united states of america": "us",
  usa: "us",
  canada: "ca",
  mexico: "mx",
  cuba: "cu",
  jamaica: "jm",
  "dominican republic": "do",
  "dominican rep.": "do",
  haiti: "ht",
  bahamas: "bs",
  "puerto rico": "pr",
  "trinidad and tobago": "tt",
  brazil: "br",
  argentina: "ar",
  chile: "cl",
  peru: "pe",
  bolivia: "bo",
  ecuador: "ec",
  venezuela: "ve",
  paraguay: "py",
  uruguay: "uy",
  guyana: "gy",
  suriname: "sr",
  panama: "pa",
  "costa rica": "cr",
  guatemala: "gt",
  honduras: "hn",
  "el salvador": "sv",
  nicaragua: "ni",
  spain: "es",
  "united kingdom": "gb",
  france: "fr",
  germany: "de",
  italy: "it",
  portugal: "pt",
  netherlands: "nl",
  japan: "jp",
  china: "cn",
  india: "in",
  australia: "au",
};

/** Every ISO2 code above must have a matching imported SVG in this map. */
const FLAG_URLS: Record<string, string> = {
  co: coFlag,
  us: usFlag,
  ca: caFlag,
  mx: mxFlag,
  cu: cuFlag,
  jm: jmFlag,
  do: doFlag,
  ht: htFlag,
  bs: bsFlag,
  pr: prFlag,
  tt: ttFlag,
  br: brFlag,
  ar: arFlag,
  cl: clFlag,
  pe: peFlag,
  bo: boFlag,
  ec: ecFlag,
  ve: veFlag,
  py: pyFlag,
  uy: uyFlag,
  gy: gyFlag,
  sr: srFlag,
  pa: paFlag,
  cr: crFlag,
  gt: gtFlag,
  hn: hnFlag,
  sv: svFlag,
  ni: niFlag,
  es: esFlag,
  gb: gbFlag,
  fr: frFlag,
  de: deFlag,
  it: itFlag,
  pt: ptFlag,
  nl: nlFlag,
  jp: jpFlag,
  cn: cnFlag,
  in: inFlag,
  au: auFlag,
};

function normalizeCountryName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** ISO 3166-1 alpha-2 code for a free-text country name, or null when unrecognised. */
export function countryIso2(name?: string | null): string | null {
  if (!name) return null;
  return COUNTRY_NAME_TO_ISO2[normalizeCountryName(name)] ?? null;
}

interface CountryFlagProps {
  /** Free-text country name (e.g. "Colombia") — resolved via `countryIso2`. */
  country?: string | null;
  className?: string;
}

/** Renders nothing (not a broken flag) for an unrecognised/absent country. */
export default function CountryFlag({ country, className }: CountryFlagProps): ReactNode {
  const code = countryIso2(country);
  const url = code ? FLAG_URLS[code] : undefined;
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      title={country ?? undefined}
      aria-label={country ?? undefined}
      className={`inline-block w-4 h-3 align-middle ${className ?? ""}`.trim()}
    />
  );
}
