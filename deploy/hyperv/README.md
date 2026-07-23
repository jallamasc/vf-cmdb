# Hyper-V — laptop test VM + migration to Proxmox

Zero-touch scripts to run the Virtualfactor IT CMDB as a VM on a Windows laptop
(Hyper-V), then move it to Proxmox. Full walkthrough:
[`docs/WINDOWS_HYPERV.md`](../../docs/WINDOWS_HYPERV.md).

| Script | Where | What it does |
|---|---|---|
| `New-CmdbVM.ps1` | laptop (elevated PS) | Downloads the Ubuntu cloud image, builds a cloud-init seed, creates a Gen-2 VM and boots it. cloud-init runs `bootstrap.sh` → CMDB comes up on its own. |
| `Manage-CmdbVM.ps1` | laptop (elevated PS) | Convenience: `ip`, `open`, `ssh`, `start`, `stop`, `restart`, `status`, `snapshot`, `connect`, `remove`. |
| `Export-CmdbForProxmox.ps1` | laptop (elevated PS) | Stops the VM, converts the OS disk to qcow2, prints the exact scp + import commands. |
| `cloud-init/*.tmpl.yaml` | — | Templates the PowerShell fills in (SSH key, hostname, branch) to build the NoCloud seed. |
| `../proxmox/import-from-hyperv.sh` | Proxmox host (root) | One command: creates a matching q35/OVMF VM, imports the disk, wires up boot + network, starts it. |

## Quick start

```powershell
# elevated PowerShell, in this folder
.\New-CmdbVM.ps1
.\Manage-CmdbVM.ps1 -Action open
```

## Requirements (laptop)
- Windows Pro/Enterprise/Education with **Hyper-V** enabled
- **OpenSSH client** (`ssh`, `ssh-keygen`)
- **qemu-img** — auto-installed via `winget install qemu.qemu` if missing
- A virtual switch (an **External** switch is recommended for LAN access)

See the full guide for options, VS Code Remote-SSH, migration and
troubleshooting.
