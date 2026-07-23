import { NavLink, Outlet } from "react-router-dom";

const NAV: { section: string; items: { to: string; label: string }[] }[] = [
  {
    section: "Overview",
    items: [{ to: "/", label: "Dashboard" }],
  },
  {
    section: "Sites & Physical",
    items: [
      { to: "/sites", label: "Sites" },
      { to: "/racks", label: "Rack View" },
      { to: "/patch-panels", label: "Patch Panels" },
      { to: "/power", label: "Power" },
      { to: "/cables", label: "Cables" },
    ],
  },
  {
    section: "Compute",
    items: [
      { to: "/physical-servers", label: "Physical Servers" },
      { to: "/virtual-machines", label: "Virtual Machines" },
      { to: "/containers-apps", label: "Containers & Apps" },
      { to: "/workstations", label: "Workstations" },
    ],
  },
  {
    section: "Networking & IPAM",
    items: [
      { to: "/vlans", label: "VLANs" },
      { to: "/subnets", label: "Subnets (IPAM)" },
      { to: "/ip-assignments", label: "IP Assignments" },
      { to: "/network-devices", label: "Network Devices" },
      { to: "/port-config", label: "Device Port Config" },
    ],
  },
  {
    section: "Reference",
    items: [
      { to: "/naming", label: "Naming Conventions" },
      { to: "/reference-data", label: "Reference Data" },
      { to: "/ansible", label: "Ansible Inventory" },
      { to: "/changelog", label: "Changelog" },
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
          {NAV.map((group) => (
            <div key={group.section} className="mb-3">
              <div className="px-4 py-1 text-[11px] uppercase tracking-wider text-slate-500">
                {group.section}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `block px-4 py-1.5 text-sm ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-700"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
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
