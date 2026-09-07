// Phase 5 Task 9 — device-type icons + an animated active-status glyph
// (Req 6.2, 7.1).
//
// Icon values are plain strings stored on the 4 device-type lookup rows
// (network/compute/storage/power-device-types.icon), constrained to this
// allow-list via `selectCol` in Naming.tsx so a typo can never silently
// produce a missing icon. `resolveDeviceTypeIcon` maps a stored name to the
// actual lucide-react component, falling back to a generic icon for any
// name outside the allow-list (e.g. data seeded before this list existed).
//
// "Active" has no dedicated column anywhere in the schema today — the only
// existing signal a device already carries is `last_fact_sync_at` (Phase 4
// Req 21, present on NetworkDevice/PhysicalServer/VirtualMachine/
// ContainerApp/Workstation). A device is treated as "active" here when that
// timestamp is within the last 24 hours, i.e. it has recently reported
// Ansible facts. PowerDevice has no facts column at all, so it never shows
// the animated glyph — that's expected, not a bug.
import type { LucideIcon } from "lucide-react";
import { resolveIcon } from "./iconLibrary";

// Phase 6 Task 10 — kept as the original 13-name subset for anything that
// still imports it directly, but the editable `icon` column everywhere
// (including these 4 device-type lookups themselves, see Naming.tsx) now
// picks from the much wider `iconLibrary.ts` catalogue via `iconCol()`.
export const DEVICE_TYPE_ICON_NAMES = [
  "Server",
  "Router",
  "Cpu",
  "HardDrive",
  "Wifi",
  "Radio",
  "Fan",
  "Zap",
  "Monitor",
  "Boxes",
  "Container",
  "Shield",
  "Network",
] as const;

export type DeviceTypeIconName = (typeof DEVICE_TYPE_ICON_NAMES)[number];

/** Resolve a stored icon name to its component, falling back to a generic
 * icon. Delegates to the full `iconLibrary.ts` catalogue so any icon an
 * operator picked via the wider Icon_Picker (Req 4.2) still renders here,
 * not just the original 13-name subset. */
export function resolveDeviceTypeIcon(name?: string | null): LucideIcon {
  return resolveIcon(name);
}

// Phase 6 Task 28 (Req 11.1) — Diagram Fallback Icons: the coarse category
// string every graphical view already colours slots by (`RackDiagramSVG`'s
// `TYPE_HEX`, `rack_units.device_type`, `RackSlotEditor`'s
// `STATIC_DEVICE_TABLES.deviceType`) also picks a meaningful default icon
// for when NEITHER a per-record Stencil_Override NOR a device-type stencil
// is configured — replacing a bare colored rectangle. Every name below was
// deliberately checked against lucide-react's own source to confirm it
// renders ONLY <path>/<line>/<rect> primitives, never a literal <circle> —
// RackDiagramSVG's back-face connector dots are the only <circle> elements
// that diagram is allowed to have, so a fallback icon that smuggled in its
// own <circle> (e.g. "HelpCircle") would silently corrupt that count.
const CATEGORY_ICON_NAMES: Record<string, string> = {
  server: "Server",
  switch: "Network",
  router: "Router",
  firewall: "Shield",
  pdu: "Zap",
  ups: "BatteryCharging",
  patchpanel: "Cable",
  storage: "HardDrive",
  generic: "Box",
};

/** A category-appropriate default icon (Req 11.1) — deliberately NOT the
 * same as `resolveDeviceTypeIcon`'s fallback (HelpCircle), which renders an
 * actual `<circle>` and would be unsafe to mix into a rack diagram's back
 * face (see the module-level comment above). Unknown/unmapped categories
 * fall back to "Box", also circle-free. */
export function resolveCategoryIcon(deviceType?: string | null): LucideIcon {
  const name = CATEGORY_ICON_NAMES[(deviceType ?? "").toLowerCase()] ?? "Box";
  return resolveIcon(name);
}

/** Req 7.1 — within the last N hours counts as "recently active" (default 24h). */
export function isRecentlyActive(
  lastFactSyncAt?: string | null,
  withinHours = 24
): boolean {
  if (!lastFactSyncAt) return false;
  const ts = new Date(lastFactSyncAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= withinHours * 60 * 60 * 1000;
}
