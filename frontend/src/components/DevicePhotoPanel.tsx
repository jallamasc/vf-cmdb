import { Row } from "../api";
import PhotoField from "./PhotoField";

interface Props {
  resource: string;
  selected: Row | null;
}

/**
 * Phase 5 Task 23 (Req 19.1) — the row-selection-driven photo manager for a
 * hardcoded device grid (NetworkDevices, PhysicalServers, Workstations,
 * and — via SimpleGridPage — PowerDevices/PatchPanels). Unlike
 * `GenericEntityView`'s `CapabilityPanel`, there is no opt-in capability
 * system for these hardcoded types (Requirement 19.1 makes the photo
 * unconditional on all five), so this always renders `PhotoField` once a
 * row is selected.
 */
export default function DevicePhotoPanel({ resource, selected }: Props) {
  if (!selected) {
    return (
      <div className="mb-2 px-3 py-2 border border-dashed border-slate-300 rounded text-sm text-slate-500">
        <span className="font-medium text-slate-600">Photo</span> — select a
        row to upload or view its photo.
      </div>
    );
  }
  return (
    <div className="mb-2 px-3 py-2 border border-slate-200 bg-slate-50 rounded">
      <PhotoField resource={resource} row={selected} />
    </div>
  );
}
