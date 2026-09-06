import type { ColDef } from "ag-grid-community";
import { Row } from "../api";
import FuzzySelectEditor from "../components/FuzzySelectEditor";
import { DropdownCellRenderer, lookupLabel } from "./columns";
import type { StorageKind } from "./fieldTypes";

/**
 * Phase 5 Task 20 — build one AG Grid `ColDef` for a single Entity_Field_Def,
 * picking the column/editor from its Field_Type_Def's `storage_kind` (Req
 * 16.1: "columns and cell editors are derived entirely from that type's
 * Entity_Field_Defs").
 *
 * Unlike `customCol()` (which reads/writes `custom_fields` via its own
 * `valueGetter`/`valueSetter` because no column has a real `field`), this
 * uses AG Grid's native dot-path `field` support (`field: "attributes.<key>"`,
 * a documented AG Grid feature for nested object properties) so `EntityGrid`'s
 * existing `field.includes(".")` branch in `onCellValueChanged` — written for
 * exactly this shape but unused until now — persists the whole `attributes`
 * object after a cell edit, with no changes needed to `EntityGrid` itself.
 *
 * `required` fields get a trailing " *" on the header as a visual cue only:
 * there is no per-key NOT NULL constraint on `attributes` (Task 18's model
 * docstring explains why one isn't practical), and `EntityGrid`'s
 * `requiredFields` "block Add row" mechanism assumes flat top-level payload
 * keys, not `attributes.<key>` paths — wiring it in would make it impossible
 * to ever create a fresh row whenever any field is required, since a brand
 * new row cannot have its custom attributes filled in before it exists. Real
 * required-ness enforcement (or lack of it) is therefore a UI affordance
 * here, not an added Add-row guard.
 */
export function genericFieldCol(
  fieldDef: Row,
  storageKind: StorageKind | undefined,
  referenceOptions: Row[] = []
): ColDef {
  const key = String(fieldDef.key);
  const field = `attributes.${key}`;
  const headerName = `${fieldDef.label ?? key}${fieldDef.required ? " *" : ""}`;

  const base: ColDef = {
    field,
    headerName,
    editable: true,
    width: 170,
  };

  if (storageKind === "number") {
    return {
      ...base,
      valueParser: (p) =>
        p.newValue === "" || p.newValue == null ? null : Number(p.newValue),
    };
  }

  if (storageKind === "boolean") {
    return {
      ...base,
      cellEditor: FuzzySelectEditor,
      cellEditorParams: {
        values: [true, false],
        formatOption: (v: unknown) => (v ? "Yes" : "No"),
      },
      cellEditorPopup: true,
      valueFormatter: (p) => (p.value == null ? "" : p.value ? "Yes" : "No"),
      cellRenderer: DropdownCellRenderer,
    };
  }

  if (storageKind === "reference") {
    const idToLabel = new Map<number, string>();
    referenceOptions.forEach((o) => idToLabel.set(o.id, lookupLabel(o)));
    const format = (v: unknown) =>
      v == null || v === "" ? "" : idToLabel.get(Number(v)) ?? String(v);
    return {
      ...base,
      cellEditor: FuzzySelectEditor,
      cellEditorParams: {
        values: [null, ...referenceOptions.map((o) => o.id)],
        formatOption: format,
      },
      cellEditorPopup: true,
      valueFormatter: (p) => format(p.value),
      cellRenderer: DropdownCellRenderer,
      valueParser: (p) => (p.newValue === "" || p.newValue == null ? null : Number(p.newValue)),
      filterValueGetter: (p) => format(p.data?.attributes?.[key]),
    };
  }

  // text / date / file — plain text. `date` is an ISO date string and `file`
  // is a URL (matching the rest of the app's *_url columns, e.g.
  // `stencil_url`) — neither has a dedicated widget anywhere in this app yet.
  return base;
}
