// Phase 6 Task 10 (Req 4.1/4.2/4.3) — the icon catalogue every registry's
// new `icon` column picks from. Backed entirely by the already-bundled
// Lucide set (Req 4.3 — no new runtime dependency on an external icon
// service), the same "configured source" the device-type lookups already
// used (Phase 5 Task 9's `DEVICE_TYPE_ICON_NAMES`), just widened well beyond
// those 13 device-shape icons to cover every kind of registry row an
// administrator might create (organizations, geography, security, network,
// power, generic business/reference icons, ...).
//
// This is a curated allow-list, not lucide-react's full ~1500-icon set —
// importing every icon by name would meaningfully bloat the bundle for
// icons this app will basically never use. Every name below was verified to
// actually exist in the installed lucide-react version via a node require
// check before being added here (the same discipline Phase 5 Task 8/9 used),
// so a typo can never silently produce a missing icon.
import {
  Server, Router, Cpu, HardDrive, Wifi, Radio, Fan, Zap, Monitor, Boxes,
  Container, Shield, Network, Building, Building2, MapPin, MapPinned,
  Globe, Globe2, Map, Flag, Home, Landmark, School, Hospital, Hotel,
  Warehouse, Factory, Store, Locate, Compass, Navigation, Tag, Tags,
  Layers, Layers3, Users, User, UserCog, Briefcase, Database, DatabaseZap,
  Cloud, CloudCog, Box, Package, PackageOpen, Cable, Plug, PlugZap,
  BatteryCharging, Battery, BatteryFull, Power, PowerOff, Gauge, Activity,
  Signal, SignalHigh, Antenna, Satellite, SatelliteDish, Unplug, Rows3,
  Rows4, Columns3, Grid3x3, LayoutGrid, LayoutDashboard, MemoryStick,
  MonitorSmartphone, Smartphone, Tablet, Laptop, Printer, Lock, Unlock,
  Key, KeyRound, ShieldCheck, ShieldAlert, ShieldOff, Fingerprint, Scan,
  ScanLine, QrCode, Barcode, Hash, AtSign, Link, Link2, Workflow,
  GitBranch, GitMerge, Share2, Rss, Send, Mail, Inbox, Timer, Clock,
  History, CalendarClock, AlarmClock, TrendingUp, BarChart3, PieChart,
  LineChart, Thermometer, Droplet, Wind, Truck, Ship, Plane, Train, Car,
  Star, Bookmark, Flame, Sun, Moon, CloudRain, Snowflake, CircleDot, Dot,
  Diamond, Hexagon, Triangle, Square, Circle, Terminal, Code, Code2,
  Binary, Bug, Wrench, Settings, Settings2, Cog, SlidersHorizontal,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

const ICON_COMPONENTS = {
  Server, Router, Cpu, HardDrive, Wifi, Radio, Fan, Zap, Monitor, Boxes,
  Container, Shield, Network, Building, Building2, MapPin, MapPinned,
  Globe, Globe2, Map, Flag, Home, Landmark, School, Hospital, Hotel,
  Warehouse, Factory, Store, Locate, Compass, Navigation, Tag, Tags,
  Layers, Layers3, Users, User, UserCog, Briefcase, Database, DatabaseZap,
  Cloud, CloudCog, Box, Package, PackageOpen, Cable, Plug, PlugZap,
  BatteryCharging, Battery, BatteryFull, Power, PowerOff, Gauge, Activity,
  Signal, SignalHigh, Antenna, Satellite, SatelliteDish, Unplug, Rows3,
  Rows4, Columns3, Grid3x3, LayoutGrid, LayoutDashboard, MemoryStick,
  MonitorSmartphone, Smartphone, Tablet, Laptop, Printer, Lock, Unlock,
  Key, KeyRound, ShieldCheck, ShieldAlert, ShieldOff, Fingerprint, Scan,
  ScanLine, QrCode, Barcode, Hash, AtSign, Link, Link2, Workflow,
  GitBranch, GitMerge, Share2, Rss, Send, Mail, Inbox, Timer, Clock,
  History, CalendarClock, AlarmClock, TrendingUp, BarChart3, PieChart,
  LineChart, Thermometer, Droplet, Wind, Truck, Ship, Plane, Train, Car,
  Star, Bookmark, Flame, Sun, Moon, CloudRain, Snowflake, CircleDot, Dot,
  Diamond, Hexagon, Triangle, Square, Circle, Terminal, Code, Code2,
  Binary, Bug, Wrench, Settings, Settings2, Cog, SlidersHorizontal,
} satisfies Record<string, LucideIcon>;

export const ICON_LIBRARY_NAMES = [
  // Device shapes (Phase 5 Task 9's original allow-list).
  "Server", "Router", "Cpu", "HardDrive", "Wifi", "Radio", "Fan", "Zap",
  "Monitor", "Boxes", "Container", "Shield", "Network",
  // Buildings / places / geography.
  "Building", "Building2", "MapPin", "MapPinned", "Globe", "Globe2", "Map",
  "Flag", "Home", "Landmark", "School", "Hospital", "Hotel", "Warehouse",
  "Factory", "Store", "Locate", "Compass", "Navigation",
  // Organization / reference-data generic.
  "Tag", "Tags", "Layers", "Layers3", "Users", "User", "UserCog",
  "Briefcase",
  // Data / cloud / storage.
  "Database", "DatabaseZap", "Cloud", "CloudCog", "Box", "Package",
  "PackageOpen",
  // Power.
  "Cable", "Plug", "PlugZap", "BatteryCharging", "Battery", "BatteryFull",
  "Power", "PowerOff", "Gauge",
  // Network / signal.
  "Activity", "Signal", "SignalHigh", "Antenna", "Satellite",
  "SatelliteDish", "Unplug",
  // Layout / grouping.
  "Rows3", "Rows4", "Columns3", "Grid3x3", "LayoutGrid", "LayoutDashboard",
  // Hardware.
  "MemoryStick", "MonitorSmartphone", "Smartphone", "Tablet", "Laptop",
  "Printer",
  // Security.
  "Lock", "Unlock", "Key", "KeyRound", "ShieldCheck", "ShieldAlert",
  "ShieldOff", "Fingerprint",
  // Identifiers / scanning.
  "Scan", "ScanLine", "QrCode", "Barcode", "Hash", "AtSign", "Link",
  "Link2",
  // Workflow / connectivity.
  "Workflow", "GitBranch", "GitMerge", "Share2", "Rss", "Send", "Mail",
  "Inbox",
  // Time.
  "Timer", "Clock", "History", "CalendarClock", "AlarmClock",
  // Metrics.
  "TrendingUp", "BarChart3", "PieChart", "LineChart", "Thermometer",
  "Droplet", "Wind",
  // Transport (site/campus logistics context).
  "Truck", "Ship", "Plane", "Train", "Car",
  // Environment / misc.
  "Star", "Bookmark", "Flame", "Sun", "Moon", "CloudRain", "Snowflake",
  // Basic shapes (generic fallback choices).
  "CircleDot", "Dot", "Diamond", "Hexagon", "Triangle", "Square", "Circle",
  // Dev / terminal (app-type / cluster-type registries).
  "Terminal", "Code", "Code2", "Binary", "Bug", "Wrench", "Settings",
  "Settings2", "Cog", "SlidersHorizontal",
] as const;

export type IconLibraryName = (typeof ICON_LIBRARY_NAMES)[number];

const ICON_MAP: Record<string, LucideIcon> = ICON_COMPONENTS;

/** Resolve any stored icon name (from any registry) to its component,
 * falling back to a generic icon for an unrecognised/legacy value. */
export function resolveIcon(name?: string | null): LucideIcon {
  if (name && name in ICON_MAP) return ICON_MAP[name];
  return HelpCircle;
}

export { ICON_MAP as ICON_LIBRARY };
