---
name: add-entity
description: Add a new CMDB entity end-to-end (model, registry slug, migration, seed, frontend page + route + nav) following the project's established generic-CRUD pattern.
---

# Add a New CMDB Entity

Use this when the task is to introduce a new manageable entity/table.

## Steps
1. **Model** — add the SQLAlchemy model to `backend/app/models.py`. Integer `id`
   PK. FK columns as `{entity}_id`. Use polymorphic `{x}_type`/`{x}_id` pairs
   for cross-entity references. Add `custom_fields` JSONB only if user-defined
   columns are expected.
2. **Registry** — register a kebab-case slug in `ENTITY_REGISTRY`
   (`backend/app/registry.py`). If it is a naming dictionary, add it to
   `LOOKUP_SLUGS`; if it is plain reference data, add to `REFERENCE_SLUGS`.
3. **Migration** — create the next Alembic file in
   `backend/alembic/versions/` (chain `down_revision` to the current head,
   currently `0005_site_redesign`). Make it idempotent/guarded (inspect for
   existing tables/columns) like `0005`.
4. **Seed** — if initial rows are needed, add them idempotently in
   `backend/app/seed.py`.
5. **Frontend** — create `frontend/src/pages/<Entity>.tsx` using `EntityGrid`
   over the new slug with `columns` from `lib/columns.tsx` helpers. Ensure every
   NOT NULL FK is an editable `fkCol` so "add row" cannot 422.
6. **Wire it** — add the route in `frontend/src/App.tsx` and a nav entry in
   `frontend/src/components/Layout.tsx`.
7. **Verify** — `cd frontend && npm run build`; confirm the backend imports
   (`from app.main import app`). Then `./cbindex build`.

## Rules
- Keep writes on generic CRUD so changelog + naming apply automatically.
- kebab slugs (API), snake_case (DB), camelCase (frontend). No creds in DB.
