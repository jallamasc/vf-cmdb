// Naming-convention modifications (item 5) — a curated catalogue of
// well-known OS/platform names for the OsFamily.full_name picker
// (`OsNameEditor.tsx`), so an operator creating e.g. "Android" picks it
// from a list instead of hand-typing it. Deliberately broader than
// `endoflife_client.py`'s `CURATED_PRODUCTS` (which is server/hypervisor-
// only — ubuntu, debian, rhel, windows, macos, esxi, ...) since this app's
// OsFamily rows also cover mobile, network, and embedded operating
// systems that endoflife.date's curated sync never reaches.
//
// This is suggestions, not a closed enum: `OsNameEditor` always lets an
// operator type and commit a name that isn't on this list at all — a
// homegrown or rare OS is still a legitimate `OsFamily.full_name`.
export const OS_NAME_SUGGESTIONS: string[] = [
  // Linux distributions
  "Ubuntu",
  "Debian",
  "Red Hat Enterprise Linux",
  "CentOS",
  "CentOS Stream",
  "Rocky Linux",
  "AlmaLinux",
  "Fedora",
  "SUSE Linux Enterprise Server",
  "openSUSE",
  "Oracle Linux",
  "Amazon Linux",
  "Arch Linux",
  "Alpine Linux",
  "Linux Mint",
  // BSD
  "FreeBSD",
  "OpenBSD",
  "NetBSD",
  // Windows
  "Windows Server",
  "Windows",
  "Windows 11",
  "Windows 10",
  // Apple
  "macOS",
  "iOS",
  "iPadOS",
  // Hypervisors / virtualization platforms
  "VMware ESXi",
  "VMware vSphere",
  "Proxmox VE",
  "Microsoft Hyper-V",
  "XCP-ng",
  "Citrix Hypervisor",
  // Mobile / embedded
  "Android",
  "ChromeOS",
  "VxWorks",
  // Network device operating systems
  "Cisco IOS",
  "Cisco IOS-XE",
  "Cisco NX-OS",
  "Juniper Junos",
  "Arista EOS",
  "MikroTik RouterOS",
  "pfSense",
  "OPNsense",
  "Ubiquiti UniFi OS",
  "FortiOS",
  // Storage / NAS
  "Synology DSM",
  "TrueNAS",
  "QNAP QTS",
];
