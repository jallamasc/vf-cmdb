# Recovered schema line: migrations 0038–0043 (uncommitted work)

**Status:** Archived for possible later reconstruction. NOT in the repo's
migration chain. The current committed Alembic head is `0037_physical_asset_theme_names`.

**Discovered:** 2026-10-11, during a session that brought the local dev stack
back up. The local dev Postgres container `vf_cmdb_dev` was found at Alembic
revision **`0043_network_device_port_tiers`** — six revisions ahead of the
newest migration that exists anywhere in this repository (`0037`). No migration
files `0038`–`0043`, and no application code (models / routers / frontend) for
the schema they produced, were ever committed to any branch. That work exists
**only** as the schema of that one database.

To avoid losing it, the schema was dumped and preserved here before a fresh
`0037`-matching test database was stood up on a separate volume. The original
`0043` database/volume was **not** modified, reset, or deleted.

## Artifacts

- `docs/recovery/schema_0043_network_device_port_tiers.sql` — `pg_dump --schema-only`
  of the `0043` database (committed; contains DDL only, no row data, no secrets).
- `.local-backups/vf_cmdb_dev_0043_full_*.sql` — full `pg_dump` incl. data
  (**local only, gitignored** — may contain seeded/experimental rows; not committed).
- `.local-backups/vf_cmdb_dev_0043_schema_*.sql` — the original local copy of the
  schema dump (same content as the committed one).

## What the `0038–0043` line changed vs. `0037`

Derived from a column/table-level diff of the `0043` schema against a freshly
migrated `0037` schema.

### Structural renames / splits
- **`floor_sections` table → split into `naming_floors` + `naming_sections`.**
  The combined floor/section naming-lookup table became two separate lookup
  tables with the same column shape (`id, full_name, abbreviation,
  case_enforcement, max_length, trim_mode, icon, description, created_at,
  updated_at`).
- **`sites.floor_section_id` → replaced by `sites.floor_id` + `sites.section_id`.**
  The single combined FK became two distinct FKs. (This is the exact mismatch
  that made `0037` application code fail against the `0043` database:
  `column sites.floor_section_id does not exist`.)
- **`network_device_types` port columns restructured ("port tiers", migration
  `0043`):** `port_count` + `port_speed_gbps` → `majority_port_count`,
  `majority_port_speed_gbps`, `minority_port_count`, `minority_port_speed_gbps`,
  `power_source_count`.

### New columns on existing tables
- **`regions`:** `+ airport_code`, `+ city`, `+ theme_name`, `+ theme_category`.
  (Geo fields + fantastic-name support. NOTE: this means the `0038–0043` line
  *did* give Region a `theme_name`, which the current `0037` baseline does not
  have — see the "Region has no theme_name (out of scope)" item in the backlog
  spec `.kiro/specs/backlog/tasks.md`.)
- **`brands.logo_url`**, **`clouds.logo_url`** — logo/branding support.
- **`buildings`:** `+ campus_id`, `+ naming_mode`.
- **`campuses`:** `+ organization_id`, `+ region_id`, `+ naming_mode`.
- **`patch_panel_ports.naming_mode`**, **`power_outlets.naming_mode`** —
  naming-mode toggles extended to these tables.

## How to reconstruct it later (if wanted)

The schema alone is not a working feature — the matching ORM models
(`backend/app/models.py`), the naming engine (`backend/app/naming.py`), the
registry slugs (`backend/app/registry.py`), the API behavior, and the frontend
pages/columns for these changes were never committed and would have to be
rebuilt. Reconstruction order:

1. Author guarded/idempotent Alembic migrations `0038`–`0043` chaining onto
   `0037`, reproducing the DDL in `schema_0043_network_device_port_tiers.sql`.
   (The real `0043` was named `0043_network_device_port_tiers`; the names of
   `0038`–`0042` are unknown and must be chosen.)
2. Update `models.py` / `registry.py` / `naming.py` to match (floor/section
   split, region geo+theme, port tiers, logos, naming modes).
3. Rebuild the frontend pages/columns for each.
4. Verify with `pytest` (vfcmdb_test) + `npm run build` + `vitest run`.

Because step 1's DDL is fully captured but steps 2–4 require inferring the
original design intent, treat this as a scoped feature effort, not a mechanical
replay. Decide first whether the work is actually wanted (per the session where
this was found, the call was: archive + document now, keep `0037` as the
baseline, revisit only on request).
