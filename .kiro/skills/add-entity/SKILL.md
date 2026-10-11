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
   columns are expected. If the entity is a physical asset an operator would
   nickname, add the standard `theme_name` / `theme_category` nullable columns
   (String(120)/String(40)) so the frontend's `useThemePicker` 🎭 picker can be
   wired on — these stay independent of the auto-generated code (no
   `generate_*` function touches them).
2. **Registry** — register a kebab-case slug in `ENTITY_REGISTRY`
   (`backend/app/registry.py`). If it is a naming dictionary, add it to
   `LOOKUP_SLUGS`; if it is plain reference data, add to `REFERENCE_SLUGS`.
3. **Migration** — create the next Alembic file in
   `backend/alembic/versions/`. Discover the current head rather than assuming
   it — e.g. `ls backend/alembic/versions/ | sort | tail -1` (at time of writing
   `0037_physical_asset_theme_names`) — and chain `down_revision` to it. Make it
   idempotent/guarded (inspect for existing tables/columns) like the recent
   migrations.
4. **Seed** — if initial rows are needed, add them idempotently in
   `backend/app/seed.py`.
5. **Frontend** — create `frontend/src/pages/<Entity>.tsx` using `EntityGrid`
   over the new slug with `columns` from `lib/columns.tsx` helpers. Ensure every
   NOT NULL FK is an editable `fkCol` so "add row" cannot 422.
6. **Wire it** — add the route in `frontend/src/App.tsx` and a nav entry in
   `frontend/src/components/Layout.tsx`.
7. **Verify** — `cd frontend && npm run build`; confirm the backend imports
   (`from app.main import app`). Then run the tests single-run: backend
   `POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55432 POSTGRES_USER=vfcmdb POSTGRES_PASSWORD=vfcmdb POSTGRES_DB=vfcmdb_test .venv/bin/pytest -q`
   (from `backend/`, kill stray pytest first) and frontend
   `cd frontend && npx vitest run`. Then `./cbindex build`.

## Rules
- Keep writes on generic CRUD so changelog + naming apply automatically.
- kebab slugs (API), snake_case (DB), camelCase (frontend). No creds in DB.
