# Virtualfactor IT CMDB — Backlog

The tracked home for pending work. `SESSION_STATE.md` records *where we are
now*; this file records *what is intentionally not done yet, and why*. Grouped
into Deferred, Won't-do, Known issues, Future enhancements, and
Shipped-but-was-untracked.

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

- **`theme_name` on `Region`.** Region has no `theme_name` column at all; it is
  not a themed asset in this model. (Noted so a future reader does not treat its
  absence as a bug.)

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

## Shipped but was untracked

- **`rack-back-and-cabling` (FEAT-6) SHIPPED.** All 12 implementation tasks are
  done and verified (dual-face rack view, Visio Café stencil library
  cache-first + manual upload, port-to-port cabling with polymorphic port
  ownership migration 0006, Connect panel, auto cable label, Cables viewer).
  Its `tasks.md` checkboxes are now flipped to `[x]` to reflect reality.
