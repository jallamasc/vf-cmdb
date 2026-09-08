import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";
import AbbrevField, { CASE_MODES } from "../components/AbbrevField";
import CityAirportField from "../components/CityAirportField";
import EntityGrid from "../components/EntityGrid";
import BlueprintField from "../components/BlueprintField";
import {
  lookupLabel,
  roCol,
  textCol,
  airportCol,
  namingComputedCol,
  modeToggleCol,
} from "../lib/columns";
import { NAMING_MODE_VALUES } from "../lib/namingMode";
import { useNamePreview } from "../lib/useNamePreview";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function useList(slug: string) {
  return useQuery({ queryKey: [slug], queryFn: () => api.list(slug) });
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "border border-slate-300 rounded px-2 py-1.5 text-sm w-full";

function Select({
  value,
  onChange,
  rows,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: Row[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      <option value="">{placeholder}</option>
      {rows.map((r) => (
        <option key={r.id} value={r.id}>
          {lookupLabel(r)}
        </option>
      ))}
    </select>
  );
}

function CaseSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    >
      {CASE_MODES.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

// A collapsible card wrapping a hierarchy level: its Quick Add form + list.
// ``renderForm`` receives an ``onDone`` callback that closes the inline form
// after a successful create.
function LevelCard({
  title,
  subtitle,
  count,
  renderForm,
  list,
}: {
  title: string;
  subtitle: string;
  count: number;
  renderForm: (onDone: () => void) => React.ReactNode;
  list: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg bg-white mb-4 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-slate-400 text-xs">{open ? "▼" : "▶"}</span>
          <span className="font-semibold text-slate-800">{title}</span>
          <span className="text-[11px] bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">
            {count}
          </span>
        </button>
        <button
          onClick={() => {
            setOpen(true);
            setAdding((a) => !a);
          }}
          className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          {adding ? "Close" : "+ Quick Add"}
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-xs text-slate-500 mb-3">{subtitle}</p>
          {adding && (
            <div className="border border-blue-100 bg-blue-50/40 rounded-md p-3 mb-3">
              {renderForm(() => setAdding(false))}
            </div>
          )}
          {list}
        </div>
      )}
    </div>
  );
}

// Create-mutation hook shared by every inline form. Declaring it in one place
// keeps the Rules of Hooks intact (each form calls it once, unconditionally).
function useCreate(
  slug: string,
  onDone: () => void,
  onError: (msg: string) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Row) => api.create(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [slug] });
      onError("");
      onDone();
    },
    onError: (e: Error) => onError(e.message),
  });
}

