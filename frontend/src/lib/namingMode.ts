// Phase 5 Task 28 — mirrors backend/app/models.py's NAMING_MODE_VALUES.
// While a record's naming_mode is "manual", the naming engine leaves its
// computed field(s) alone on save; "auto" (the default) keeps recomputing
// them. Scoped to the 5 tables that actually have a naming.py generator —
// see models.py's comment for why datacenter_floors/rooms/sections don't
// get this column.
export const NAMING_MODE_VALUES = ["auto", "manual"] as const;

export type NamingMode = (typeof NAMING_MODE_VALUES)[number];
