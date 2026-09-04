---
inclusion: always
---

# Project Structure & Patterns

## Layout
    backend/
      app/
        main.py          FastAPI app; router registration order matters
                         (special.py BEFORE the generic catch-all)
        models.py        all SQLAlchemy ORM models (~38 tables)
        registry.py      ENTITY_REGISTRY slug->model; LOOKUP_SLUGS; REFERENCE_SLUGS
        crud.py          generic async CRUD + _log (changelog) + apply_naming hook
        naming.py        name-generation engine (GENERATORS dispatch)
        devices.py       device-type resolver + polymorphic relation loaders
        seed.py          idempotent seeder; seed_subnets.json for IPAM
        routers/         generic.py, special.py, ansible.py
      alembic/versions/  0001..0005 migrations (guarded, idempotent)
    frontend/
      src/
        api.ts           typed fetch client (/api/v1)
        App.tsx          routes; Layout.tsx = nav
        components/      EntityGrid, ColumnManager, RackDiagramSVG, DeviceOverviewForm, ...
        pages/           Dashboard, Sites, RackView, IPAM, Subnets, DeviceDashboard, ...
        lib/             columns.tsx, types.ts, deviceSchema.ts
    ansible/             cmdb_inventory.py dynamic inventory
    deploy/              quadlet units, scripts, ansible, cloud-init, ci-templates
    docs/                DEPLOYMENT_MANUAL, OPERATIONS, DISASTER_RECOVERY, PHASE_*_*
    tools/codebase_index/  semantic search indexer; ./cbindex wrapper at repo root
    .kiro/               specs, steering, hooks, skills

## Established patterns (follow these)
- Add a new entity: define model in models.py -> register kebab slug in
  registry.py -> Alembic migration -> seed.py (if data) -> frontend page +
  route in App.tsx + nav in Layout.tsx.
- Foreign keys: `{entity}_id`. Display FK dropdowns as
  "Full Name - abbreviation" via lookupLabel.
- Polymorphic references use a free-text discriminator + id pair
  (e.g. `port_a_type`/`port_a_id`, `assigned_to_type`/`assigned_to_id`,
  `owner_device_type`/`owner_device_id`). Slugs match ENTITY_REGISTRY keys.
- Custom fields: `custom_fields` JSONB + ColumnManager UI (no migration needed).
- Anything that must be audited or auto-named goes through generic CRUD.

## Doc / memory files (prose memory, in repo root)
- SESSION_STATE.md — current state, open items, next steps (updated every session)
- MEMORY_BANK.md — full rebuild spec + hard rules + "what NOT to change"
- AGENT_ONBOARDING.md — how to boot a session + the cbindex workflow
Note: legacy paths in those files (e.g. /home/ubuntu/vf_cmdb, ports 3001/5433)
are stale. The authoritative local path is /Volumes/development/vf-cmdb and the
authoritative ports/commands are in tech.md.
