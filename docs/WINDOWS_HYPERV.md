# Run the CMDB on Hyper-V, then migrate to Proxmox

This is the **laptop → Proxmox** path. You stand the whole CMDB up as a VM on
your Windows laptop with **one command**, use it / test it, and when you are
ready you move that exact VM to Proxmox with **one more command**. Nothing is
reinstalled during the move — the same disk, containers and data just boot on
Proxmox.

Everything here is intentionally **hands-off**: the VM installs its own OS
packages, Podman, the app, the auto-update timer and the backup timer on first
boot via cloud-init — identical to the Proxmox flow, so there are no surprises
at migration time.

---

## TL;DR

```powershell
# On your Windows laptop, in an ELEVATED PowerShell, from deploy\hyperv\
.\New-CmdbVM.ps1                       # build + boot the VM (zero-touch)
.\Manage-CmdbVM.ps1 -Action ip         # get its IP
.\Manage-CmdbVM.ps1 -Action open       # open the Web UI

# …later, to migrate to Proxmox:
.\Export-CmdbForProxmox.ps1            # produces a qcow2 + prints next commands
```
```bash
# On the Proxmox host (as root), one command:
bash import-from-hyperv.sh --disk /var/lib/vz/template/vf-cmdb-os.qcow2 \
     --vmid 9000 --name vf-cmdb --storage local-lvm --bridge vmbr0
```

---

## 0. One-time laptop prerequisites

| Requirement | How |
|---|---|
| **Windows Pro/Enterprise/Education** with Hyper-V | `Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All` then reboot |
| **OpenSSH client** (`ssh`, `ssh-keygen`) | Settings → *Optional Features* → add **OpenSSH Client** (usually already present on Win 10/11) |
| **qemu-img** (disk conversion) | The script auto-installs via `winget install qemu.qemu`. To pre-install: `winget install qemu.qemu` |
| **Virtual switch** | An **External** switch is recommended so the VM gets a real LAN IP. The script falls back to the NAT *Default Switch* if none exists. |

> **External switch (recommended, 30 seconds):** Hyper-V Manager → *Virtual Switch
> Manager* → **New** → *External* → bind to your Wi-Fi/Ethernet adapter → name it
> e.g. `External-LAN`. Then pass `-SwitchName "External-LAN"`.
>
> Home Wi-Fi note: an External switch on a wireless adapter works but the VM is
> only reachable from your own machine on some corporate networks. If LAN
> visibility matters, use a wired adapter.

---

## 1. Build the VM (zero-touch)

From an **elevated** PowerShell (Run as Administrator):

```powershell
cd <repo>\deploy\hyperv
.\New-CmdbVM.ps1
```

Useful options:

```powershell
.\New-CmdbVM.ps1 -Release noble  -CpuCount 4 -MemoryGB 8 -DiskGB 40 `
                 -SwitchName "External-LAN"
