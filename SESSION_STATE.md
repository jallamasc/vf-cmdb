# Virtualfactor IT CMDB - Session State
## Living Document - Read on Every Interaction

**Last Updated**: 2026-09-09 (Current session)
**Project Phase**: Phase 6 ("Data Quality & Hardware Intelligence") COMPLETE — all 41 tasks done, all 4 checkpoints (I/J/K/L) verified and committed. Post-Phase-6 QA rounds 1-5 all fixed and verified (see below).
**Status**: ✅ Phases 1-5 shipped and stable. Phase 6 fully implemented, tested, and verified end-to-end against live Podman Postgres + running dev backend/frontend. HEAD `f270b77` on `master` (working tree clean, not pushed — this repo has no configured push target for this checkout; see "Everything below this section" for the full Phase 1-5 history, which is stale in its specifics — e.g. paths/ports — but the architecture/decisions remain valid).

---

## 🆕 (2026-09-08): Phase 6 COMPLETE — Data Quality & Hardware Intelligence

Spec: `.kiro/specs/phase-6-data-quality-and-hardware-intelligence/` (41 tasks
across 12 sub-phases A-L). All tasks checked off in `tasks.md`. Delivered
across many commits this session; the final two sub-phases (this session's
tail end) were:

**Checkpoint J (commit `57fc9e3`)** — Sub-phase J, Tasks 33-38, Requirement 13
("Hardware Spec Detail Pages"):
- Task 33: category-appropriate spec columns on the 4 device-type registries
  (`compute_device_types`/`network_device_types`/`storage_device_types`/
  `power_device_types`) — migration `0030_hardware_spec_fields`.
- Task 34: `backend/app/icecat_client.py` — Icecat brand+model lookup client.
- Task 35: `backend/app/search_client.py` — Brave Search fallback (links +
  snippets only, never auto-parses a value out of text — Req 13.3).
- Task 36: `GET /hardware-spec/lookup` — Icecat first, Brave fallback.
- Task 37: `frontend/src/components/HardwareSpecPanel.tsx` — inline panel
  (same idiom as StencilPanel) wired into `Naming.tsx`; lookup results are
  read-only, operator must manually apply any value.
