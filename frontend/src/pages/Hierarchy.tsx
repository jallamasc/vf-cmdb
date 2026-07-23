import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Row } from "../api";
import AbbrevField, { CASE_MODES } from "../components/AbbrevField";
import { lookupLabel } from "../lib/columns";

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Hierarchy() {
  const sites = useList("sites");
  const datacenters = useList("datacenters");
  const floors = useList("datacenter-floors");
  const rooms = useList("rooms");
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
        Build the physical chain <b>Site → Datacenter → Floor → Room → Rack</b>{" "}
        with inline Quick Add forms. Each abbreviation / code is validated for
        the domain-name charset and checked for global uniqueness as you type.
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
        subtitle="A datacenter belongs to a site."
        count={datacenters.data?.length ?? 0}
        list={
          <SimpleList
            rows={datacenters.data ?? []}
            render={(r) => `${r.name}${r.code ? ` (${r.code})` : ""}`}
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
        subtitle="A floor belongs to a datacenter."
        count={floors.data?.length ?? 0}
        list={
          <SimpleList
            rows={floors.data ?? []}
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
        subtitle="A room belongs to a floor."
        count={rooms.data?.length ?? 0}
        list={
          <SimpleList
            rows={rooms.data ?? []}
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

      {/* ---- Rack ---- */}
      <LevelCard
        title="Racks"
        subtitle="A rack sits in a room / floor and has a rack type."
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
            rackTypes={rackTypes.data ?? []}
          />
        )}
      />
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name,
          code: code || null,
          case_enforcement: caseEnf,
          site_id: siteId ? Number(siteId) : null,
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name,
          code: code || null,
          case_enforcement: caseEnf,
          datacenter_id: dcId ? Number(dcId) : null,
          floor_number: floorNo ? Number(floorNo) : null,
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
      <div className="col-span-2">
        <SubmitRow disabled={!name || (!!code && !valid)} pending={create.isPending} />
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          name,
          code: code || null,
          case_enforcement: caseEnf,
          datacenter_floor_id: floorId ? Number(floorId) : null,
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
        <SubmitRow disabled={!name || (!!code && !valid)} pending={create.isPending} />
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
  rackTypes,
}: {
  onDone: () => void;
  onErr: (msg: string) => void;
  sites: Row[];
  floors: Row[];
  rooms: Row[];
  rackTypes: Row[];
}) {
  const create = useCreate("racks", onDone, onErr);
  const [code, setCode] = useState("");
  const [trim, setTrim] = useState("manual");
  const [siteId, setSiteId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [units, setUnits] = useState("42");
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
          rack_type_id: typeId ? Number(typeId) : null,
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
      <Field label="Floor">
        <Select value={floorId} onChange={setFloorId} rows={floors} placeholder="— select floor —" />
      </Field>
      <Field label="Room">
        <Select value={roomId} onChange={setRoomId} rows={rooms} placeholder="— select room —" />
      </Field>
      <Field label="Total units (U)">
        <input type="number" className={inputCls} value={units} onChange={(e) => setUnits(e.target.value)} />
      </Field>
      <div />
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
          simple_name: simpleName || null,
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
      <Field label="Simple name">
        <input className={inputCls} value={simpleName} onChange={(e) => setSimpleName(e.target.value)} />
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
        <SubmitRow disabled={false} pending={create.isPending} />
      </div>
    </form>
  );
}
