import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { api, Row } from "../api";
import ThemeNamePicker from "../components/ThemeNamePicker";

/**
 * Round 6 QA — "check that every field ... has a fantastic name with a
 * totally enabled dropdown to select fantastic names just like other
 * places ... in Physical Servers I can't select a name, just manually
 * write it."
 *
 * `Sites.tsx` and `NetworkDevices.tsx` each hand-roll the same three
 * pieces (a `pickerRow` state, a mutation that PATCHes `theme_name`/
 * `theme_category`, and a "🎭 Pick" button column + `<ThemeNamePicker>`
 * render) to give one row's `theme_name` a real, catalogue-backed picker
 * instead of a plain typed text cell. This hook factors that out so any
 * other resource with a `theme_name`/`theme_category` pair gets the exact
 * same one-click, in-grid entry point without re-implementing it.
 *
 * Usage:
 * ```tsx
 * const theme = useThemePicker("racks");
 * // ...
 * columns={[..., theme.column, ...]}
 * // ...
 * return (<>
 *   <EntityGrid ... />
 *   {theme.picker}
 * </>);
 * ```
 */
export function useThemePicker(resource: string, initialCategory?: string) {
  const qc = useQueryClient();
  const [pickerRow, setPickerRow] = useState<Row | null>(null);

  const applyTheme = useMutation({
    mutationFn: ({ id, selection }: { id: number; selection: { name: string; category: string } }) =>
      api.update(resource, id, {
        theme_name: selection.name,
        theme_category: selection.category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [resource] });
      setPickerRow(null);
    },
  });

  const column: ColDef = {
    colId: "theme_pick",
    headerName: "Theme",
    width: 90,
    editable: false,
    sortable: false,
    filter: false,
    cellRenderer: (p: ICellRendererParams) => (
      <button
        type="button"
        onClick={() => setPickerRow(p.data)}
        title="Pick a fantastic name from a themed catalogue"
        className="px-2 py-0.5 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
      >
        🎭 Pick
      </button>
    ),
  };

  const picker = (
    <ThemeNamePicker
      open={pickerRow != null}
      initialCategory={pickerRow?.theme_category || initialCategory}
      selectedName={pickerRow?.theme_name ?? null}
      onSelect={(selection) => {
        if (pickerRow) applyTheme.mutate({ id: pickerRow.id, selection });
      }}
      onClose={() => setPickerRow(null)}
    />
  );

  return { column, picker, pickerRow, applyTheme };
}