```

| Parameter | Default | Notes |
|---|---|---|
| `-VMName` | `vf-cmdb` | Hyper-V VM name |
| `-Release` | `noble` (24.04) | `jammy` = 22.04. **24.04 is recommended** — Podman 4.x gives full Quadlet/systemd always-on, matching a modern Proxmox host. |
| `-CpuCount` / `-MemoryGB` / `-DiskGB` | 2 / 4 / 30 | sizing |
| `-SwitchName` | auto | External switch if present, else Default Switch |
| `-SshPublicKeyPath` | `~\.ssh\id_ed25519.pub` | auto-generated if missing |
| `-RepoBranch` | `master` | branch to deploy |

**What it does:** downloads the official Ubuntu cloud image → converts to VHDX →
builds a cloud-init **NoCloud** seed disk (pure PowerShell, no Windows ADK) →
creates a Gen-2 VM (Secure Boot on, MS UEFI CA template) → boots it. cloud-init
then runs `bootstrap.sh` and the CMDB comes up on its own.

First boot takes **~5–8 minutes** (package install + image pulls + DB migrate +
seed).

---

## 2. Reach the app

```powershell
.\Manage-CmdbVM.ps1 -Action ip      # prints the VM's IPv4
.\Manage-CmdbVM.ps1 -Action open    # opens http://<ip>:8080 in your browser
.\Manage-CmdbVM.ps1 -Action ssh     # ssh vfadmin@<ip>
```

> **Finding the IP if `-Action ip` is slow or empty:** open the console
> (`.\Manage-CmdbVM.ps1 -Action connect`) — the VM prints its **IP address and
> all URLs right on the login screen**, so you can read it without logging in.
> (If the banner still shows `\4`, press Enter once to refresh, or wait a few
> seconds for the network to come up.) The VM also runs the Hyper-V KVP daemon,
> so the IP shows in Hyper-V Manager's *Networking* tab too.

### Credentials
| Where | Username | Password |
|---|---|---|
| **SSH** (preferred) | `vfadmin` | *(none — uses your SSH key)* |
| **Console login** | `vfadmin` | `changeme-on-first-login` (change it: `passwd`) |
| **pgAdmin** (`:5050`) | `admin@virtualfactor.local` | `admin` (set in `~/vf-cmdb/.env`) |
| **Web UI** (`:8080`) | *(no login — single-user app)* | — |

- **Web UI**: `http://<vm-ip>:8080`
- **API docs**: `http://<vm-ip>:8000/docs`
- **Health**: `http://<vm-ip>:8000/health`
- **pgAdmin**: `http://<vm-ip>:5050`

If you used the NAT *Default Switch*, those URLs work **from the laptop itself**.
With an External switch they work from anywhere on your LAN.

### VS Code Remote-SSH
1. Install the **Remote - SSH** extension.
2. `Ctrl+Shift+P` → *Remote-SSH: Connect to Host* → `vfadmin@<vm-ip>`.
3. *Open Folder* → `/home/vfadmin/vf-cmdb`.

The SSH key generated/used in step 1 is already authorised, so this is
password-less.

---

## 3. Day-to-day (Manage-CmdbVM.ps1)

```powershell
.\Manage-CmdbVM.ps1 -Action status
.\Manage-CmdbVM.ps1 -Action snapshot -SnapshotName "before-upgrade"
.\Manage-CmdbVM.ps1 -Action stop
.\Manage-CmdbVM.ps1 -Action start
.\Manage-CmdbVM.ps1 -Action remove      # deletes the VM + its disks (confirms)
```

Inside the VM the usual automation is already running (installed by
`bootstrap.sh`):

- **Auto-update** timer — daily 03:30 (git pull → rebuild → health-checked
  redeploy → auto-rollback on failure)
- **Backup** timer — 01:00 & 13:00 (`pg_dump` + config, 14-day retention) into
  `~/vf-cmdb-backups/`

Convenience aliases in the VM: `cmdb-status`, `cmdb-logs`, `cmdb-update`,
`cmdb-backup`.

---

## 4. Migrate to Proxmox

You have two options. **Option A moves the exact VM** (simplest mental model).
**Option B rebuilds fresh and restores a backup** (smallest transfer, cleanest).

### Before you migrate (either option) — take a backup off the VM
```powershell
.\Manage-CmdbVM.ps1 -Action ssh
# inside the VM:
~/vf-cmdb/deploy/scripts/vf-cmdb-backup.sh
exit
# copy it to your laptop:
scp vfadmin@<vm-ip>:~/vf-cmdb-backups/*.tar.gz .
```

### Option A — Move the disk (lift-and-shift)

On the **laptop**:
```powershell
.\Export-CmdbForProxmox.ps1                 # stops VM, converts OS disk to qcow2
```
It prints the next commands. In short:
```powershell
scp C:\HyperV\_export\vf-cmdb-os.qcow2 root@<proxmox-ip>:/var/lib/vz/template/
scp ..\proxmox\import-from-hyperv.sh    root@<proxmox-ip>:/root/
```
On the **Proxmox host** (as root):
```bash
bash /root/import-from-hyperv.sh \
     --disk /var/lib/vz/template/vf-cmdb-os.qcow2 \
     --vmid 9000 --name vf-cmdb \
     --storage local-lvm --bridge vmbr0
     # add:  --ip 192.168.1.50/24 --gw 192.168.1.1   for a static IP (else DHCP)
```
`import-from-hyperv.sh` creates a matching **q35 + OVMF/UEFI** VM (same firmware
class as the Hyper-V Gen-2 VM), imports the disk as `scsi0`, adds an EFI +
cloud-init drive, sets boot order and networking, and starts it. The containers
auto-start; give it 1–2 minutes.

