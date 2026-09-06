import { NavLink, Outlet } from "react-router-dom";
import {
  Tag,
  Database,
  Workflow,
  History,
  LayoutDashboard,
  MapPin,
  Building2,
  Server,
  Rows3,
  Cable,
  Grid3x3,
  Zap,
  Plug,
  Boxes,
  Container,
  Monitor,
  Network,
  Route,
  MapPinned,
  Hash,
  Router,
  Settings2,
  Settings,
  Layers,
  type LucideIcon,
} from "lucide-react";

const NAV: {
  section: string;
  icon: LucideIcon;
  items: { to: string; label: string; icon: LucideIcon }[];
}[] = [
  // Phase 4 Req 3.1: Reference sections lead the nav, not trail it.
  {
    section: "Reference",
    icon: Database,
    items: [
      { to: "/naming", label: "Naming Conventions", icon: Tag },
      { to: "/reference-data", label: "Reference Data", icon: Database },
      { to: "/entity-types", label: "Entity Type Builder", icon: Layers },
      { to: "/ansible", label: "Ansible Inventory", icon: Workflow },
      { to: "/changelog", label: "Changelog", icon: History },
    ],
  },
  {
    section: "Overview",
    icon: LayoutDashboard,
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    section: "Sites & Physical",
    icon: Building2,
    items: [
      { to: "/sites", label: "Sites", icon: MapPin },
      { to: "/hierarchy", label: "Physical Hierarchy", icon: Building2 },
      { to: "/racks", label: "Rack View", icon: Server },
      { to: "/racks-list", label: "Racks (list)", icon: Rows3 },
      { to: "/patch-panel-view", label: "Patch Panel View", icon: Grid3x3 },
      { to: "/patch-panels", label: "Patch Panels (list)", icon: Rows3 },
      { to: "/power-device-view", label: "Power Device View", icon: Zap },
      { to: "/power", label: "Power (list)", icon: Plug },
      { to: "/cables", label: "Cables", icon: Cable },
    ],
  },
  {
    section: "Compute",
    icon: Server,
    items: [
      { to: "/physical-servers", label: "Physical Servers", icon: Server },
      { to: "/virtual-machines", label: "Virtual Machines", icon: Boxes },
      { to: "/containers-apps", label: "Containers & Apps", icon: Container },
      { to: "/workstations", label: "Workstations", icon: Monitor },
    ],
  },
  {
    section: "Networking & IPAM",
    icon: Network,
    items: [
      { to: "/vlans", label: "VLANs", icon: Network },
      { to: "/subnets", label: "Subnets (IPAM)", icon: Route },
      { to: "/ipam", label: "IPAM by Site", icon: MapPinned },
      { to: "/ip-assignments", label: "IP Assignments", icon: Hash },
      { to: "/network-devices", label: "Network Devices", icon: Router },
      { to: "/port-config-view", label: "Port Configuration View", icon: Settings2 },
      { to: "/port-config", label: "Device Port Config (list)", icon: Settings },
    ],
  },
];

export default function Layout() {
  return (
    <div className="flex h-full">
      <aside className="w-60 bg-vfdark text-slate-200 flex flex-col shrink-0 overflow-y-auto">
        <div className="px-4 py-4 border-b border-slate-700">
          <div className="text-lg font-bold text-white">Virtualfactor</div>
          <div className="text-xs text-slate-400">IT CMDB</div>
        </div>
        <nav className="flex-1 py-2">
          {NAV.map((group) => {
            const SectionIcon = group.icon;
            return (
              <div key={group.section} className="mb-3">
                <div className="px-4 py-1 text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <SectionIcon size={12} aria-hidden="true" />
                  {group.section}
                </div>
                {group.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-4 py-1.5 text-sm ${
                          isActive
                            ? "bg-blue-600 text-white"
                            : "text-slate-300 hover:bg-slate-700"
                        }`
                      }
                    >
                      <ItemIcon size={15} aria-hidden="true" className="shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-700">
          Single-user · No auth · Home network
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
