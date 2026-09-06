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
import {
  Server,
  Router,
  Cpu,
  HardDrive,
  Wifi,
  Radio,
  Fan,
  Zap,
  Monitor,
  Boxes,
  Container,
  Shield,
  Network,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

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

const ICON_MAP: Record<DeviceTypeIconName, LucideIcon> = {
  Server,
  Router,
  Cpu,
  HardDrive,
  Wifi,
  Radio,
  Fan,
  Zap,
  Monitor,
  Boxes,
  Container,
  Shield,
  Network,
};

/** Resolve a stored icon name to its component, falling back to a generic icon. */
export function resolveDeviceTypeIcon(name?: string | null): LucideIcon {
  if (name && name in ICON_MAP) return ICON_MAP[name as DeviceTypeIconName];
  return HelpCircle;
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