function SimpleList({ rows, render }: { rows: Row[]; render: (r: Row) => string }) {
  if (rows.length === 0)
    return <div className="text-xs text-slate-400 italic">No records yet.</div>;
  return (
    <ul className="divide-y divide-slate-100 border border-slate-100 rounded">
      {rows.map((r) => (
        <li key={r.id} className="px-3 py-1.5 text-sm text-slate-700">
          {render(r)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Phase 5 Task 26/27 (Req 21.3/22.3) — like `SimpleList`, but each row has a
 * "Blueprint" toggle that expands an inline `BlueprintField` below it (the
 * same click-to-expand idiom `StencilField.tsx`'s "Edit anchors" toggle
 * uses) — there is otherwise no per-record detail view anywhere on this
 * page to attach a "Blueprint tab" to, so a single toggle IS the tab.
 */
/**
 * Post-Phase-6 QA (round 3) — inline "Fantastic Name" editor for one row,
 * expanded the same click-to-expand way `BlueprintField` already is below.
 * Floor/Room/Section all already carry `theme_name`/`theme_category`
 * columns (added by an earlier migration) that had zero UI anywhere —
 * this is the minimal edit surface for them, reusing the SAME resource +
 * row `EntityGrid`/`api.update` already relies on elsewhere.
 */
function ThemeNameEditor({ resource, row }: { resource: string; row: Row }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(String(row.theme_name ?? ""));
  const save = useMutation({
    mutationFn: () => api.update(resource, row.id, { theme_name: value || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [resource] }),
  });
  return (
    <div className="flex items-center gap-2">
      <input
        className={inputCls}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Fantastic name (nickname)"
      />
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="px-2.5 py-1 text-xs rounded bg-slate-800 text-white disabled:opacity-50 shrink-0"
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function BlueprintList({
  rows,
  resource,
  render,
}: {
  rows: Row[];
  resource: string;
  render: (r: Row) => string;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [namingId, setNamingId] = useState<number | null>(null);
  if (rows.length === 0)
    return <div className="text-xs text-slate-400 italic">No records yet.</div>;
  return (
    <ul className="divide-y divide-slate-100 border border-slate-100 rounded">
      {rows.map((r) => (
        <li key={r.id} className="px-3 py-1.5 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-2">
            <span>
              {r.theme_name ? (
                <span className="font-medium">{String(r.theme_name)} — </span>
              ) : null}
              {render(r)}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setNamingId((id) => (id === r.id ? null : r.id))}
                className="px-2 py-0.5 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
              >
                {namingId === r.id ? "Hide fantastic name" : "🎭 Fantastic name"}
              </button>
              <button
                type="button"
                onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}
                className="px-2 py-0.5 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
              >
                {expandedId === r.id ? "Hide blueprint" : "Blueprint"}
              </button>
            </div>
          </div>
          {namingId === r.id && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <ThemeNameEditor resource={resource} row={r} />
            </div>
          )}
          {expandedId === r.id && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <BlueprintField resource={resource} row={r} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// Req 9: airportCol gives the IATA cell an in-cell search/select editor.
// Post-Phase-6 QA (round 3) — column-order convention: ID -> Code Name ->
// Fantastic Name (editable) -> VF Long Name -> rest. `theme_name` is a
// real, independently editable column here (migration
// 0033_datacenter_theme_name) — it coexists with `code`, same as Site's
// theme_name/simple_name.
const DATACENTER_COLUMNS = [
  roCol("id", "ID", 60),
  textCol("name", "Name", 160),
  textCol("code", "Code", 100),
  textCol("theme_name", "Fantastic Name", 150),
  textCol("city", "City", 140),
  airportCol("iata_code", "Airport (IATA)"),
  namingComputedCol("vf_long_name", "VF Long Name", 220),
  // Phase 5 Task 28 (Req 23.1) — switch to "manual" to type a value into
  // VF Long Name directly.
  modeToggleCol("naming_mode", "Naming Mode", [...NAMING_MODE_VALUES]),
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Hierarchy() {
  const sites = useList("sites");
  const datacenters = useList("datacenters");
  const floors = useList("datacenter-floors");
  const rooms = useList("rooms");
  const sections = useList("sections");
  const racks = useList("racks");
  const rackTypes = useList("rack-types");
  const orgs = useList("organizations");
  const clouds = useList("clouds");
  const regions = useList("regions");
  const campuses = useList("campuses");
  const buildings = useList("buildings");
  const floorSections = useList("floor-sections");

  const [err, setErr] = useState<string>("");
  const onErr = (msg: string) => setErr(msg);

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-1">Physical Hierarchy</h1>
      <p className="text-sm text-slate-500 mb-4">
        Build the physical chain{" "}
        <b>Site → Datacenter → Floor → Room → Section → Rack</b> with inline
        Quick Add forms. Room and Section are optional — a rack may sit
        directly on a Floor, in a Room, or in a Section, but only one of the
        three. Each abbreviation / code is validated for the domain-name
        charset and checked for global uniqueness as you type. Floor, Room
        and Section can each carry an uploaded blueprint image.
      </p>

      {err && (
        <div className="mb-3 px-3 py-2 bg-red-100 text-red-800 rounded text-sm">
          {err}
        </div>
      )}

      {/* ---- Site ---- */}
      <LevelCard
        title="Sites"
        subtitle="Top-level locations. Full editing lives on the Sites page; use this for a quick create."
        count={sites.data?.length ?? 0}
        list={
          <SimpleList
            rows={sites.data ?? []}
            render={(r) => r.simple_name || r.vf_long_name || `Site #${r.id}`}
          />
        }
        renderForm={(onDone) => (
          <SiteForm
            onDone={onDone}
            onErr={onErr}
            orgs={orgs.data ?? []}
            clouds={clouds.data ?? []}
            regions={regions.data ?? []}
            campuses={campuses.data ?? []}
            buildings={buildings.data ?? []}
            floorSections={floorSections.data ?? []}
          />
        )}
      />

      {/* ---- Datacenter ---- */}
      <LevelCard
        title="Datacenters"
        subtitle="A datacenter belongs to a site. Its city resolves to an airport (IATA) code, which is appended to the site name to form the VF long name. Click the Airport cell to search — you don't need to remember the code."
        count={datacenters.data?.length ?? 0}
        list={
          // Req 9: an editable grid (not a read-only list) so an existing
          // datacenter's IATA code can be fixed after creation, searched
          // in-cell instead of typed from memory.
          <EntityGrid
            resource="datacenters"
            title=""
            columns={DATACENTER_COLUMNS}
            allowAdd={false}
            minHeight={220}
            footerHint={null}
          />
        }
        renderForm={(onDone) => (
          <DatacenterForm
            onDone={onDone}
            onErr={onErr}
            sites={sites.data ?? []}
          />
        )}
      />

      {/* ---- Floor ---- */}
      <LevelCard
        title="Floors"
        subtitle="A floor belongs to a datacenter. Click “Blueprint” on a row to upload or view its floor plan."
        count={floors.data?.length ?? 0}
        list={
          <BlueprintList
            rows={floors.data ?? []}
            resource="datacenter-floors"
            render={(r) => `${r.name}${r.code ? ` (${r.code})` : ""}`}
          />
        }
        renderForm={(onDone) => (
          <FloorForm
            onDone={onDone}
            onErr={onErr}
            datacenters={datacenters.data ?? []}
          />
        )}
      />

      {/* ---- Room ---- */}
      <LevelCard
        title="Rooms"
        subtitle="A room belongs to a floor. Optional — a rack can sit directly on the floor instead. Click “Blueprint” on a row to upload or view its floor plan."
        count={rooms.data?.length ?? 0}
        list={
          <BlueprintList
            rows={rooms.data ?? []}
            resource="rooms"
            render={(r) => `${r.name}${r.code ? ` (${r.code})` : ""}`}
          />
        }
        renderForm={(onDone) => (
          <RoomForm
            onDone={onDone}
            onErr={onErr}
            floors={floors.data ?? []}
          />
        )}
      />

      {/* ---- Section ---- */}
      <LevelCard
        title="Sections"
        subtitle="A section always belongs to a room — a further subdivision when a room is large enough to need one. Click “Blueprint” on a row to upload or view its floor plan."
        count={sections.data?.length ?? 0}
        list={
          <BlueprintList
            rows={sections.data ?? []}
            resource="sections"
            render={(r) => `${r.name}${r.code ? ` (${r.code})` : ""}`}
          />
        }
        renderForm={(onDone) => (
          <SectionForm
            onDone={onDone}
            onErr={onErr}
            rooms={rooms.data ?? []}
          />
        )}
      />

      {/* ---- Rack ---- */}
      <LevelCard
        title="Racks"
        subtitle="A rack sits directly on a floor, in a room, or in a section — pick only one — and has a rack type."
        count={racks.data?.length ?? 0}
        list={
          <SimpleList
            rows={racks.data ?? []}
            render={(r) =>
              `${r.code || r.simple_name || `Rack #${r.id}`} · ${r.total_units}U`
            }
          />
        }
        renderForm={(onDone) => (
          <RackForm
            onDone={onDone}
            onErr={onErr}
            sites={sites.data ?? []}
            floors={floors.data ?? []}
            rooms={rooms.data ?? []}
            sections={sections.data ?? []}
            rackTypes={rackTypes.data ?? []}
          />
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// UX-4: live name preview
// ---------------------------------------------------------------------------
// Human labels for the FK inputs the backend reports as still missing.
const FIELD_LABELS: Record<string, string> = {
  organization_id: "Organization",
  cloud_id: "Cloud",
  region_id: "Region",
  campus_id: "Campus",
  building_id: "Building",
  floor_section_id: "Floor / Section",
  site_id: "Site",
  room_id: "Room",
  section_id: "Section",
  datacenter_id: "Datacenter",
  datacenter_floor_id: "Floor",
  rack_type_id: "Rack type",
  grid_coordinates: "Grid coordinates",
  iata_code: "Airport (IATA) code",
  city: "City",
};

function PreviewLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {value ? (
        <code className="font-mono text-sm text-slate-800 break-all">{value}</code>
      ) : (
        <span className="text-xs italic text-slate-400">
          not enough information yet
        </span>
      )}
    </div>
  );
}

type PreviewField =
  | "simple_name"
  | "vf_long_name"
  | "vf_short_name"
  | "tia606b_name"
  | "code";

const PREVIEW_LABELS: Record<PreviewField, string> = {
  simple_name: "Site Code",
  vf_long_name: "VF Long",
  vf_short_name: "VF Short",
  tia606b_name: "TIA-606-B",
  // Phase 6 Task 13/14 — Floor's "F{n}" / Section's "S{n}".
  code: "Code",
};

const DEFAULT_PREVIEW_FIELDS: PreviewField[] = [
  "vf_long_name",
  "vf_short_name",
  "tia606b_name",
];

/**
 * Which generated names a level actually produces. A site also gets the
 * FEAT-1 site code; a datacenter (FEAT-5) only gets a VF long name, so the
 * short / TIA lines are not rendered as perpetually empty for it. Floor/
 * Section (Phase 6 Task 13) only ever generate `code`.
 */
const PREVIEW_FIELDS: Record<string, PreviewField[]> = {
  site: ["simple_name", ...DEFAULT_PREVIEW_FIELDS],
  datacenter: ["vf_long_name"],
  datacenter_floor: ["code"],
  section: ["code"],
};

/**
 * Card shown under a Quick Add form with the names the entity will get.
 *
 * The values come from the backend naming engine (300 ms debounced), so what
 * the user sees here is exactly what gets written on Create.
 */
function NamePreviewCard({
  entityType,
  params,
}: {
  entityType: string;
  params: Record<string, unknown>;
}) {
  const { preview, loading, error } = useNamePreview(entityType, params);

  return (
    <div className="rounded-md border border-slate-200 bg-white/70 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">
          Live name preview
        </span>
        {loading && <span className="text-[11px] text-slate-400">updating…</span>}
        {!loading && preview?.complete && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">
            complete
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-700">Preview unavailable: {error}</p>
      )}

      {!error && preview && (
        <div className="flex flex-col gap-1">
          {preview.generated ? (
            <>
              {(PREVIEW_FIELDS[entityType] ?? DEFAULT_PREVIEW_FIELDS).map(
                (field) => (
                  <PreviewLine
                    key={field}
                    label={PREVIEW_LABELS[field]}
                    value={preview[field]}
                  />
                ),
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">
              This level is not part of the auto-naming chain — it keeps the
              name and code you type here.
            </p>
          )}
          {preview.path && (
            <PreviewLine label="Location" value={preview.path} />
          )}
          {preview.missing.length > 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              Still missing:{" "}
              {preview.missing
                .map((f) => FIELD_LABELS[f] ?? f)
                .join(", ")}
            </p>
          )}
        </div>
      )}

      {!error && !preview && !loading && (
        <p className="text-xs italic text-slate-400">
          Pick the values above to see the generated name.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-level inline forms. Each form owns its create mutation via ``useCreate``.
// ---------------------------------------------------------------------------
function SubmitRow({
  disabled,
  pending,
}: {
  disabled: boolean;
  pending: boolean;
}) {
  return (
    <div className="mt-3">
      <button
        type="submit"
        disabled={disabled || pending}
        className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Create"}
      </button>
    </div>
  );
}

function DatacenterForm({
  onDone,
  onErr,
  sites,
}: {
  onDone: () => void;
  onErr: (msg: string) => void;
  sites: Row[];
}) {
  const create = useCreate("datacenters", onDone, onErr);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [trim, setTrim] = useState("manual");
  const [caseEnf, setCaseEnf] = useState("mixed");
  const [siteId, setSiteId] = useState("");
  const [valid, setValid] = useState(false);
  // FEAT-5: the city drives the IATA code that goes into the VF long name.
  const [city, setCity] = useState("");
  const [iataCode, setIataCode] = useState("");
  // Post-Phase-6 QA (round 3) — Datacenter's own "fantastic name", set at
  // create time or later via the grid's own "Fantastic Name" column.
  const [themeName, setThemeName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name,
          code: code || null,
          theme_name: themeName.trim() || null,
          case_enforcement: caseEnf,
          site_id: siteId ? Number(siteId) : null,
          city: city.trim() || null,
          iata_code: iataCode.trim() || null,
        });
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Site (parent)">
        <Select value={siteId} onChange={setSiteId} rows={sites} placeholder="— select site —" />
      </Field>
      <Field label="Fantastic name (optional nickname)">
        <input
          className={inputCls}
          value={themeName}
          onChange={(e) => setThemeName(e.target.value)}
          placeholder="e.g. Ironforge"
        />
      </Field>
      <div className="col-span-2">
        <CityAirportField
          city={city}
          iataCode={iataCode}
          onChange={(c, i) => {
            setCity(c);
            setIataCode(i);
          }}
        />
      </div>
      <div className="col-span-2 grid grid-cols-2 gap-3">
        <AbbrevField
          value={code}
          onChange={setCode}
          fullName={name}
          trimMode={trim}
          onTrimModeChange={setTrim}
          caseEnforcement={caseEnf}
          entityType="datacenters"
          onValidityChange={setValid}
        />
        <Field label="Case enforcement">
          <CaseSelect value={caseEnf} onChange={setCaseEnf} />
        </Field>
      </div>
      <div className="col-span-2">
        <NamePreviewCard
          entityType="datacenter"
          params={{ site_id: siteId, name, code, city, iata_code: iataCode }}
        />
      </div>
      <div className="col-span-2">
        <SubmitRow disabled={!name || (!!code && !valid)} pending={create.isPending} />
      </div>
    </form>
  );
}

function FloorForm({
  onDone,
  onErr,
  datacenters,
}: {
  onDone: () => void;
  onErr: (msg: string) => void;
  datacenters: Row[];
}) {
  const create = useCreate("datacenter-floors", onDone, onErr);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [trim, setTrim] = useState("manual");
  const [caseEnf, setCaseEnf] = useState("mixed");
  const [dcId, setDcId] = useState("");
  const [floorNo, setFloorNo] = useState("");
  const [valid, setValid] = useState(false);
  // Post-Phase-6 QA (round 3) — Floor already has a `theme_name` column
  // (it just had no UI); set at create time here, editable later via the
  // list's own "🎭 Fantastic name" toggle (`ThemeNameEditor`).
  const [themeName, setThemeName] = useState("");
  // Phase 6 Task 13/14 (Req 6.1/6.3) — `code` is now auto-generated
  // ("F{n}" scoped to the parent Datacenter) by default; this Quick Add
  // form has no grid to make read-only, so the equivalent Code Mode
  // control here is this toggle — checked (auto) hides the manual code
  // input entirely and lets the server generate it, matching every other
  // naming-engine field's default.
  const [autoCode, setAutoCode] = useState(true);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name,
          case_enforcement: caseEnf,
          datacenter_id: dcId ? Number(dcId) : null,
          floor_number: floorNo ? Number(floorNo) : null,
          theme_name: themeName.trim() || null,
          ...(autoCode ? {} : { naming_mode: "manual", code: code || null }),
        });
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Datacenter (parent)">
        <Select value={dcId} onChange={setDcId} rows={datacenters} placeholder="— select datacenter —" />
      </Field>
      <Field label="Floor number">
        <input type="number" className={inputCls} value={floorNo} onChange={(e) => setFloorNo(e.target.value)} />
      </Field>
      <Field label="Case enforcement">
        <CaseSelect value={caseEnf} onChange={setCaseEnf} />
      </Field>
      <Field label="Fantastic name (optional nickname)">
        <input
          className={inputCls}
          value={themeName}
          onChange={(e) => setThemeName(e.target.value)}
          placeholder="e.g. Ironforge"
        />
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 vf-mode-toggle-cell px-2 py-1 rounded w-fit">
        <input
          type="checkbox"
          checked={autoCode}
          onChange={(e) => setAutoCode(e.target.checked)}
        />
        Auto-generate code (Code Mode)
      </label>
      {!autoCode && (
        <div className="col-span-2">
          <AbbrevField
            value={code}
            onChange={setCode}
            fullName={name}
            trimMode={trim}
            onTrimModeChange={setTrim}
            caseEnforcement={caseEnf}
            entityType="datacenter_floors"
            onValidityChange={setValid}
          />
        </div>
      )}
      <div className="col-span-2">
        <NamePreviewCard
          entityType="datacenter_floor"
          params={{ datacenter_id: dcId, name, floor_number: floorNo }}
        />
      </div>
      <div className="col-span-2">
        <SubmitRow disabled={!name || (!autoCode && !!code && !valid)} pending={create.isPending} />
      </div>
    </form>
  );
}

function RoomForm({
  onDone,
  onErr,
  floors,
}: {
  onDone: () => void;
  onErr: (msg: string) => void;
  floors: Row[];
}) {
  const create = useCreate("rooms", onDone, onErr);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [trim, setTrim] = useState("manual");
  const [caseEnf, setCaseEnf] = useState("mixed");
  const [floorId, setFloorId] = useState("");
  const [valid, setValid] = useState(false);
  // Post-Phase-6 QA (round 3) — Room already has a `theme_name` column;
  // set at create time here, editable later via the list's own
  // "🎭 Fantastic name" toggle.
  const [themeName, setThemeName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name,
          code: code || null,
          case_enforcement: caseEnf,
          datacenter_floor_id: floorId ? Number(floorId) : null,
          theme_name: themeName.trim() || null,
        });
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Floor (parent)">
        <Select value={floorId} onChange={setFloorId} rows={floors} placeholder="— select floor —" />
      </Field>
      <Field label="Fantastic name (optional nickname)">
        <input
          className={inputCls}
          value={themeName}
          onChange={(e) => setThemeName(e.target.value)}
          placeholder="e.g. Ironforge"
        />
      </Field>
      <div className="col-span-2 grid grid-cols-2 gap-3">
        <AbbrevField
          value={code}
          onChange={setCode}
          fullName={name}
          trimMode={trim}
          onTrimModeChange={setTrim}
          caseEnforcement={caseEnf}
          entityType="rooms"
          onValidityChange={setValid}
        />
        <Field label="Case enforcement">
          <CaseSelect value={caseEnf} onChange={setCaseEnf} />
        </Field>
      </div>
      <div className="col-span-2">
        <NamePreviewCard
          entityType="room"
          params={{ datacenter_floor_id: floorId, name, code }}
        />
      </div>
      <div className="col-span-2">
        <SubmitRow disabled={!name || (!!code && !valid)} pending={create.isPending} />
      </div>
    </form>
  );
}

function SectionForm({
  onDone,
  onErr,
  rooms,
}: {
  onDone: () => void;
  onErr: (msg: string) => void;
  rooms: Row[];
}) {
  const create = useCreate("sections", onDone, onErr);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [trim, setTrim] = useState("manual");
  const [caseEnf, setCaseEnf] = useState("mixed");
  const [roomId, setRoomId] = useState("");
  const [valid, setValid] = useState(false);
  // Post-Phase-6 QA (round 3) — Section already has a `theme_name`
  // column; set at create time here, editable later via the list's own
  // "🎭 Fantastic name" toggle.
  const [themeName, setThemeName] = useState("");
  // Phase 6 Task 13/14 (Req 6.2/6.3) — `code` is now auto-generated
  // ("S{n}" scoped to the parent Room) by default; same Code Mode toggle
  // idiom as FloorForm above.
  const [autoCode, setAutoCode] = useState(true);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name,
          case_enforcement: caseEnf,
          room_id: roomId ? Number(roomId) : null,
          theme_name: themeName.trim() || null,
          ...(autoCode ? {} : { naming_mode: "manual", code: code || null }),
        });
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Room (parent)">
        <Select value={roomId} onChange={setRoomId} rows={rooms} placeholder="— select room —" />
      </Field>
      <Field label="Fantastic name (optional nickname)">
        <input
          className={inputCls}
          value={themeName}
          onChange={(e) => setThemeName(e.target.value)}
          placeholder="e.g. Ironforge"
        />
      </Field>
      <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600 vf-mode-toggle-cell px-2 py-1 rounded w-fit">
        <input
          type="checkbox"
          checked={autoCode}
          onChange={(e) => setAutoCode(e.target.checked)}
        />
        Auto-generate code (Code Mode)
      </label>
      {!autoCode && (
        <div className="col-span-2 grid grid-cols-2 gap-3">
          <AbbrevField
            value={code}
            onChange={setCode}
            fullName={name}
            trimMode={trim}
            onTrimModeChange={setTrim}
            caseEnforcement={caseEnf}
            entityType="sections"
            onValidityChange={setValid}
          />
          <Field label="Case enforcement">
            <CaseSelect value={caseEnf} onChange={setCaseEnf} />
          </Field>
        </div>
      )}
      <div className="col-span-2">
        <NamePreviewCard entityType="section" params={{ room_id: roomId, name }} />
      </div>
      <div className="col-span-2">
        <SubmitRow disabled={!name || !roomId || (!autoCode && !!code && !valid)} pending={create.isPending} />
      </div>
    </form>
  );
}

function RackForm({
  onDone,
  onErr,
  sites,
  floors,
  rooms,
  sections,
  rackTypes,
}: {
  onDone: () => void;
  onErr: (msg: string) => void;
  sites: Row[];
  floors: Row[];
  rooms: Row[];
  sections: Row[];
  rackTypes: Row[];
}) {
  const create = useCreate("racks", onDone, onErr);
  const [code, setCode] = useState("");
  const [trim, setTrim] = useState("manual");
  const [siteId, setSiteId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [units, setUnits] = useState("42");
  const [gridCoords, setGridCoords] = useState("");
  const [valid, setValid] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          code: code || null,
          site_id: siteId ? Number(siteId) : null,
          datacenter_floor_id: floorId ? Number(floorId) : null,
          room_id: roomId ? Number(roomId) : null,
          section_id: sectionId ? Number(sectionId) : null,
          rack_type_id: typeId ? Number(typeId) : null,
          grid_coordinates: gridCoords || null,
          total_units: units ? Number(units) : 42,
        });
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Field label="Site">
        <Select value={siteId} onChange={setSiteId} rows={sites} placeholder="— select site —" />
      </Field>
      <Field label="Rack type">
        <Select value={typeId} onChange={setTypeId} rows={rackTypes} placeholder="— select rack type —" />
      </Field>
      <Field label="Floor (or Room, or Section — only one)">
        <Select value={floorId} onChange={setFloorId} rows={floors} placeholder="— select floor —" />
      </Field>
      <Field label="Room (or Floor, or Section — only one)">
        <Select value={roomId} onChange={setRoomId} rows={rooms} placeholder="— select room —" />
      </Field>
      <Field label="Section (or Floor, or Room — only one)">
        <Select value={sectionId} onChange={setSectionId} rows={sections} placeholder="— select section —" />
      </Field>
      <Field label="Total units (U)">
        <input type="number" className={inputCls} value={units} onChange={(e) => setUnits(e.target.value)} />
      </Field>
      <Field label="Grid coordinates">
        <input
          className={inputCls}
          value={gridCoords}
          onChange={(e) => setGridCoords(e.target.value)}
          placeholder="e.g. C07"
        />
      </Field>
      <div className="col-span-2">
        <AbbrevField
          value={code}
          onChange={setCode}
          fullName={code}
          trimMode={trim}
          onTrimModeChange={setTrim}
          caseEnforcement="mixed"
          entityType="racks"
          label="Rack code"
          onValidityChange={setValid}
        />
      </div>
      <div className="col-span-2">
        <NamePreviewCard
          entityType="rack"
          params={{
            site_id: siteId,
            datacenter_floor_id: floorId,
            room_id: roomId,
            code,
            grid_coordinates: gridCoords,
          }}
        />
      </div>
      <div className="col-span-2">
        <SubmitRow disabled={!!code && !valid} pending={create.isPending} />
      </div>
    </form>
  );
}

function SiteForm({
  onDone,
  onErr,
  orgs,
  clouds,
  regions,
  campuses,
  buildings,
  floorSections,
}: {
  onDone: () => void;
  onErr: (msg: string) => void;
  orgs: Row[];
  clouds: Row[];
  regions: Row[];
  campuses: Row[];
  buildings: Row[];
  floorSections: Row[];
}) {
  const create = useCreate("sites", onDone, onErr);
  const [simpleName, setSimpleName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [cloudId, setCloudId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [fsId, setFsId] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          // FEAT-1: an empty box means "let the server generate the code";
          // anything typed here is kept verbatim (custom mode). The themed
          // mode is offered on the Sites page, which can open the picker.
          site_code_type: simpleName.trim() ? "custom" : "auto",
          simple_name: simpleName.trim() || null,
          organization_id: orgId ? Number(orgId) : null,
          cloud_id: cloudId ? Number(cloudId) : null,
          region_id: regionId ? Number(regionId) : null,
          campus_id: campusId ? Number(campusId) : null,
          building_id: buildingId ? Number(buildingId) : null,
          floor_section_id: fsId ? Number(fsId) : null,
        });
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Field label="Site code (leave empty to auto-generate)">
        <input
          className={inputCls}
          value={simpleName}
          placeholder="auto: org + campus + region + sequence"
          onChange={(e) => setSimpleName(e.target.value)}
        />
      </Field>
      <Field label="Organization">
        <Select value={orgId} onChange={setOrgId} rows={orgs} placeholder="— organization —" />
      </Field>
      <Field label="Cloud">
        <Select value={cloudId} onChange={setCloudId} rows={clouds} placeholder="— cloud —" />
      </Field>
      <Field label="Region">
        <Select value={regionId} onChange={setRegionId} rows={regions} placeholder="— region —" />
      </Field>
      <Field label="Campus">
        <Select value={campusId} onChange={setCampusId} rows={campuses} placeholder="— campus —" />
      </Field>
      <Field label="Building">
        <Select value={buildingId} onChange={setBuildingId} rows={buildings} placeholder="— building —" />
      </Field>
      <Field label="Floor / Section">
        <Select value={fsId} onChange={setFsId} rows={floorSections} placeholder="— floor / section —" />
      </Field>
      <div />
      <div className="col-span-2">
        <NamePreviewCard
          entityType="site"
          params={{
            organization_id: orgId,
            cloud_id: cloudId,
            region_id: regionId,
            campus_id: campusId,
            building_id: buildingId,
            floor_section_id: fsId,
            simple_name: simpleName,
            site_code_type: simpleName.trim() ? "custom" : "auto",
          }}
        />
      </div>
      <div className="col-span-2">
        <SubmitRow disabled={false} pending={create.isPending} />
      </div>
    </form>
  );
}