- Task 38: Gather_Facts_Sync (Req 13.4) — `ansible_facts`/`cpu_cores`/
  `memory_mb`/`os_distribution`/`last_fact_sync_at` columns added to
  `generic_entities` (migration `0031_generic_entity_facts`, mirroring the
  hardcoded device tables' Phase 4 shape); capability-gated
  `POST /generic-entities/{id}/facts` in `routers/special.py`
  (`ingest_generic_entity_facts`); `lifecycle_sync.py`'s per-record
  Semaphore inventory now carries a `cmdb_id` hostvar; convention + example
  playbook task documented in `ansible/README.md` section 3. No new
  automation transport — reuses the existing Semaphore launch/poll
  endpoints from Phase 5 Sub-phase F as-is.

**Checkpoint K (commit `077c9dd`)** — Sub-phase K, Tasks 39-40, Requirement 14
("IP-to-Device Auto-Sync"):
- `backend/app/ip_auto_sync.py` — a `lifecycle_sync.py`-style module (its
  own file, called from `crud.create_item`/`update_item`/`delete_item`)
  that mirrors every IP-bearing column on the 5 hardcoded device models
  into a matching polymorphic `IpAssignment` row: `NetworkDevice`/
  `VirtualMachine` (management ipv4+ipv6), `PhysicalServer` (TWO roles —
  management AND its separate iLO/IPMI ipv4), `ContainerApp` (its own
  ipv4+ipv6), `Workstation` (management ipv4 only). Set/changed ->
  create-or-update; cleared -> remove.
- `IpAssignment.auto_generated` (new bool column, migration
  `0032_ip_assignment_flag`) mirrors `Cable.auto_generated`'s exact
  rationale — only a row this module created is ever auto-touched, so a
  manually-created `IpAssignment` row sharing the same
  `(assigned_to_type, assigned_to_id, interface_name)` is never clobbered.

**Checkpoint L (Task 41, this session, not a separate commit — a
verification pass over the state left by Checkpoint K)**: full backend
pytest (321 passed / 1 skipped, `vfcmdb_test`), full frontend Vitest (313
passed) + `tsc --noEmit` + `vite build`, all clean. Both dev servers
live-verified reachable (`curl` 200 on `:8000/api/v1/sites` and `:5173/`).
**All 41 tasks in tasks.md are now `[x]`.**

**A mid-session gotcha worth remembering**: the Podman machine
(`podman-machine-default`) and its two containers (`vf_cmdb_dev` postgres,
`vf_cmdb_semaphore`) can silently stop between agent turns (observed this
session — likely a host sleep/session-lifecycle event, unrelated to any
app change). Symptom: `curl` to `:8000` fails with connection-refused, and
`list_processes` shows the uvicorn/vite background terminals gone too. Fix:
`podman machine start` (from `/opt/homebrew/bin`), then
`podman start vf_cmdb_dev vf_cmdb_semaphore`, then restart the uvicorn
(`--reload`, `POSTGRES_DB=vfcmdb`, port 8000) and `npm run dev` (port 5173)
background processes. Postgres data survives (it's a named container, not
`--rm`), so nothing was lost — just restart, don't recreate.

**Post-Phase-6 QA fixes (2026-09-08, same day, later in session)** — three
bugs reported from live browser testing, all fixed and verified:

1. **Every dropdown/picker in the app appeared to do nothing when you
   clicked an option** (icon picker, FK pickers, select pickers, airport
   picker — anywhere `cellEditorPopup` is used). Root cause: AG Grid's
   `stopEditingWhenCellsLoseFocus: true` (`EntityGrid.tsx`) races a custom
   popup cell editor's own click handler — AG Grid's FocusService treats a
   click inside the popup as "outside the grid" (the popup DOM lives
   outside the grid's own subtree) unless the popup's root element carries
   AG Grid's own `ag-custom-component-popup` class, so it called
   `stopEditing()` itself before our `commit()` ran, discarding the
   selection. Fixed by adding that class to `FuzzySelectEditor.tsx`,
   `IconPickerEditor.tsx`, `AirportCellEditor.tsx`.
2. **Region map showed almost nothing illustrated, and clicking did
   nothing useful.** No seeded `Region` row had ever had `latitude`/
   `longitude` set (only the manual click-to-place editor could set them,
   and nobody had used it), so the existing marker layer had zero markers
   to draw. Added `REGION_COORDS` + `_backfill_region_coords()` to
   `backend/app/seed.py` (illustrative centroid per region, additive/
   idempotent, never overwrites an operator-placed point) and ran it
   against the live `vfcmdb` DB. Markers are now also clickable
   (`RegionMap.tsx`'s `onSelectRegion`) and focus that EXACT region in the
   grid below (`Naming.tsx`'s `focusedRegionId`), more precise than the
   pre-existing country-polygon click (which can't distinguish Colombia's
   6 natural regions from each other). Also added visible/editable
   latitude/longitude columns to the regions grid.
3. **`503: vss2svg-conv is not installed on this host` on every Stencil
   Library fetch.** Not a bug — `vss2svg-conv` is genuinely only buildable
   inside the Containerfile image (Linux-only native deps), and the bare
   `.venv` uvicorn dev backend on the host never has it. Fixed
   operationally: stopped the bare-metal uvicorn on :8000, rebuilt
   `vf-cmdb-backend-dev` (it was stale — missing migrations 0030-0032 baked
   in from earlier this session) and ran `DEV_BACKEND_PORT=8000
   ./dev-container.sh up` instead, so the SAME :8000 the frontend already
   proxies to is now served from inside the container that has
   `vss2svg-conv` built in. Live-verified full fetch->convert->preview
   round-trip against a real vendor ZIP (Microsoft's Network Equipment
   Shapes bundle) — 200s all the way through, real SVG served.
   **Remember for next session**: the backend on :8000 is now the
   CONTAINERIZED one (`vf_cmdb_backend_dev`, via `backend/dev-container.sh
   up`), not a bare `uvicorn`. Its live-reload is a `podman cp` + `fswatch`
   loop on `backend/app/` ONLY (this checkout's path isn't bind-mountable
   into the Podman machine VM) — `backend/alembic/` changes are NOT
   auto-synced by that loop; a new migration needs either a manual
   `podman cp backend/alembic vf_cmdb_backend_dev:/app/alembic` or an image
   rebuild (`podman build -t vf-cmdb-backend-dev -f Containerfile .`)
   before `alembic upgrade head` inside the container will see it.

Verified after all 3 fixes: 324 backend pytest passed / 1 skipped (was 321
before this pass — +3 new `test_seed_region_coords.py` cases), 316
frontend Vitest passed (was 313 — +3 new `RegionMap.test.tsx` marker-click
cases), `tsc --noEmit` clean, `vite build` clean.

**Follow-up (same day) — fix #1 (dropdown selection) was NOT actually
fixed by the `ag-custom-component-popup` class alone.** The user reported
it was still broken after that change. Root-caused properly this time by
mounting a REAL (unmocked) `AgGridReact` + real custom popup editor in a
Vitest/happy-dom integration test — every existing unit test for these
editors (`FuzzySelectEditor.test.tsx` etc.) calls `fireEvent.mouseDown`
directly on the component, bypassing AG Grid's own runtime entirely, so
none of them could ever have caught this class of bug. The real issue: a
popup cell editor's commit relies on AG Grid successfully calling the
editor's `getValue()` when `stopEditing()` runs, which itself depends on
focus round-tripping correctly through the popup's detached DOM subtree —
a dependency chain that `stopEditingWhenCellsLoseFocus` can race. Fixed by
making the commit path NOT depend on that handshake at all:
`FuzzySelectEditor.tsx`/`IconPickerEditor.tsx`/`AirportCellEditor.tsx` now
call `props.node.setDataValue(props.column, value)` directly inside their
option-click handler, which writes the value into the row (and fires
`onCellValueChanged`) immediately and unconditionally. Added a permanent
regression test, `AgGridPopupEditor.integration.test.tsx`, that mounts a
real grid + real editor and asserts a clicked option's value actually
reaches `onCellValueChanged` — this is the ONLY test in the suite that
exercises AG Grid's real popup-editor runtime end to end; keep it if these
editors are touched again. Verified: 318 frontend Vitest passed (+2 new),
tsc clean, build clean.

**Naming-convention modifications (2026-09-08, same day, later in session)** —
10 user-requested changes to the naming engine/UX, planned with the user
before implementing (2 deliberately smaller/safer interpretations were
confirmed: no `theme_name` on all 17 lookup dictionaries; only
`vf_short_name`/`vf_friendly_name` get the length cap, not `vf_long_name`).
All implemented, tested, and verified:

1. **Max Length -> bounded 1-9 dropdown**, and made it actually mean
   something: `abbrev.validate_max_length_bounds`/
   `validate_abbreviation_length` (backend/app/abbrev.py, wired into
   `crud.py`) reject an abbreviation longer than its own row's Max Length,
   or a Max Length outside 1-9.
2/3. **Auto-suggested abbreviation**: `abbrev.suggest_abbreviation()` +
   `GET /naming/suggest-abbreviation` — derives a base (first 2 letters by
   default) and appends an incrementing numeric suffix on collision
   (`vi`/`vi1`/`vi2`...), trimmed to fit `max_length`. Frontend: a
   "Suggest abbreviation for ..." panel shown for the selected row on
   EVERY naming lookup (`Naming.tsx`'s `SuggestAbbreviationPanel`).
7. Every lookup already shows both `full_name` and `abbreviation` as
   columns; the Suggest panel is the "automatic name" half — did NOT add
   theme names to the 17 plain dictionaries (their `full_name` already
   plays that role).
9. **Length cap**: `naming.SHORT_NAME_MAX_LENGTH` 12 -> 8; new
   `naming._cap_short_name()` truncates the assembled abbreviation prefix
   while always preserving the trailing consecutive/sequence number
   intact (that's what keeps it unique). Applied to
   `PhysicalServer`/`VirtualMachine`/`ContainerApp`/`Workstation.vf_short_name`
   and `NetworkDevice.vf_friendly_name`. `vf_long_name` (full hierarchical
   identifier, used for TIA-606-B/uniqueness) deliberately NOT capped.
10. `lib/columns.tsx`'s `lookupLabel()` now shows `theme_name-realcode`
   (e.g. "Tatooine-vfhmcc1") when a theme name is set (Site,
   NetworkDevice), instead of hiding the real code behind the nickname.
4. **Region detail page** — new `pages/RegionDetail.tsx` at `/regions/:id`
   (App.tsx), linked from a new "View details ->" column in the Regions
   grid. Shows the region's own fields, a map centered on its own marker,
   and a live `sites` EntityGrid filtered to that region (no backend
   changes needed — reuses existing generic CRUD).
5. **OS Family name picker** — new `lib/osNames.ts` (curated OS/platform
   catalogue: Android, iOS, Ubuntu, Windows Server, Cisco IOS, ... —
   broader than the backend's endoflife.date-oriented `CURATED_PRODUCTS`)
   + new `components/OsNameEditor.tsx`, a free-text-WITH-suggestions popup
   editor (unlike `FuzzySelectEditor`'s closed list, Enter always commits
   whatever is typed, matching a suggestion or not). Wired only onto
   `os-families`' `full_name` column.
6. **OS Versions grouping** — new `lib/osVersionGrouping.ts`: since
   `OsVersion` has no real FK to `OsFamily` (they're matched by
   abbreviation-prefix convention, same limitation `endoflife_client.py`
   already documents), groups by longest-matching family prefix and ranks
   by the first numeric run found in each version's name. `os-versions`
   defaults to an `externalFilter` showing only the latest 4 per family
   (with a "Show all versions" toggle) plus a computed, sortable "OS
   Family" column — endoflife.date syncs EVERY release it has ever
   tracked, which otherwise balloons this list past 100 rows.
8. **Ansible/Semaphore usage** — clarified for the user (not a code
   change): the web UI can only launch an existing Semaphore template
   against a Generic Entity that has the `ansible_managed` capability
   (via that record's Automation tab) and watch it run. Inventory preview,
   ad-hoc/group playbook runs, and automation on the 5 hardcoded device
   tables all happen outside vf-cmdb (Semaphore's own UI, or the CLI via
   `ansible/cmdb_inventory.py`) — there's no code path for those inside
   this app today.

No backend schema/migration changes were needed for items 4/5/6 (frontend-
only, reusing existing generic CRUD + the region/OS-family/OS-version data
that already existed). Verified: 345 backend pytest passed / 1 skipped
(+21 new), 353 frontend Vitest passed (+37 new), `tsc --noEmit` clean,
`vite build` clean. Live-curl-verified against the running containerized
dev backend: `/naming/suggest-abbreviation`, the `max_length` 422
rejection, and `/regions` data (has lat/lng) all confirmed working.

**Post-Phase-6 QA round 2 (2026-09-08, same day, later still)** — 4 more
bugs reported from live browser testing, all fixed and verified (a larger
backlog from the same feedback batch — column reordering, short-name
enrichment, Datacenter/Floor fantastic names, IPAM/port-grouping/
PowerOutlet-UI gaps — is intentionally deferred; see "Next" below):

A. **Abbreviation was still manually editable** despite the "Suggest"
   button from the prior round — the button only ever offered a value, it
   never forced anything. Fixed at the root: `crud.py`'s new
   `_auto_abbreviate()` hook runs on every `create_item`/`update_item` for
   the 17 plain full_name/abbreviation lookups (LookupMixin — anything
   whose `abbrev.ABBR_FIELDS` entry is `"abbreviation"`, NOT the
   `"code"`-based hierarchy models which keep their existing
   `AbbrevField.tsx` manual/derived choice on Hierarchy), and
   unconditionally overwrites whatever the client sent with a value
   derived from `full_name` via `abbrev.suggest_abbreviation` — collision
   -> numeric suffix, same as before. Default derivation is now
   `trim_mode="consonants"` (was `"first_2"`) — e.g. "Hoymeaseguro" ->
   "hymsgr" — the closest mechanical rule to how real abbreviations like
   "Virtualfactor" -> "vf" are actually picked, though no rule reproduces
   a hand-picked one perfectly every time (flagged to the user as a
   known tradeoff). `LookupMixin.trim_mode`/`case_enforcement` defaults
   changed to `"consonants"`/`"lowercase"` (was `"manual"`/`"mixed"`) to
   match; an existing `"manual"` row is treated the same as `"consonants"`
   for this forced path. The changelog now records the actual derived
   value, not whatever the client attempted. Frontend: `Naming.tsx`'s
   Abbreviation column is now `roCol` (was `textCol`), and the whole
   "Suggest abbreviation" panel/button was removed (redundant — it's
   automatic now). The `GET /naming/suggest-abbreviation` endpoint itself
   is kept (harmless, still useful for other callers), its own default
   trim mode updated to `"consonants"` too.
B. **Clicking a region only ever focused the map/list — the dedicated
   detail page (`RegionDetail.tsx`, already built last round) was easy to
   miss.** Its "View details ->" link column existed but sat after every
   other column (off-screen without scrolling) — moved to the front, right
   next to the flag column. Also added a prominent "Open detail page for
   '<name>' ->" link that appears next to the map whenever a region is
   selected (by grid row OR by clicking its map marker), so the marker
   click — which only ever focused/filtered before — now has an obvious,
   one-click way to reach the real detail page too.
C. **Site's "fantastic" name (`theme_name`) was locked (`roCol`) in the
   Sites grid**, even though the dedicated tri-mode panel above the grid
   could already set it — the two are meant to coexist (e.g. "Mirial -
   Code Name"), not one gate the other. Changed to `textCol` in
   `Sites.tsx` so it's a normal editable cell too, same as the panel.
   (Datacenter/Floor getting their own fantastic+short names is a bigger,
   separate ask — see "Next".)
D. **Stencil Library "apply" (and the manual SVG upload) silently did
   nothing — `stencil_url` stayed blank.** Root cause: `upload_stencil`
   (`POST /stencils/{model_slug}`) only ever wrote the on-disk cache via
   `stencils.store_bytes`; it never patched the owning row's own
   `stencil_url`/`stencil_url_back` column, which is what every consumer
   (`RackView`, `PortConfigView`, `PowerDeviceView`, and the admin UI's own
   next load) actually reads to decide whether to render anything. Fixed
   by patching that column (via `crud.update_item`, using the existing
   `_parse_owner_slug`/`STENCIL_RESOURCES` map) right after the cache
   write succeeds — covers BOTH the 4 device-type lookups and all 10
   Universal_Stencil_Override device-instance tables, since they share the
   one endpoint. Also fixed `StencilField.tsx`'s `StencilFaceRow`: its URL
   input's local state never re-synced after an external update (upload/
   library-apply), so it kept showing stale/blank text even once the real
   column was correct — added a `useEffect` resync.

Also fixed a real regression caught by live-testing this round's own
stencil fix: the first version of `_auto_abbreviate`'s update-path
recomputed the abbreviation on ANY field change (e.g. patching
`stencil_url` from the upload endpoint silently rewrote the abbreviation
too) — narrowed to only re-derive when `full_name`/`trim_mode`/
`case_enforcement`/`max_length`/`abbreviation` itself actually changed;
added `test_unrelated_field_update_does_not_re_derive_the_abbreviation`.

(Side note on process hygiene: an earlier verification pass in this same
session showed ~24 spurious Postgres `DeadlockDetectedError` failures
across unrelated test files; root cause was NOT the app — it was multiple
`pytest` background processes left running concurrently against the same
`vfcmdb_test` DB from earlier `control_bash_process` invocations that
were never stopped. Killing the strays and running a single clean pass
gives a fully green, non-flaky 357/1-skipped every time. Always confirm
no other pytest process is still running against the test DB before
trusting a "flaky" failure.)

Verified (single clean run): 357 backend pytest passed / 1 skipped, 349 frontend Vitest passed
(+0 net — some `Naming.test.tsx` cases were removed with the Suggest panel,
one new `MemoryRouter` wrapper needed since `Naming.tsx` now renders a
real `<Link>` outside of any grid column mock), `tsc --noEmit` clean,
`vite build` clean. New backend test files: `test_forced_abbreviation.py`,
`test_stencil_upload_persists_url.py`; `test_max_length.py`/
`test_suggest_abbreviation.py` rewritten for the new forced-derivation
behavior (collisions are now seeded directly in `AbbreviationRegistry`
rather than via `crud.create_item`, since that no longer accepts a literal
client-supplied abbreviation for these models).

**All of the "Next" items originally listed here were resolved in later
rounds** (short-name enrichment + column reordering + Datacenter/Floor
theming in round 3; the IPv4-to-IPv6-table claim was reconciled — no such
table exists — in round 3 too). See the round 3/4/4-follow-up entries
below for what actually shipped for each.

**Next for the user**: browser-test Phase 6 at `http://localhost:5173` —
particularly the Naming Conventions page's new Hardware Spec panel
(Icecat/Brave lookup, read-only results) on any of the 4 device-type
registries, and the IP Assignments tab/page after editing a device's own
management IP (should now auto-populate without any manual IP Assignment
entry). Optionally configure `ICECAT_*`/`BRAVE_SEARCH_*`/`SEMAPHORE_*` env
vars to exercise the live external-integration paths (all gracefully
degrade to "unconfigured" without them, per this phase's non-functional
requirement).

**Post-Phase-6 QA round 3 (2026-09-08, same day, later still)** — the rest
of the same feedback batch (short-name detail, global column ordering,
Datacenter/Floor naming, IP assignment/port-config/power-outlet gaps,
Subnets-empty investigation). All implemented, tested, and verified:

1. **Site short-name enrichment** — `naming.site_short_name()` used to stop
   packing components as soon as org+campus reached 4 characters, so a
   site with both set (the common case) read as just "cloud + placement"
   and nothing else. Now greedily packs as many distinct hierarchy levels
   (org, campus, region, building, floor/section, cloud — in that
   priority order) as fit inside the unchanged 8-char cap, skipping a
   piece whole rather than truncating it mid-abbreviation if it wouldn't
   fully fit. Existing rows only get the richer name once they're next
   saved (naming.apply_naming re-runs on update, not retroactively) —
   live-verified on Site #1: `VFHM` -> `VFHMM1VS` after a no-op PATCH.
2. **Global column order** (`ID -> Fantastic Name -> VF Long Name -> VF
   Short Name -> rest`) applied to `PhysicalServers.tsx`/`Workstations.tsx`/
   `VirtualMachines.tsx`/`ContainersApps.tsx`/`NetworkDevices.tsx`
   (`Sites.tsx` already matched). None of these 5 models has a real
   `theme_name` column (only Site/NetworkDevice do, and NetworkDevice's
   stayed as its existing `alternative_name` + 🎭 picker, just moved up
   front) — the existing freeform nickname field (`alternative_name`/
   `friendly_name`) fills the "Fantastic Name" slot instead of inventing a
   new column.
3. **Datacenter/Floor fantastic + coded names** — Datacenter had no
   `theme_name`/`theme_category` at all (migration
   `0033_datacenter_theme_name`, applied live); Floor/Room/Section already
   had the columns from an earlier migration but zero UI. `Hierarchy.tsx`:
   `DATACENTER_COLUMNS` gained an editable Fantastic Name column;
   Datacenter/Floor/Room/Section Quick-Add forms all gained a "Fantastic
   name" input; a new shared `ThemeNameEditor` + a "🎭 Fantastic name"
   toggle on `BlueprintList` (Floor/Room/Section's shared list component)
   let an existing row's nickname be set/edited after creation. Datacenter's
   real coded name (`code`) and Floor's auto-generated `code` (`F{n}`) are
   both untouched/independent of the new theme fields.
4. **IP Assignments were "completely manual"** — added a `SuggestIpPanel`
   (shown once a row is selected) with "Suggest next free IPv4" (calls the
   existing `/ipam/subnets/{id}/next-ip`) and "...IPv6" (`/next-reserved?
   family=ipv6`) buttons that write the result straight into that row.
   Deliberately did NOT build a dropdown enumerating every free address
   (no endpoint does that, and it wouldn't be usable for anything bigger
   than a tiny subnet) or an IPv4-to-IPv6 correspondence table (**does not
   exist in this schema** — the user was misremembering; only
   `IpAssignment` carries both address columns on one row).
5. **Port Config was "a very unmanageable list"** — AG Grid Community (this
   app's edition) has no row-grouping module, so `PortConfig.tsx` got the
   same "filter by X" idiom `Vlans.tsx` already uses for the identical
   problem: a Device filter dropdown + a default sort on the Device column
   so even "All devices" visually clusters each device's ports together.
6. **Bulk port creation** — new `BulkPortCreator` in `PortConfig.tsx`
   ("+ Generate ports"): device + start port + count + mode, loops
   `api.create` sequentially (no bulk-create endpoint exists) to generate
   a whole range of `DeviceInterface` rows in one action.
7. **PowerOutlet had no CRUD page anywhere** — it had full generic-CRUD
   backend support (`registry.py`) and was already read from by
   `RackView.tsx`/`PowerDeviceView.tsx`, but could only ever exist if
   seeded. New `pages/PowerOutlets.tsx` (+ route `/power-outlets` + nav
   entry) fixes that; live-verified create/delete round-trip.
8. **"Subnets (IPAM) is always completely empty"** — not reproducible in
   this dev DB (56 IPv4 / 47 IPv6 / 44 VLANs already present, confirmed
   live) — Subnets.tsx's CRUD already works. Root-caused the real footgun
   instead: `seed.py`'s one-shot demo-topology block (VLANs+subnets
   included) is gated by the `Organization` row count and runs at most
   ONCE ever — a database where an `Organization` existed before subnets
   were added to `seed_subnets.json` (or any partial-seed history) is
   permanently locked out of ever getting subnets from a normal `seed()`
   run again. Extracted the inline subnet/VLAN construction into
   `_seed_subnets_from_json()` (pure refactor) and added
   `_backfill_missing_subnets()`, called from the "already seeded" early
   return path — it only acts when the WHOLE database has zero subnets of
   EITHER family (so it can never duplicate or clobber real, possibly
   hand-edited data) and at least one `Site` exists to attach them to.

Also fixed a self-inflicted process-hygiene issue found while verifying:
an earlier backend pytest run in this same session showed ~24 spurious
Postgres `DeadlockDetectedError` failures; root cause was multiple
`pytest` background processes left running concurrently against the same
`vfcmdb_test` DB from earlier `control_bash_process` invocations that were
never stopped (confirmed via `ps aux` — `list_processes` itself can show a
stale "running" status for a terminal whose underlying process already
exited). Always kill stray pytest processes before trusting a "flaky"
failure; a single clean run is fully green.

Verified: 369 backend pytest passed / 1 skipped (single clean run — new
test files `test_backfill_missing_subnets.py`, `test_full_seed_run.py`,
`test_hierarchy_theme_names.py`; `test_short_name_length_cap.py` gained 2
cases), 366 frontend Vitest passed across 55 files (new: `IpAssignments.
test.tsx`, `PortConfig.test.tsx` additions, `PowerOutlets.test.tsx`),
`tsc --noEmit` clean, `vite build` clean. Live-verified against the
running containerized dev backend (`vf_cmdb_backend_dev`, migration 0033
applied via `podman cp` + `alembic upgrade head` since the container's
fswatch loop only syncs `backend/app/`, not `backend/alembic/`): Datacenter
theme_name round-trip, site short-name re-derivation on update,
power-outlets create/delete, subnet counts unchanged (confirming the
backfill correctly stayed a no-op against real data).

**Next** (from the same feedback batch, still not started/confirmed):
- `PortConfigView.tsx` (the breadcrumb/SVG diagram page) and the
  `owner_device_type`/`owner_device_id` polymorphism gap on
  `DeviceInterface` — ports owned by a physical server/workstation/
  generic-entity (not a network device) can't be created/edited from
  either Port Config page today; this round only fixed the
  network-device-owned case's "unmanageable list" complaint.
- The Ansible/Semaphore usage explanation from the earlier round still
  stands (no code path for ad-hoc/group playbook runs inside vf-cmdb).

**Post-Phase-6 QA round 4 (2026-09-08, same day, yet later)** — a further
feedback batch on the naming engine + a few UI gaps. All implemented,
tested, and verified:

1. **Max Length silently mangled a meaningful abbreviation instead of
   rejecting the change.** Lowering `max_length` alone used to re-trigger
   `_auto_abbreviate`, which would happily re-derive (and thus destroy) an
   already-unique, hand-meaningful abbreviation like "vsw" for "Virtual
   switch" (chosen to stay distinguishable from a plain "sw" Switch type).
   `crud.py`'s update-path trigger set no longer includes `max_length` —
   only `full_name`/`trim_mode`/`case_enforcement`/`abbreviation` (+
   Building's own `building_type`/`number`, see below) re-derive; a
   `max_length` lowered below the CURRENT abbreviation's length is now
   rejected outright by the existing `abbrev.validate_abbreviation_length`
   422, exactly the same way a client-typed too-long value already was.
   Live-verified on the real "Virtual switch"/"vsw" row.
2. **Region detail page couldn't add/modify anything** — the Overview
   section was a plain read-only `<dl>`. Rebuilt as a lightweight
   "commit on blur" editable form (`OverviewField`, mirroring
   `DeviceOverviewForm.tsx`'s idiom) for Full Name, Fantastic Name
   (`theme_name`), Max Length, Latitude, Longitude, Description.
   Abbreviation stays read-only (still forced/derived, per round 2).
3. **"How did the app deduce that 'Main Building 1' equals M1... do not
   guess."** Building gets two new structured columns, `building_type` +
   `number` (migration `0034_building_structured_code`), and
   `crud.py`'s `_auto_abbreviate` now has a Building-specific branch:
   when both are set, the abbreviation is COMPOSED deterministically
   (`{first letter of building_type}{number}` — "Main"+1 -> "m1"), not
   guessed from `full_name` text. Falls back to the generic consonant
   derivation for a legacy/incomplete row that hasn't set them yet, so
   nothing breaks. `abbrev.py` gained a `disambiguate()` helper (extracted
   from `suggest_abbreviation`) so this reuses the exact same case/
   max-length/collision-suffix handling without deriving from a name.
4. **OS Families/Versions: the "latest 4 per family" feature silently did
   nothing for the seeded demo data.** `osVersionGrouping.ts` matches a
   version to its family by abbreviation PREFIX (`"{family_abbr}-..."` —
   the convention the live endoflife.date sync already follows), but the
   coarse seeded `OsVersion` rows used arbitrary unrelated abbreviations
   (e.g. "Windows Server 2016" -> "s16" vs family "Windows" -> "wn") that
   never actually matched. Every seeded `OsVersion` abbreviation now
   follows that same prefix convention, plus added "Windows Server 2022"
   (+ 2012 R2) and a few more Ubuntu/OpnSense/Proxmox versions so each
   family has more than 4 entries — the grouping/filter is now meaningful
   fully offline, not just after a live sync. (Did not implement a
   "select version from a family dropdown" UI, or reorder device grids to
   put OS Version before OS Family — both read as much larger, separate
   asks; flagging as deferred rather than guessing at scope.)
5. **"The conformed name and the fantastic name are not together... the
   site code shows the fantastic name instead of the conformed name."**
   Root cause: `naming.generate_site`'s old `site_code_type == "theme"`
   branch mirrored `theme_name` STRAIGHT INTO `simple_name`, replacing the
   real code instead of coexisting with it. That branch is now removed —
   `simple_name` is always either the auto-generated code ("auto") or
   whatever was typed ("custom"); any other value (including legacy
   "theme" data — confirmed none exists in this DB) behaves like "custom"
   and is left untouched. `theme_name` is set independently via
   `SiteCodePanel.tsx`'s own separate mutation and now always coexists.
6. **"vf short should be a summary... to preserve order on the lists"** +
   **"Simple Name should result by conformation of vf short, everywhere."**
   `site_short_name`'s greedy-packing order now matches `site_long_name`'s
   own hierarchy order exactly (organization, cloud, region, campus,
   building, floor/section) instead of a separately-reordered priority
   list from the previous round — `vf_short_name` is now a true truncated
   PREFIX of `vf_long_name`. `auto_site_code`/the `/naming/site-code`
   preview endpoint were refactored to share the exact same
   `naming._short_name_prefix` core `site_short_name` uses (extracted
   helper), so `simple_name` (in "auto" mode) is now `vf_short_name`
   (lowercased) + a trailing uniqueness sequence number, not an
   independently-derived org+campus+region-only value. Live-verified: a
   fresh auto-mode site got `simple_name="vf1"`/`vf_short_name="VF"`.
7. **"Treat wall section as section, according to TIA."** `PowerOutlet`
   gains `section_id` (migration `0035_power_outlet_section`), a real FK
   to the `Section` hierarchy level (which already carries a TIA-606-
   derived `code`, `naming.generate_section`'s sequential "S{n}" per
   room) — replacing the old free-text `wall_section` in
   `PowerOutlets.tsx`'s grid (the DB column itself is kept, unused, for
   backward compatibility with any existing hand-typed data).

Verified: 387 backend pytest passed / 1 skipped (single clean run — new
test files `test_building_structured_abbreviation.py`,
`test_site_code_theme_coexistence.py`,
`test_seed_os_version_family_prefix.py`, `test_power_outlet_section.py`;
`test_max_length.py`/`test_short_name_length_cap.py`/`RegionDetail.test.tsx`/
`PowerOutlets.test.tsx` gained cases), 370 frontend Vitest passed across 55
files, `tsc --noEmit` clean, `vite build` clean. Migrations 0034/0035
applied live via `podman cp` + `alembic upgrade head`; re-ran `python -m
app.seed` inside the container to pick up the corrected OS version
abbreviations (additive — added the new "wn-"/"lx-"/"op-"/"px-"-prefixed
rows alongside the old ones) and manually deleted the now-superseded old
rows (all but one — "Proxmox 7"/"p7" is still FK-referenced by a seeded
demo PhysicalServer and Postgres correctly blocked that one delete with a
409; left in place, harmless). Live-verified every fix above against the
running dev backend and cleaned up all test data created during
verification (test Building, test Site).

**Next** (from this round, not started/confirmed):
- Building's structured Type+Number composition was NOT extended to any
  other lookup — only Building was explicitly named in the feedback.
- The seeded demo `PhysicalServer` referencing the old "Proxmox 7"/"p7"
  `OsVersion` row was not repointed to the new "px-p7" row (blocked
  delete, not a functional problem — both rows resolve to the same real
  OS, just two ids now exist for it in this one dev DB).

**Round 4 follow-up (2026-09-08, same day)** — clarified + resolved:
1. **"OS Versions has more importance than OS Families... simply put
   versions first on the menu."** `Naming.tsx`'s "Operating Systems"
   category now lists "OS Versions" before "OS Families" (both the
   sidebar entry order and, since `ALL_LOOKUPS` is built by flattening
   categories in order, wherever that list is otherwise consumed).
2. **`DeviceInterface` owner-polymorphism gap** (flagged as deferred in
   round 3's own "Next", never explicitly re-requested but picked up as
   a "continue pending tasks" item) — `PortConfig.tsx` never exposed
   `owner_device_type`/`owner_device_id` at all, so a port belonging to a
   physical server, workstation or generic entity (anything but a
   network device) could never be created or edited from the UI, even
   though the backend (`ports.py`'s `interface_owner()`, generic CRUD)
   already fully supported it — confirmed via `test_ports.py`/
   `test_schema.py`, which round-trip exactly this. Added plain
   `owner_device_type` (select) + `owner_device_id` (number) columns,
   mirroring the SAME polymorphic-reference idiom `IpAssignments.tsx`'s
   `assigned_to_type`/`assigned_to_id` already uses (not a dynamic
   per-row FK dropdown). Also removed the grid's stale `requiredFields`
   entry for `network_device_id` — that column has been nullable at the
   DB level since FEAT-6 (6C); nothing on `DeviceInterface` is actually
   required. `PortConfigView.tsx` (the breadcrumb/SVG diagram page)
   remains scoped to network devices only — extending its graphical view
   to other device classes is a separate, larger redesign, not attempted.

Verified: no backend changes this pass (pure frontend + a live
create/delete round-trip via `POST /api/v1/device-interfaces` with
`owner_device_type="physical-servers"`, confirmed working and cleaned
up). Frontend: 372 Vitest passed across 55 files (+2 new `PortConfig.
test.tsx` cases), `tsc --noEmit` clean, `vite build` clean.

**Round 4 follow-up 2 (2026-09-08, same day)** — "We need to reorganize
the fields available on entity type builder, only slug and label are not
enough fields to create a type of devices. Also this page behaves
strange, adding a new entity create a row under a white space, is this
normal?"

Root-caused BOTH complaints to the same underlying gap: `EntityGrid.tsx`'s
"+ Add row" never selected the row it just created, so on a
selection-driven detail panel (`EntityTypeBuilder.tsx`'s Capabilities +
Custom Fields panel, `Sites.tsx`'s tri-mode panel, etc.) the panel kept
showing its empty "select a row" placeholder right above the grid after
adding — reading as a blank gap the new row appeared "under". It also
meant a newly-created Entity Type's REAL configuration surface
(Capabilities: 9 toggles; Custom Fields: an unlimited key/label/type/
required/order list) stayed invisible until a manual extra click, making
"slug and label" look like the whole story when it never was.

1. **`EntityGrid.tsx`**: `createMut`'s `onSuccess` now remembers the
   created row's id; once it actually lands in `rowData` (a new
   `useEffect` watching `gridRowData`), that row is selected via AG
   Grid's own `getRowNode(id).setSelected(true, true)` — firing the
   normal `onSelectionChanged` wiring, so any page's detail panel opens
   immediately. This benefits every page using the
   add-then-configure-in-panel pattern, not just Entity Type Builder.
2. **`EntityTypeBuilder.tsx`**: reordered columns (ID -> Label -> Slug ->
   Icon -> Description -> **Capabilities** -> **Fields** -> Records
   link); the two new read-only summary columns surface what's actually
   configured in the detail panel below (comma-joined capability labels;
   a count of `entity-field-defs` rows for that type) directly in the
   grid, so a fully-configured type no longer looks identical to a bare
   one at a glance. Still edited in the panel (a JSONB array and a
   one-to-many list don't fit a single grid cell) — these are summaries,
   not new editable fields. Updated the page description + the panel's
   empty-state text to spell out the 2-step flow ("add a row for its
   Label/Slug/Icon/Description, then use the panel for Capabilities/
   Custom Fields") instead of leaving that implicit.

Verified: frontend 375 Vitest passed across 55 files (+2 new `EntityGrid.
test.tsx` cases for the auto-select behavior, +1 new `EntityTypeBuilder.
test.tsx` case for the summary columns), `tsc --noEmit` clean, `vite
build` clean. `AgGridPopupEditor.integration.test.tsx` (a real, unmocked
AG Grid DOM test unrelated to any file touched this round) intermittently
failed only under full-suite load, confirmed via `git stash`/re-run to be
pre-existing flakiness, not a regression — it and everything else passed
cleanly on repeated full-suite runs. No backend changes.

**Post-Phase-6 QA round 5 (2026-09-09)** — "I keep seeing the column on
site code showing only the fantastic name, is the field I should see for
example 'Alderaan - vfsite1'? Also dropdown to select fantastic name is
not working, we shall check this everywhere."

Root-caused via a live-data check (`curl /api/v1/sites`), not guesswork:
site #1 had `site_code_type: "theme"`, `simple_name: "Alderaan"` and
`theme_name: null` — a pre-round-4-fix row where the old "theme" mode had
permanently written the fantastic name into the real code column and
never independently recorded it as `theme_name`, so the two "identities"
the panel now treats as independent were actually the same single stored
value shown under two labels. Separately, no grid anywhere combined a
row's own code with its own `theme_name` for display — `lookupLabel()`
already builds "FANTASTICNAME-REALCODE" but only for *reference* rows
shown inside another grid's FK dropdown, never for a row's own identity
column in its own grid. The picker itself (`ThemeNamePicker.tsx`,
`SiteCodePanel.tsx`'s "Pick a name…"/"Change…" flow) was exercised
end-to-end with a real (unmocked) render + click + debounced fetch + a
live `curl -X PATCH .../sites/1` and never failed — no code bug found
there. The most plausible explanation for "the dropdown is not working"
is discoverability: `NetworkDevices.tsx` already has a one-click "🎭
Pick" button right in its grid, but `Sites.tsx` only had the picker
tucked into the panel above the grid — the odd one out.

1. **`backend/alembic/versions/0036_site_theme_legacy_repair.py`** — a
   one-time, idempotent data repair (not a schema change): any row with
   `site_code_type = 'theme'` and `theme_name IS NULL` gets `theme_name`
   backfilled from its current `simple_name`; every `site_code_type =
   'theme'` row is then normalized to `'custom'` (matching what
   `SiteCodePanel.tsx` already treats it as). `simple_name` is never
   touched. Applied to the live dev container (`podman cp` + `alembic
   upgrade head`, since the container only fswatch-syncs `app/`).
2. **`frontend/src/lib/columns.tsx`** — new `combineWithTheme(row,
   codeField)` + `withThemeDisplay(col, field)`: unlike `lookupLabel`
   (fixed fallback chain, for FK reference rows), these take an explicit
   field name so they work for *any* resource's own identity column, and
   `withThemeDisplay` only adds a `valueFormatter`/`filterValueGetter` —
   it never touches `editable`/`cellClass`, so a manually-typed field
   (`Datacenter.code`) stays editable and a naming-engine field
   (`Site.simple_name`) stays read-only, exactly as before.
3. Applied `withThemeDisplay` to the primary identity column on every
   resource that has a `theme_name`: `Sites.tsx`'s "Site Code"
   (`simple_name`), `NetworkDevices.tsx`'s "VF Short Name"
   (`vf_friendly_name`), `Hierarchy.tsx`'s Datacenter "Code". Floor/Room/
   Section were already combining theme + code in `BlueprintList`'s own
   render (`"{theme_name} — {name} ({code})"`, added round 3) — no change
   needed there. Region has no `theme_name` column at all — out of scope.
4. **`Sites.tsx`**: added a grid-level "🎭 Pick" button column (mirrors
   `NetworkDevices.tsx`'s `applyTheme` mutation exactly — `api.update`
   with `{theme_name, theme_category}`), so this page has the same
   one-click, in-grid entry point every other themed resource has.
   `SiteCodePanel.tsx`'s own "Pick a name…"/"Change…"/"Clear" flow is
   unchanged and still the more full-featured place to manage it.

Verified: frontend 386 Vitest passed across 56 files (+8 new
`columns.test.tsx` cases for `combineWithTheme`/`withThemeDisplay`, +3 new
`Sites.test.tsx` cases — new file — for the combined display + the 🎭
Pick button), `tsc -b` clean, `vite build` clean. Backend 387 passed / 1
skipped (unchanged from round 4 — no backend logic touched, only a data
migration). Live-verified against the running dev backend: `GET
/api/v1/sites/1` before the migration showed `site_code_type: "theme"`,
`theme_name: null`; after `alembic upgrade head` it shows `site_code_type:
"custom"`, `theme_name: "Alderaan"`; `simple_name` was then set to
`"vfsite1"` via `curl -X PATCH` to reproduce the user's own example, so
the grid now genuinely renders "Alderaan-vfsite1" for that row instead of
"Alderaan" alone.

---

## 🆕 (2026-09-04): FEAT-6 spec + Kiro memory infrastructure

**Local working copy** moved to `/Volumes/development/vf-cmdb` (macOS). The old
`/home/ubuntu/vf_cmdb` path and ports 3001/5433 in these docs are stale — the
authoritative ports are frontend **8080**, backend **8000**, postgres **5432**,
pgAdmin **5050** (see `.kiro/steering/tech.md`).

**FEAT-6 spec authored** at `.kiro/specs/rack-back-and-cabling/`
(requirements.md, design.md, tasks.md — all format-validated). Covers Sprint
6A dual-face rack view, 6B Visio Café stencils (cache-first + manual upload,
air-gap safe), 6C port-to-port cabling (polymorphic port ownership migration
0006, connect panel, auto cable label, cables viewer). Design closes two review
gaps: (A) device→rack membership = device `rack_id` else `RackUnit`
(`device_table`,`device_id`); (B) rack→datacenter via
`datacenter_floor_id`→dc else `room_id`→floor→dc, with same-site / same-rack
fallback so placed racks never spuriously 404.

**Kiro memory system installed** under `.kiro/`:
- steering/ — product.md, tech.md, structure.md, memory-protocol.md (all
  `inclusion: always`) so prose memory + the cbindex workflow load every session.
- hooks/ — refresh-codebase-index (PostFileSave), update-session-state
  (PostTaskExec), session-start-memory (SessionStart).
- skills/ — add-entity, local-test-loop.
- Codebase index built on this machine: 144 files → 605 chunks.

### FEAT-6 Phase 1 — schema foundation ✅ (code complete, awaiting live DB verify)

Task 1 of `.kiro/specs/rack-back-and-cabling/tasks.md` implemented:
- `backend/app/models.py`: `stencil_url` (String(500)) added to `NetworkDeviceType`,
  `ComputeDeviceType`, `StorageDeviceType`; `Cable.label` (String(200)) added
  (a/b shape preserved); `DeviceInterface.network_device_id` relaxed to nullable
  and `owner_device_type`/`owner_device_id` polymorphic pair added.
- `backend/alembic/versions/0006_ports_and_stencils.py`: new head, chains onto
  `0005_site_redesign`. Additive columns + backfill (`owner_device_type=
  'network-devices'`, `owner_device_id=network_device_id`) + guarded idempotent
  style copied from 0005. Safe downgrade (restores NOT NULL only if no NULLs).

**Verified against LIVE PostgreSQL 16** (Podman now installed: `/opt/homebrew/bin/podman`
6.1.1; machine `podman-machine-default` running). Ran a throwaway `postgres:16`
container on host port 55432, pointed Alembic at it via POSTGRES_* env vars:
- Full chain `0001 → 0006` applied cleanly (incl. 0006).
- Resulting schema confirmed: `device_interfaces.network_device_id` nullable
  (FK preserved) + `owner_device_type varchar(40)` + `owner_device_id integer`;
  `cables.label varchar(200)`; `stencil_url` on all three device-type tables.
- Backfill verified: a seeded legacy row (`network_device_id=5`, NULL owner)
  became `owner_device_type='network-devices'`, `owner_device_id=5`.
- Round-trip `upgrade → downgrade → upgrade` clean; safe downgrade restored
  `network_device_id` to NOT NULL (no NULLs present); second upgrade is a no-op
  (idempotent). Test container removed afterwards.
- SQLAlchemy mappers also configure cleanly (backend `.venv`, gitignored).

**How to reproduce the live check** (Podman CLI is at /opt/homebrew/bin, not on
non-login shells' PATH):
```
export PATH=/opt/homebrew/bin:$PATH
podman machine start                       # if not already running
podman run -d --name pg -e POSTGRES_USER=vfcmdb -e POSTGRES_PASSWORD=vfcmdb \
  -e POSTGRES_DB=vfcmdb -p 55432:5432 docker.io/library/postgres:16
cd backend && POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_USER=vfcmdb \
  POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb .venv/bin/alembic upgrade head
```

### FEAT-6 COMPLETE — running locally for browser testing (2026-09-04)

All 12 implementation tasks done and verified. Backend + frontend are RUNNING:
- **Frontend (test this): http://localhost:5173** (Vite dev server, proxies /api).
- Backend: uvicorn on 127.0.0.1:8000 against a Podman `postgres:16` container
  (`vf_cmdb_dev`, host port 55432), migrated to 0006 and seeded with the real
  Virtualfactor dataset (1 site, 1 rack, 5 network devices with 28 interfaces,
  43 VLANs, 46 IPv4 subnets).

What to try in the browser:
- **Rack View** → Front/Back toggle. Back face shows port connector dots
  (blue=copper, orange=fiber, yellow=power); hover a dot for its label; click a
  dot to open the Connect panel and cable it to another port. Device 3 (a switch
  in rack AA01) has all 28 interfaces.
- **Cables** page → the auto-generated cable label + From/To columns, filter by
  rack or device. Cables you create from the Connect panel appear here.
- **Naming Conventions** → Network/Compute/Storage Device Types now have a
  "Stencils" panel (paste a URL or upload an SVG) + a Stencil URL column.

Backend files added/changed: naming.py (generate_cable + GENERATORS), crud.py
(cable validation + MODEL_COMPUTED_FIELDS), stencils.py (new), ports.py (new),
routers/special.py (/stencils, /ports/candidates), models.py + migration 0006.
Frontend: api.ts, RackDiagramSVG.tsx, RackView.tsx, ConnectPanel.tsx (new),
StencilField.tsx (new), Naming.tsx, CablesViewer.tsx (new), App.tsx.
`npm run build` (tsc -b && vite build) passes clean.

Restart the stack later with the reproduce block below (or `./deploy-podman.sh up`
for the full container stack). To run the servers manually:
- backend: `cd backend && POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_USER=vfcmdb POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb .venv/bin/uvicorn app.main:app --port 8000`
- frontend: `cd frontend && npm run dev` (serves 5173, proxies /api → 8000)

**Tests added + passing**: 15 backend pytest (backend/tests/, run with
`POSTGRES_DB=vfcmdb_test`) + 8 frontend Vitest (`npm test`, env=happy-dom).
`npm run build` clean; backend imports clean.

**Committed**: `df712cd` on `master` (working tree clean, not pushed).

**Next**: user browser testing at http://localhost:5173. Optionally push the
branch / open a PR.

## 🆕 FEAT-7 (2026-09-04): Device Detail Dashboard

New route **`/devices/:type/:id`** (`physical_servers`, `virtual_machines`,
`workstations`, `network_devices`) rendered by
`frontend/src/pages/DeviceDashboard.tsx`. The primary name column of all four
device listing grids is now a link into it.

**Tabs** — Overview · Interfaces · IP Assignments · VMs & Containers (hosts
only) · Cables · Changelog · Ansible Facts. The tab strip is built from the
`relations` array returned by the backend, so a device only ever sees tabs that
can apply to it, and the active tab lives in `?tab=` so it can be bookmarked.

**Overview** is a *form*, not a grid: `lib/deviceSchema.ts` maps every column of
each of the four models into labelled sections (Identity, Placement,
Classification, …) and `components/DeviceOverviewForm.tsx` edits them inline,
one field per PATCH, through the normal CRUD route so naming and audit logging
stay untouched. Generated names sit in a dark hero block at the top and the
site → datacenter → room → rack → U position is in the page header.

**Backend** — `backend/app/devices.py` (device-type resolver + relation loaders)
and two endpoints in `routers/special.py`:
- `GET /api/v1/devices/{type}/{id}` → record, display name, position/site
  context, the tab list and the API resource behind each tab
- `GET /api/v1/devices/{type}/{id}/related/{relation}` → rows filtered by
  device, plus `owned` / `fk_field` so the UI knows whether add + delete are
  legal on that tab

Both accept either the underscored route key or the existing kebab-case API
slug. Reads are the only new server code — every write still goes through the
generic CRUD routes.

**Things worth remembering**
- `Cable` and `ChangeLog` models already exist, so those two tabs are real
  grids, not placeholders.
- **No device table has a `tia606b_name` column** (only `sites` does), so the
  Overview hero explains where TIA-606-B labels live instead of showing an
  empty field.
- `device_interfaces.network_device_id` is NOT NULL, so only network devices
  *own* ports. On servers/VMs/workstations the Interfaces tab shows the reverse
  `connected_device_type` / `connected_device_id` match and is read-only.
- The polymorphic discriminators (`assigned_to_type`, `port_a_type`,
  `port_b_type`, `connected_device_type`) currently hold no data, so IP
  Assignments / Cables read empty until records are created. Adding a row from
  a tab pre-fills the discriminator correctly (verified round-trip).
- There is no raw Ansible facts blob column — the Facts tab shows the existing
  `POST /api/v1/devices/{slug}/{id}/facts` contract and the current values of
  the fact-backed columns.

**Verified**: `tsc -b` clean · `vite build` clean · backend endpoints curl-tested
against live PostgreSQL (both slug spellings, 404 paths, every relation) · all
seven tabs opened in the browser · IP-assignment add + delete round-trip.

---

## 🆕 Phase 2 QA Session (2026-09-04): Full-Stack Testing + Bug Fixes

### Test Environment (SuperComputer VM)
- PostgreSQL 16 running on port 5432 (DB: `cmdb`, user: `cmdb`)
- Backend: uvicorn on port 8000 (`--reload`)
- Frontend: built dist served by nginx on port 3000 (SPA + API proxy)
- Public URL tested: `https://33e3a5dc9.na113.preview.abacusai.app`

### QA Results Summary: 7 PASS / 1 PARTIAL / 1 FAIL → **All Fixed**
| Test Case | Result |
|-----------|--------|
| TC-01 Dashboard & App Load | ✅ PASS |
| TC-02 Sites, Hierarchy, SVG Rack View | ✅ PASS |
| TC-03 Network Devices & Naming | ✅ PASS |
| TC-04 Racks, Servers, Compute Pages | ✅ PASS |
| TC-05 IPAM Core (VLANs, Subnets, Utilization) | ✅ PASS |
| TC-06 IPAM Reservation CRUD & Next-IP | ⚠️ PARTIAL → **Fixed (BUG-01)** |
| TC-07 API Guard Rails (VLAN/CIDR/IP dup guards) | ✅ PASS |
| TC-08 Reference Data & `/meta/entities` | ❌ FAIL → **Fixed (BUG-02)** |
| TC-09 Navigation Resilience (21 SPA routes) | ✅ PASS |

### Bugs Found & Fixed (commit `46b3164`)
- **BUG-01** (Medium, Frontend): Reservation form pre-filled hardcoded `192.168.1.254` — fixed to call `/api/v1/ipam/subnets/{id}/next-reserved` dynamically
- **BUG-02** (Medium, Backend): `/api/v1/meta/entities` shadowed by catch-all `/{resource}/{item_id}` route → 422 — fixed by reordering router registration in `main.py`
- **BUG-03** (Low, Seed): Changelog showed `simple_name: "Korriban → None"` spurious entry — fixed in `seed.py`, stale DB row purged

### Validated API Endpoints (all ✅)
- `GET /api/v1/sites` → 2 sites (Korriban + test artifact)
- `GET /api/v1/vlans` → 43 VLANs
- `GET /api/v1/subnets-ipv4` → 46 subnets
- `GET /api/v1/ipam/subnets/3/next-ip` → `10.100.107.2`
- `GET /api/v1/ipam/subnets/3/next-reserved` → `10.100.107.253`
- `GET /api/v1/ipam/subnets/3/utilization` → 254 total / 3 used / 1.2%
- `GET /api/v1/meta/entities` → 3 entity types (was 422, now ✅)
- `GET /api/v1/ansible/inventory` → 12 groups ✅
- VLAN dup 409 ✅ | CIDR overlap 409 ✅ | IP dup 409 ✅ | out-of-range 422 ✅

### Current HEAD
`46b3164` — `fix: BUG-01 IPAM form IP prefill, BUG-02 meta/entities route shadowing, BUG-03 seed changelog artifact`

---

## 🆕 Phase 2 (2026-09-03): Rack View SVG upgrade + IPAM by Site

Branch `feature/phase-2-rack-ipam`. Full detail in `docs/PHASE_2_COMPLETION.md`.

**Stream A — Rack View SVG**
- New `frontend/src/components/RackDiagramSVG.tsx` — scalable SVG elevation
  (U-numbered from bottom, rails, device rects scaled by units×19px, type
  colours via shared `TYPE_HEX`, empty slots grey).
- `frontend/src/pages/RackView.tsx` rewritten — cascading Site→Datacenter→
  Floor→Rack filter, responsive multi-rack grid, type legend.

**Stream B — IPAM by Site + reserved pool**
- Migration `0004_ipam_by_site.py` (guarded/idempotent): `vlans.site_id` NOT
  NULL + composite `UNIQUE(site_id, vlan_id)` (kept global `UNIQUE(vlan_id)`);
  `site_id`/`reserved_count`/`reservation_anchor` on both subnet tables;
  `label`/`is_locked` on `subnet_role_assignments`; backfills.
- `models.py` updated to match.
- `crud.py`: 409 duplicate global VLAN (Q1); 409 overlapping/duplicate CIDR
  (Q2); auto-create locked `Gateway` reservation on subnet create (Q6). Wired
  into create/update.
- `special.py`: GET/POST/DELETE `/ipam/subnets/{id}/reservations` (family-aware,
  ceiling-enforced, locked-protected) + `next-reserved` (anchor + gap-aware);
  `utilization` reports reserved counts + anchor.
- `seed.py`: VLANs/subnets attached to Home site; reserved pool + locked
  gateway seeded.
- `frontend/src/pages/IPAM.tsx` (route `/ipam`, nav "IPAM by Site"): site
  selector, Segments tab (IPv4 primary + collapsible IPv6) with per-segment
  reservation manager + "Suggest next", VLANs tab with quick-add. `api.ts`
  extended with reservation helpers.

**Validated**: `npm run build` zero TS errors; `from app.main import app` OK
(all IPAM routes register); seed syntax OK. Live DB apply not run here (no
local Postgres; INET/CIDR types are Postgres-specific).

---
## (Prior session snapshot below)

---

## 📌 Current State Snapshot

### Repository Status
- **Location**: `/Volumes/development/vf-cmdb/`
- **Remote**: `https://github.com/jallamasc/vf-cmdb`
- **Branch**: `master`
- **Last Push**: 2026-09-03 (commit `36c7f5f`)
- **Local HEAD**: `36c7f5f` - docs: add memory preservation system
- **Uncommitted Changes**: None (git clean)

### Deployment Status
- **Current Environment**: Development VM (Abacus AI Agent computer)
- **Target Environment**: Proxmox Ubuntu VM (to be created by user)
- **Deployment Method**: Podman + Quadlet (systemd)
- **Services Running Locally**: ❌ Not started (awaiting deployment)

### Quick Stats
- **Total Database Tables**: 38 (17 lookups, 1 reference, 20 entities)
- **Lines of Code (Python)**: ~2,500
- **Lines of Code (TypeScript/React)**: ~3,800
- **Docker → Podman Migration**: ✅ Complete (commit 212988c)
- **Data Seeded**: ✅ All 6 Excel files imported with corrections

---

## 🆕 This Session (2026-09-03/04): Codebase Indexing & WLAN Addressing

### Codebase Indexing & Vector Search

Added the **third pillar** of the memory system — a self-hosted semantic search
over the codebase — so agents recall code on demand and never rely on stale
context.

**What was built** (`tools/codebase_index/` + `./cbindex` wrapper):
- `indexer.py` — CLI: `build` (incremental), `build --full`, `search`, `stats`,
  `backends`. ChromaDB vector store + local `all-MiniLM-L6-v2` embeddings
  (offline, no API key); optional OpenAI backend.
- `mcp_server.py` — MCP server exposing `search_codebase`, `index_stats`,
  `rebuild_index` to MCP-native clients (works with mcp v1 `FastMCP` and v2
  `MCPServer`).
- `requirements.txt`, `README.md`, root `cbindex` wrapper (`setup/build/search/
  stats/backends/mcp`).
- `AGENT_ONBOARDING.md` — **the new "read me first" file** with bootstrap
  commands + a paste-ready bootstrap prompt for provisioning a fresh session.
- `.gitignore` updated: `.codebase_index/` (vector store) and tool `.venv/` are
  generated/ignored — never commit embeddings.

**Validated** (in the dev environment):
- Index built: 122 files → 421 chunks in ~15s.
- Semantic search returns correct files/line-ranges (naming engine, next-free-IP,
  quadlet units, changelog logic) with relevance scores.
- Incremental build verified: adding a file re-embeds only it; deleting purges
  its chunks (anti-rotten-memory guarantee holds).
- MCP tool functions verified against the same index.

**Note**: The vector store must be **rebuilt per machine** (`./cbindex build`) —
it is intentionally not committed. On the air-gapped Proxmox VM, cache the
embedding model during setup while internet is available.

### ✅ WLAN Addressing Decision (RESOLVED)

**User Decision** (2026-09-04): Start WLAN ranges at **192.168.100.0/24** and continue sequentially.

**Implementation**:
- WLAN / 1: `192.168.100.0/24`, expansion to `192.168.103.254` (4 × /24)
- WLAN / 2: `192.168.104.0/24`, expansion to `192.168.107.254` (4 × /24)
- WLAN / 3: `192.168.108.0/24`, expansion to `192.168.111.254` (4 × /24)
- WLAN / Reserved: `192.168.112.0/24`, expansion to `192.168.115.254` (4 × /24)

**Files Updated**:
- `backend/app/seed_subnets.json` — all WLAN IPv4 subnets and role assignments updated

**Old (INVALID) ranges** (replaced):
- ~~192.168.40-43~~ → 192.168.100-103
- ~~192.168.44-47~~ → 192.168.104-107
- ~~192.168.48-51~~ → 192.168.108-111
- ~~192.168.52-55~~ → 192.168.112-115

**Status**: ✅ Complete. Ready for fresh database seeding or migration.

---

## 🔄 Recent Changes (Last 3 Commits)

### Commit `212988c` - 2026-09-03
**Message**: `refactor: migrate container stack from Docker to Podman`

**Major Changes**:
- Renamed `Dockerfile` → `Containerfile` (backend & frontend)
- Replaced `docker-compose.yml` → `podman-compose.yml`
- Added 7 Quadlet systemd units in `deploy/quadlet/`
- Created `deploy-podman.sh` helper script
- Updated all documentation (README, QUICK_START, VSCODE_REMOTE_SETUP, PROJECT_CONTEXT)
- SELinux `:Z` volume flags for rootless compatibility
- Network alias `backend` for nginx proxy resolution

**Reason**: User requirement for Podman over Docker

### Commit `718430b` - 2026-09-02
**Message**: `docs: add comprehensive project context document for AI conversation continuity`

**Added**: `PROJECT_CONTEXT.md` (600+ lines)
- Complete architecture documentation
- Data model specifications
- API endpoint reference
- Frontend component hierarchy
- Deployment workflows

### Commit `2275915` - 2026-09-02
**Message**: `docs: add comprehensive quick start guide`

**Added**: `QUICK_START.md`
- Step-by-step deployment instructions
- Environment configuration guide
- Troubleshooting section

---

## ⚠️ Active Issues & Blockers

### 🔴 Phase 3 Bugs (Must Fix Before Deploying)

| ID | Severity | Component | Description |
|----|----------|-----------|-------------|
| BUG-A | Medium | Frontend/Backend | VLANs page add-row errors — `Vlan.site_id NOT NULL` but no site_id FK column in Vlans EntityGrid |
| BUG-B | Medium | Frontend | IPAM shows no subnets — filter by site_id excludes NULL-site subnets; may default to wrong site (test artifact id=2) |
| BUG-C | High | Frontend/Backend | "Add row" errors on most views — many models have NOT NULL FK fields not exposed as editable columns in the grid |
| BUG-D | Low | Frontend | IPAM subnet columns incomplete — missing `range_from`, `range_to`, `expansion_ceiling`, `reserved_count`, `reservation_anchor` |

**Full details and fixes**: `docs/PHASE_3_PLAN.md` → Bug section (BUG-A through BUG-D)

### 🟡 Phase 3 Features (User-Requested after QA)
Full detail in `docs/PHASE_3_PLAN.md`. Summary:
- **Sites**: Auto-conform simple_name from hierarchy; separate regions from buildings/floors; themed fun names (Star Wars etc.); VF Short Name is too short
- **Sites**: Add Colombian + international regions (seed change)  
- **All grids**: No cell content truncation; dropdown arrows on FK/select cells; name fields in all listings
- **Physical Hierarchy**: Real-time name preview while creating; datacenter = airport code of city
- **Rack View**: Dual-face (front + back); Visio Café stencils; port-to-port cable connections with labeled from/to
- **Device Dashboard**: Click device name → comprehensive tabbed detail page (specs, interfaces, IPs, VMs, cables, changelog, Ansible facts)

---

## 🎯 Immediate Next Steps

### For Agent (START of next session — do this first):
1. Read `docs/PHASE_3_PLAN.md` — full bug list and Phase 3 feature specs
2. Fix BUG-C first (most impactful): audit all models for NOT NULL FKs without grid columns
3. Fix BUG-A (VLANs EntityGrid missing site_id column)
4. Fix BUG-B (IPAM site filter excludes NULL-site subnets; also delete test site id=2)
5. Fix BUG-D (subnet columns incomplete)
6. Then proceed with Sprint 3A UX improvements (per `docs/PHASE_3_PLAN.md`)

### For User:
1. ⏳ **PENDING**: Proxmox VM deployment (after Phase 3 bugs fixed)
2. ✅ **DONE**: QA testing session completed
3. ✅ **DONE**: Phase 3 requirements documented

---

## 📊 Entity Status Overview

### Physical Infrastructure
- ✅ Sites (1 site: "Home")
- ✅ Site Addresses (NEW - separated from sites)
- ✅ Racks (seeded from Excel)
- ✅ Rack Units (device mounting)
- ✅ Power Devices (UPS, PDU)
- ✅ Patch Panels

### Compute Layer
- ✅ Physical Servers (seeded from VF_Prod.xlsx)
- ✅ Virtual Machines (seeded from VF_VMs.xlsx)
- ✅ Containers/Apps
- ✅ Workstations (seeded from VF_WorkStations.xlsx)

### Network Layer
- ✅ Network Devices (seeded from VF_Ntwk.xlsx)
- ✅ Device Interfaces (port configs)
- ✅ VLANs (with zone classification)
- ✅ Cables

### IPAM
- ✅ Subnets IPv4 (WLAN ranges corrected to 192.168.100-115.x)
- ✅ Subnets IPv6
- ✅ IP Assignments

### Auditing & Integration
- ✅ Changelog (automatic via SQLAlchemy events)
- ✅ Ansible Dynamic Inventory (tested, working)

---

## 🔧 Technical Debt & Future Enhancements

### Technical Debt (None Critical)
- None identified currently

### Future Enhancements (User may request)
1. **Bitwarden CLI Integration**: Auto-fetch credentials using `bw` CLI
2. **Multi-site Expansion**: Add more sites beyond "Home"
3. **Custom Reports**: PDF/Excel export of inventory
4. **REST API Authentication**: JWT tokens, API keys
5. **Role-Based Access Control**: Read-only vs. admin users
6. **Network Topology Diagram**: Visual map of connections
7. **Alert System**: Email/Slack notifications for changes
8. **Backup Automation**: Scheduled database backups
9. **Import/Export**: Bulk CSV/Excel import/export

---

## 🧪 Testing Status

### Manual Testing ✅
- Backend API endpoints (CRUD operations)
- Frontend rendering and navigation
- Foreign key relationships
- Naming convention engine
- IPAM utilization calculations
- Ansible inventory endpoint
- Changelog tracking

### Automated Testing ❌
- Unit tests: Not implemented
- Integration tests: Not implemented
- E2E tests: Not implemented

**Note**: User preference has been manual testing to date.

---

## 🗂️ Files Modified This Session

### Session: 2026-09-03 (Current)

**Files Read**:
- `/home/ubuntu/vf_cmdb/` (full project review)
- System-generated file summaries (latest codebase state)

**Files Created**:
- `/home/ubuntu/vf_cmdb/MEMORY_BANK.md` (this session)
- `/home/ubuntu/vf_cmdb/SESSION_STATE.md` (this file)

**Files Modified**:
- None yet (git push only)

**Git Operations**:
- ✅ Configured git remote with authentication
- ✅ Pushed all 5 commits to `https://github.com/jallamasc/vf-cmdb`
- ✅ Cleaned authentication token from remote URL
- ✅ Repository now public and accessible

---

## 💬 Recent User Communications

### User Question (2026-09-03):
> "For network distribution is it ok to use on wireless networks 192.169.0.X/24 or should I use something different that comes after 192.168.12.XX/24 (the last LAN segment)"

**Agent Response Summary**:
- Confirmed 192.169.0.0/24 is INVALID (public IP space, not RFC 1918)
- Explained valid private ranges (10.x, 172.16-31.x, 192.168.x)
- Recommended options:
  - 192.168.13.0/24 (next sequential)
  - 192.168.20.0/24 (reserved for wireless)
  - User choice

**Status**: ✅ RESOLVED

### User Decision (2026-09-04):
> "We will start WLAN ranges on 192.168.100.X/24 and continue from there"

**Implementation**: Applied to `backend/app/seed_subnets.json` (4 WLAN subnets: 100-103, 104-107, 108-111, 112-115)

### User Request (Previous):
> "Please proceed to push the repo"

**Status**: ✅ Complete - all 5 commits pushed to GitHub

---

## 🔐 Environment Variables Checklist

### Critical Settings (in `.env` file)
- ✅ `POSTGRES_PASSWORD` - ⚠️ User must change from default
- ✅ `PGADMIN_DEFAULT_EMAIL` - User email for pgAdmin
- ✅ `PGADMIN_DEFAULT_PASSWORD` - ⚠️ User must set
- ✅ `CORS_ORIGINS` - Set to `*` for dev, specific URL for prod
- ✅ Port mappings (FRONTEND_PORT, BACKEND_PORT, DB_PORT, PGADMIN_PORT)

### Optional Settings
- `CMDB_API_URL` - For Ansible inventory (defaults to localhost:8000)
- `CMDB_TIMEOUT` - API timeout in seconds (default: 10)

---

## 📈 Progress Tracking

### Phase 1: Requirements & Design ✅
- [x] Analyze Excel files
- [x] Define data model
- [x] Choose technology stack
- [x] Design API structure

### Phase 2: Backend Development ✅
- [x] FastAPI setup
- [x] SQLAlchemy models (38 tables)
- [x] Alembic migrations
- [x] Seed data from Excel
- [x] Naming convention engine
- [x] Audit changelog
- [x] IPAM endpoints
- [x] Ansible integration

### Phase 3: Frontend Development ✅
- [x] React + TypeScript + Vite setup
- [x] Layout and navigation
- [x] EntityGrid component
- [x] All entity management pages (15+)
- [x] Custom column system (ColumnManager)
- [x] Reference data management
- [x] IPAM visualization
- [x] Rack view diagrams
- [x] Changelog viewer
- [x] Ansible inventory viewer

### Phase 4: Containerization ✅
- [x] ~~Docker setup~~ (replaced)
- [x] Podman migration
- [x] podman-compose.yml
- [x] Quadlet systemd units
- [x] Helper scripts

### Phase 5: Documentation ✅
- [x] README.md
- [x] QUICK_START.md
- [x] PROJECT_CONTEXT.md
- [x] VSCODE_REMOTE_SETUP.md
- [x] GITHUB_SETUP.md
- [x] MEMORY_BANK.md
- [x] SESSION_STATE.md (this file)
- [x] Ansible integration docs
- [x] Deployment manuals
- [x] Operations guides

### Phase 6: Deployment 🔄
- [ ] Create Proxmox VM
- [ ] Install Podman
- [ ] Clone repository
- [ ] Configure .env
- [ ] Start services
- [ ] Verify functionality
- [ ] Setup backups
- [ ] Configure monitoring

### Phase 7: Production Hardening ⏳
- [ ] Change default passwords
- [ ] Configure firewall rules
- [ ] Setup SSL/TLS (reverse proxy)
- [ ] Implement authentication
- [ ] Schedule automated backups
- [ ] Configure log rotation
- [ ] Performance tuning

---

## 🎓 Learning & Evolution Notes

### Design Patterns Established
1. **Generic CRUD via Registry**: All entities follow same API pattern
2. **Custom Fields JSONB**: Flexible schema without migrations
3. **Event-Driven Audit**: SQLAlchemy listeners capture all changes
4. **Foreign Key Display**: "Full Name - abbreviation" format
5. **Podman-First**: Rootless, daemonless, systemd-native

### Architectural Decisions Log

**2026-09-03**: Migrated Docker → Podman
- **Reason**: User preference, better security (rootless), systemd integration
- **Impact**: All container files renamed, new Quadlet units, docs updated
- **Trade-off**: Slightly less community documentation than Docker

**2026-09-02**: Separated Site Addresses into Reference Table
- **Reason**: Normalize data, enable address reuse, support custom dropdowns
- **Impact**: New `site_addresses` table, `sites.site_address_id` FK, migration 0002
- **Trade-off**: Additional join for address data

**2026-08-30** (estimated): Chose FastAPI over Flask/Django
- **Reason**: Async support, auto-docs, type hints, modern
- **Impact**: Better performance for IPAM calculations, cleaner code

**2026-08-30** (estimated): Chose AG Grid over Tanstack Table
- **Reason**: Excel-like editing UX requirement, built-in cell editors
- **Impact**: Richer UX, larger bundle size (acceptable trade-off)

### User Feedback Integration
- User prefers comprehensive documentation (always update)
- User wants Podman over Docker (migrated)
- User wants no credentials in database (Bitwarden refs only)
- User expects multi-site support (built in, even with only one site now)

---

## 🔮 Anticipated Questions / Scenarios

### "How do I add a new device type?"
→ See MEMORY_BANK.md section "Add New Entity Type"
→ Follow: Model → Registry → Migration → Seed → Frontend page

### "How do I backup the database?"
→ Use provided script: `/home/ubuntu/vf_cmdb/deploy/scripts/vf-cmdb-backup.sh`
→ Or manual: `podman exec vf-cmdb-db pg_dump -U cmdb cmdb > backup.sql`

### "Can I add custom fields without changing code?"
→ Yes! Use ColumnManager UI (⚙ Columns button) on any entity page
→ Stored in JSONB `custom_fields` column, persisted to localStorage

### "How do I integrate with Ansible Tower/AWX?"
→ Point inventory source to: `http://{cmdb-host}:8000/api/v1/ansible/inventory`
→ Or use `cmdb_inventory.py` script as custom inventory

### "Can I import more devices from Excel?"
→ Not directly via UI yet (future enhancement)
→ Currently: Edit `backend/app/seed.py` and run migrations, or use API

### "How do I change the naming convention?"
→ Edit via frontend: Naming page (collapsible categories)
→ Or edit `backend/app/seed.py` lookup tables
→ Naming engine auto-applies changes on next device create/update

---

## 🛠️ Quick Command Reference

### Git Operations
```bash
cd /Volumes/development/vf-cmdb
git status                          # Check for changes
git diff                            # See what changed
git log --oneline -5                # Last 5 commits
git add -A                          # Stage all changes
git commit -m "type: description"   # Commit with conventional message
git push                            # Push to GitHub
```

### Podman Operations (via helper script)
```bash
./deploy-podman.sh up               # Start all services
./deploy-podman.sh down             # Stop all services
./deploy-podman.sh restart          # Restart all services
./deploy-podman.sh build            # Rebuild containers
./deploy-podman.sh logs backend     # View backend logs
./deploy-podman.sh ps               # List running containers
./deploy-podman.sh quadlet          # Install systemd units
```

### Database Operations
```bash
# Access PostgreSQL
podman exec -it vf-cmdb-db psql -U cmdb cmdb

# Backup
podman exec vf-cmdb-db pg_dump -U cmdb cmdb > backup_$(date +%F).sql

# Restore
podman exec -i vf-cmdb-db psql -U cmdb cmdb < backup.sql

# Run migrations
cd backend && alembic upgrade head
```

### Frontend Development
```bash
cd frontend
npm run dev                         # Vite dev server (hot reload)
npm run build                       # Production build
npm run preview                     # Preview production build
```

### Backend Development
```bash
cd backend
source .venv/bin/activate           # Activate virtual environment
uvicorn app.main:app --reload       # Run with hot reload
alembic revision -m "description"   # Create migration
alembic upgrade head                # Apply migrations
```

---

## 📝 Update Protocol for This File

**When to Update SESSION_STATE.md**:
- ✅ After every git commit
- ✅ When user makes decisions (update Active Issues)
- ✅ When deployment status changes
- ✅ When new blockers emerge
- ✅ After completing major tasks (update Progress Tracking)
- ✅ When user asks questions (log in Recent User Communications)

**What to Update**:
- "Last Updated" timestamp
- "Recent Changes" section (keep last 3-5 commits)
- "Active Issues & Blockers" (add/remove/resolve)
- "Immediate Next Steps" (current priorities)
- "Files Modified This Session" (track changes)
- "Recent User Communications" (conversation log)
- "Progress Tracking" (check off completed tasks)

**Keep Concise**: This is a living, high-churn document. Archive old info to MEMORY_BANK.md if it becomes foundational context.

---

**✨ This document represents the CURRENT STATE of the project. Read this FIRST on every new session to understand where we are, what's changed, and what needs attention next.**