> **Why q35/OVMF?** The Hyper-V VM is Generation 2 (UEFI). Importing into a
> matching UEFI machine type means the existing bootloader/partitions boot
> unchanged. The script handles this for you.

### Option B — Rebuild fresh + restore (recommended if you want a clean node)

This reuses the tooling you already have and transfers only a small backup
archive instead of a multi-GB disk.

1. Provision a fresh Proxmox VM with the existing cloud-init flow
   (`deploy/cloud-init/user-data.yaml`) or the manual steps in
   `docs/DEPLOYMENT_MANUAL.md`. You get an empty, running CMDB.
2. Copy your backup archive to the new VM and restore:
   ```bash
   scp vf-cmdb-backup-*.tar.gz vfadmin@<new-vm-ip>:~
   ssh vfadmin@<new-vm-ip> '~/vf-cmdb/deploy/scripts/vf-cmdb-restore.sh --latest'
   ```
   (See `docs/DISASTER_RECOVERY.md` — this is the same runbook you'd use if the
   server were lost.)

---

## 5. Networking after migration

- **DHCP (default):** the migrated VM just picks up a new lease — find it with
  `qm guest cmd 9000 network-get-interfaces` (needs the guest agent, which the
  import script enables) or check your router.
- **Static IP:** pass `--ip/--gw` to the import script. Ubuntu on both Hyper-V
  and KVM uses predictable/`en*` names via cloud-init/netplan, so a
  cloud-init-supplied address applies cleanly regardless of NIC renaming.
- The firewall (ufw) rules for 8080/8000/5050 and SSH travel **inside** the disk
  image, so they are already in force after migration (Option A) or re-applied
  by `bootstrap.sh` (Option B).

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `New-CmdbVM.ps1` says Hyper-V module missing | Enable Hyper-V (see prerequisites) and reboot. Requires Windows Pro+. |
| qemu-img won't auto-install | `winget install qemu.qemu` (or `choco install qemu`), then re-run. Ensure `C:\Program Files\qemu` is on PATH. |
| No IP from `-Action ip` | Wait for first boot to finish; ensure the VM is *Running* and (for LAN) that you used an External switch. NAT/Default Switch IPs are only reachable from the host. |
| Web UI not up yet | First boot installs everything — allow ~5–8 min. Watch progress: `.\Manage-CmdbVM.ps1 -Action ssh` then `cloud-init status --wait` and `cmdb-logs`. |
| Secure Boot / won't boot | The script sets the **MicrosoftUEFICertificateAuthority** template required by Ubuntu cloud images; don't switch it to the default Windows template. |
| `must not be sparse` / `0xC03A001A` on resize or start | qemu-img on Windows marks its VHDX output as *sparse*, which Hyper-V rejects. The script clears it automatically (`fsutil sparse setflag <vhdx> 0`, with a copy-based fallback). If you hit it on an older copy of the script, update to the latest, or run manually: `fsutil sparse setflag "C:\HyperV\vf-cmdb\vf-cmdb-os.vhdx" 0`. |
| After Proxmox import, no network | Confirm `--bridge` matches your Proxmox bridge (usually `vmbr0`); for static, re-check `--ip/--gw`. Reboot once so cloud-init re-applies. |

---

## How this maps to your five requirements

- **Easy & quick first-time deploy** → one command (`New-CmdbVM.ps1`), no OS
  install clicking.
- **Automatic updates** → the update timer is installed on first boot (runs in
  the VM on Hyper-V *and* after migration on Proxmox).
- **Repeatable** → same cloud-init `user-data` drives Hyper-V and Proxmox; the
  VM is disposable and reproducible.
- **Backups / DR** → backup timer runs from first boot; Option B migration is
  literally the disaster-recovery restore path.
- **Migration** → one command each side (`Export-CmdbForProxmox.ps1` →
  `import-from-hyperv.sh`).
