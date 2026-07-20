# Cloud-init — zero-touch VM provisioning

`user-data.yaml` provisions a fresh Ubuntu 22.04/24.04 VM and fully deploys the
CMDB on first boot (creates the app user, installs your SSH key, installs Podman,
clones the repo, runs `bootstrap.sh`).

## Before you use it
Edit `user-data.yaml` and replace:
1. `<YOUR_SSH_PUBLIC_KEY>` → the contents of your `~/.ssh/id_ed25519.pub`.
2. (optional) the `CORS_ORIGINS` value in the `runcmd` line.
3. (optional) the fallback password under `chpasswd`.

## Wiring it into Proxmox

### Option A — Proxmox Cloud-Init tab (basic fields)
For simple cases, set user / SSH key / IP directly on the VM's **Cloud-Init** tab
in the Proxmox UI and just run `bootstrap.sh` after boot. No custom file needed.

### Option B — Custom user-data (full auto-deploy)
Use the snippet in this folder as a Proxmox *custom* cloud-init file:

```bash
# 1. Put the file on a storage that supports snippets (e.g. 'local')
mkdir -p /var/lib/vz/snippets
cp user-data.yaml /var/lib/vz/snippets/cmdb-user-data.yaml

# 2. Point the VM at it (VMID 9000 from the manual guide)
qm set 9000 --cicustom "user=local:snippets/cmdb-user-data.yaml"

# 3. Still set network + (optionally) an SSH key via the normal cloud-init fields
qm set 9000 --ipconfig0 ip=192.168.1.50/24,gw=192.168.1.1
qm set 9000 --nameserver 8.8.8.8

# 4. Regenerate the cloud-init image and boot
qm cloudinit update 9000
qm start 9000
```

On first boot the VM installs everything and starts the stack. Watch the serial
console (`qm terminal 9000`) or just wait ~5 minutes and browse to
`http://192.168.1.50:8080`.

## Verifying
```bash
ssh vfadmin@192.168.1.50 'systemctl --user list-timers vf-cmdb-*'
curl -fsS http://192.168.1.50:8000/health
```
