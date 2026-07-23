#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Virtualfactor IT CMDB — import a Hyper-V-exported disk into Proxmox
#
# Takes the qcow2/raw/vhdx image produced by Export-CmdbForProxmox.ps1 and turns
# it into a running Proxmox VM in ONE command: creates the VM, imports the disk,
# attaches EFI + cloud-init, wires up boot order and networking, then starts it.
#
# Because the exported disk ALREADY contains the fully-deployed CMDB (Podman,
# containers, data, timers), nothing needs to be reinstalled — it just boots.
#
# Run this ON THE PROXMOX HOST as root.
#
# Usage:
#   bash import-from-hyperv.sh --disk /path/to/vf-cmdb-os.qcow2 \
#        --vmid 9000 --name vf-cmdb --storage local-lvm --bridge vmbr0 \
#        [--ip 192.168.1.50/24 --gw 192.168.1.1] [--cores 2] [--memory 4096] \
#        [--sshkey /root/.ssh/authorized_keys] [--no-start]
#
# Defaults: vmid=9000 name=vf-cmdb storage=local-lvm bridge=vmbr0
#           cores=2 memory=4096  network=DHCP
# ---------------------------------------------------------------------------
set -euo pipefail

DISK="" ; VMID="9000" ; NAME="vf-cmdb" ; STORAGE="local-lvm" ; BRIDGE="vmbr0"
CORES="2" ; MEMORY="4096" ; IPCONF="" ; GW="" ; SSHKEY="" ; START=1

die(){ echo -e "\033[31mERROR:\033[0m $*" >&2; exit 1; }
log(){ echo -e "\033[36m==>\033[0m $*"; }
ok(){  echo -e "    \033[32m$*\033[0m"; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --disk)    DISK="$2"; shift 2;;
        --vmid)    VMID="$2"; shift 2;;
        --name)    NAME="$2"; shift 2;;
        --storage) STORAGE="$2"; shift 2;;
        --bridge)  BRIDGE="$2"; shift 2;;
        --cores)   CORES="$2"; shift 2;;
        --memory)  MEMORY="$2"; shift 2;;
        --ip)      IPCONF="$2"; shift 2;;
        --gw)      GW="$2"; shift 2;;
        --sshkey)  SSHKEY="$2"; shift 2;;
        --no-start) START=0; shift;;
        -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
        *) die "Unknown argument: $1";;
    esac
done

# --- Pre-flight ------------------------------------------------------------
command -v qm >/dev/null || die "qm not found — run this on the Proxmox host as root."
command -v qemu-img >/dev/null || die "qemu-img not found (expected on Proxmox)."
[[ -n "$DISK" ]] || die "--disk is required."
[[ -f "$DISK" ]] || die "Disk image not found: $DISK"
if qm status "$VMID" >/dev/null 2>&1; then
    die "VMID $VMID already exists. Choose another --vmid or destroy it: qm destroy $VMID"
fi

# --- Normalise the disk to qcow2 -------------------------------------------
log "Preparing disk image"
SRC_FMT="${DISK##*.}"
WORK_QCOW="/var/tmp/${NAME}-import.qcow2"
case "$SRC_FMT" in
    qcow2) ok "Already qcow2 — using as-is."; WORK_QCOW="$DISK";;
    raw)   ok "Converting raw -> qcow2";  qemu-img convert -p -f raw  -O qcow2 "$DISK" "$WORK_QCOW";;
    vhdx)  ok "Converting vhdx -> qcow2"; qemu-img convert -p -f vhdx -O qcow2 "$DISK" "$WORK_QCOW";;
    img)   ok "Converting img -> qcow2";  qemu-img convert -p -O qcow2 "$DISK" "$WORK_QCOW";;
    *) die "Unsupported disk format: .$SRC_FMT (expected qcow2/raw/vhdx/img)";;
esac

# --- Create the VM shell ---------------------------------------------------
log "Creating VM $VMID ($NAME)"
qm create "$VMID" \
    --name "$NAME" \
    --memory "$MEMORY" \
    --cores "$CORES" \
    --cpu host \
    --machine q35 \
    --bios ovmf \
    --scsihw virtio-scsi-pci \
    --net0 "virtio,bridge=${BRIDGE}" \
    --ostype l26 \
    --agent enabled=1
ok "VM shell created (q35 + OVMF/UEFI, matching the Hyper-V Gen-2 VM)."

# --- EFI disk (required for OVMF) ------------------------------------------
log "Adding EFI disk"
qm set "$VMID" --efidisk0 "${STORAGE}:0,efitype=4m,pre-enrolled-keys=0"

# --- Import the OS disk -----------------------------------------------------
log "Importing OS disk into $STORAGE (this can take a minute)"
qm importdisk "$VMID" "$WORK_QCOW" "$STORAGE" >/tmp/importdisk.$$ 2>&1 || {
    cat /tmp/importdisk.$$; die "importdisk failed."
}
cat /tmp/importdisk.$$; rm -f /tmp/importdisk.$$
# The freshly imported disk shows up as an unused volume — attach it as scsi0.
UNUSED="$(qm config "$VMID" | awk -F': ' '/^unused0:/{print $2}')"
[[ -n "$UNUSED" ]] || die "Could not find the imported (unused0) disk in VM config."
qm set "$VMID" --scsi0 "${UNUSED},discard=on,ssd=1"
ok "OS disk attached as scsi0."

# --- Cloud-init drive + networking -----------------------------------------
log "Configuring boot, cloud-init and networking"
qm set "$VMID" --ide2 "${STORAGE}:cloudinit"
qm set "$VMID" --boot "order=scsi0"
qm set "$VMID" --serial0 socket --vga serial0
qm set "$VMID" --ciuser vfadmin
[[ -n "$SSHKEY" && -f "$SSHKEY" ]] && qm set "$VMID" --sshkeys "$SSHKEY"
if [[ -n "$IPCONF" ]]; then
    if [[ -n "$GW" ]]; then qm set "$VMID" --ipconfig0 "ip=${IPCONF},gw=${GW}"
    else                    qm set "$VMID" --ipconfig0 "ip=${IPCONF}"; fi
    ok "Static IP: $IPCONF ${GW:+gw $GW}"
else
    qm set "$VMID" --ipconfig0 "ip=dhcp"
    ok "Networking: DHCP"
fi

# --- Resize (optional headroom) & start ------------------------------------
qm resize "$VMID" scsi0 +0G >/dev/null 2>&1 || true

echo
ok "VM $VMID ($NAME) is ready."
if [[ "$START" -eq 1 ]]; then
    log "Starting VM $VMID"
    qm start "$VMID"
    cat <<EOF

  +-----------------------------------------------------------+
  |  CMDB migrated to Proxmox and starting                    |
  +-----------------------------------------------------------+
  The containers auto-start (Podman restart/Quadlet). Give it ~1-2 min.

  Find the IP (if DHCP):    qm guest cmd $VMID network-get-interfaces
  Console:                  qm terminal $VMID   (Ctrl-] to exit)

  Then browse:   http://<vm-ip>:8080   (API :8000/docs, pgAdmin :5050)
  SSH:           ssh vfadmin@<vm-ip>

  Verify the stack:
     ssh vfadmin@<vm-ip> 'systemctl --user list-timers vf-cmdb-*; curl -fsS localhost:8000/health'
EOF
else
    echo "  --no-start given. Launch later with:  qm start $VMID"
fi
