# Backlog — Tasks

The tracked home for pending work (moved here from the former root
`BACKLOG.md` so Kiro picks it up through the spec system). `SESSION_STATE.md`
records *where we are now*; this file records *what is intentionally not done
yet, and why*. See `design.md` for the section conventions.

---

## Deferred (planned, not yet done)

- [ ] **Combine `theme_name` into the dashboard-link (`deviceLinkCol`) cells.**
      Round 6 applied `withThemeDisplay` to each resource's primary *plain-cell*
      identity column, but the device dashboard-link cells still show only the
      code. Fold the fantastic name into those link labels too — VM via
      `vf_short_name`; PhysicalServer / Workstation via `vf_long_name`. Lower
      priority than the picker itself (which shipped).
- [ ] **`PortConfigView.tsx` polymorphic port ownership.** The breadcrumb/SVG
      diagram page is still scoped to network-device-owned ports only. Ports
      owned by a physical server / workstation / generic entity
      (`owner_device_type` / `owner_device_id`) can be created and edited from
      the plain `PortConfig.tsx` grid (round-4 follow-up), but the graphical
      `PortConfigView` does not render them. Extending its view to other device
      classes is a separate, larger redesign.
- [ ] **Ansible / Semaphore ad-hoc + group playbook runs from inside vf-cmdb.**
      Today the web UI can only launch an existing Semaphore template against a
      Generic Entity that has the `ansible_managed` capability (via that
      record's Automation tab) and watch it run. Inventory preview, ad-hoc /
      group playbook runs, and automation on the 5 hardcoded device tables all
      happen outside vf-cmdb (Semaphore's own UI, or `ansible/cmdb_inventory.py`
      from the CLI). There is no code path for those inside the app.

## Won't-do (decided against, with the reason)

- **Theme name on `Cable`.** A cable's `label` is fully computed from the two
  connected (already-themed) devices' own names, so a cable is not a standalone
  asset with its own identity to nickname. Deliberately excluded from the
  fantastic-name treatment.
- **Fantastic names on the Reference section.** Naming Conventions, Reference
  Data, Entity Type Builder, Ansible Inventory, and Changelog manage
  lookup/taxonomy dictionaries and audit data (brands, rack types,
  field-visibility overrides, …). None of it is a per-record physical asset an
  operator would nickname, so it is out of scope for theme names.
- **`theme_name` on all 17 plain lookup dictionaries.** Their `full_name`
  already plays the human-readable role; a separate fantastic name would be
  redundant.

## Out of scope

- **`theme_name` on `Region`.** On the current `0037` baseline, Region has no
  `theme_name` column at all; it is not a themed asset in this model. (Noted so
  a future reader does not treat its absence as a bug.) NOTE: the archived,
  uncommitted `0038–0043` schema line *did* add `theme_name`/`theme_category`
  to `regions` — see "Archived" below; if that line is ever reconstructed, this
  item is superseded.

## Known issues

- **`AgGridPopupEditor.integration.test.tsx` intermittently flaky under
  full-suite load.** Pre-existing. It is the only test that mounts a real,
  unmocked AG Grid + real custom popup editor end-to-end, so it is worth
  keeping; it passes on repeated clean full-suite runs. Confirmed flakiness, not
  a regression (verified via `git stash` / re-run). Related footgun: multiple
  stray `pytest` processes left running against `vfcmdb_test` cause spurious
  Postgres `DeadlockDetectedError` failures — always kill strays before trusting
  a "flaky" backend failure.
- **~1.48 MB single-chunk frontend bundle warning.** `vite build` warns about a
  single large chunk; there is no `manualChunks` config and no raised
  `chunkSizeWarningLimit`. Acceptable for a single-user LAN app for now;
  revisit if load time becomes a problem.

## Future enhancements (wishlist)

1. Bitwarden CLI (`bw`) auto-fetch of credentials from stored `bitwarden_ref`
   references (never store the secret itself in the DB).
2. Multi-site expansion beyond the single "Home" site (the schema is already
   multi-site capable).
3. Custom reports — PDF / Excel export of inventory.
4. Role-Based Access Control (read-only vs. admin). Note the hard rule: no auth
   is added unless explicitly requested.
5. Network topology diagram — visual map of connections.
6. Alert system — email / Slack notifications on changes.
7. Backup automation — scheduled database backups.
8. Bulk CSV / Excel import.

## Archived (uncommitted work preserved, not in the repo's chain)

- **Stranded schema line `0038`–`0043` (uncommitted development).** The local
  dev database `vf_cmdb_dev` was found at Alembic head
  `0043_network_device_port_tiers` — six revisions ahead of the repo's newest
  migration (`0037`). No `0038`–`0043` migration files and no matching
  application code were ever committed; that work existed only as that one
  database's schema. The schema was dumped and preserved before a fresh
  `0037`-matching test DB was created on a separate volume; the `0043` volume
  was left untouched. See `docs/recovery/RECOVERED_0038_0043_SCHEMA.md` for the
  full change breakdown and `docs/recovery/schema_0043_network_device_port_tiers.sql`
  for the committed schema-only dump. Decision: archive + document now, keep
  `0037` as the baseline, reconstruct only on request. Highlights of what it
  added: `floor_sections` split into `naming_floors` + `naming_sections`;
  `sites.floor_section_id` → `floor_id` + `section_id`; Region got
  `theme_name`/`theme_category` + `airport_code`/`city`; network-device-type
  "port tiers"; `brands`/`clouds` logo URLs; naming-mode toggles on more tables.

## Shipped but was untracked

- **`rack-back-and-cabling` (FEAT-6) SHIPPED.** All implementation tasks are
  done and verified (dual-face rack view, Visio Café stencil library
  cache-first + manual upload, port-to-port cabling with polymorphic port
  ownership migration 0006, Connect panel, auto cable label, Cables viewer).
  Its `tasks.md` checkboxes are flipped to `[x]` to reflect reality.
- **`deploy-and-auto-update` SHIPPED.** ghcr.io pull-based Quadlet deploy,
  in-app running-version footer + silent update-available badge, backend
  version + one-click-update endpoints, host pull-not-build updater with a
  systemd `.path` trigger, CI build/release workflows, and the deploy/operations
  docs. See `.kiro/specs/deploy-and-auto-update/`. Alembic head unchanged at
  `0037` (no migration added).
