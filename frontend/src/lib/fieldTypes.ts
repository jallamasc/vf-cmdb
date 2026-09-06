// Phase 5 Task 14/15 — the fixed set of value representations a
// FieldTypeDef can be backed by (mirrors backend/app/models.py's
// STORAGE_KIND_VALUES). Reused by the Field Types admin grid (Task 15) and
// later by the Entity Type Builder / generic form-field renderer (Tasks
// 19-20) to pick the right editor for a given field.
export const STORAGE_KIND_VALUES = [
  "text",
  "number",
  "boolean",
  "date",
  "reference",
  "file",
] as const;

export type StorageKind = (typeof STORAGE_KIND_VALUES)[number];
