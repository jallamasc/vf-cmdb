#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Prepare the CMDB Hyper-V VM's disk for migration to Proxmox.

.DESCRIPTION
    Cleanly shuts the VM down, locates its OS disk, and converts it to a
    Proxmox-friendly qcow2 image with qemu-img. Prints the exact scp + import
    commands to run next. The heavy lifting on the Proxmox side is done by
    deploy/proxmox/import-from-hyperv.sh (fully scripted - one command).

    Recommended: before exporting, take a fresh CMDB backup INSIDE the VM and
    copy it off - the DB data lives in the disk image you are exporting, but an
    independent backup archive is your safety net:
        ssh vfadmin@<vm-ip> '~/vf-cmdb/deploy/scripts/vf-cmdb-backup.sh'

.PARAMETER VMName
    VM to export. Default: vf-cmdb.

.PARAMETER OutputDir
    Where to write the converted image. Default: C:\HyperV\_export.

.PARAMETER Format
    Target format: 'qcow2' (default, recommended for Proxmox) or 'raw'.

.PARAMETER KeepRunning
    Do NOT shut the VM down first (NOT recommended - risks an inconsistent
    image). By default the VM is gracefully stopped before conversion.

.EXAMPLE
    .\Export-CmdbForProxmox.ps1
.EXAMPLE
    .\Export-CmdbForProxmox.ps1 -VMName vf-cmdb -Format qcow2
#>
[CmdletBinding()]
param(
    [string]$VMName    = "vf-cmdb",
    [string]$OutputDir = "C:\HyperV\_export",
    [ValidateSet("qcow2","raw")]
    [string]$Format    = "qcow2",
    [switch]$KeepRunning
)

$ErrorActionPreference = "Stop"
function Write-Step($m){ Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok($m){ Write-Host "    $m" -ForegroundColor Green }
function Die($m){ Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

function Resolve-QemuImg {
    $cmd = Get-Command qemu-img -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @("C:\Program Files\qemu\qemu-img.exe","$env:ProgramData\chocolatey\bin\qemu-img.exe")) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

$vm = Get-VM -Name $VMName -ErrorAction SilentlyContinue
if (-not $vm) { Die "VM '$VMName' not found." }
$qemu = Resolve-QemuImg
if (-not $qemu) { Die "qemu-img not found. Install it (winget install qemu.qemu) and re-run." }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Identify the OS disk (the one whose name ends in -os.vhdx, else the largest).
Write-Step "Locating OS disk"
$disks = Get-VMHardDiskDrive -VMName $VMName
if (-not $disks) { Die "VM has no virtual disks?" }
$osDisk = $disks | Where-Object { $_.Path -match '-os\.vhdx$' } | Select-Object -First 1
if (-not $osDisk) {
    $osDisk = $disks | Sort-Object { (Get-Item $_.Path).Length } -Descending | Select-Object -First 1
    Write-Ok "No '-os.vhdx' found; using largest disk: $($osDisk.Path)"
} else {
    Write-Ok "OS disk: $($osDisk.Path)"
}

# Shut down for a consistent image.
if (-not $KeepRunning) {
    if ($vm.State -ne 'Off') {
        Write-Step "Shutting down $VMName for a consistent image"
        Stop-VM -Name $VMName
        Write-Ok "VM stopped."
    }
} else {
    Write-Host "    ! -KeepRunning set: converting a live disk may be inconsistent." -ForegroundColor Yellow
}

# Convert.
$outName = "$VMName-os.$Format"
$outPath = Join-Path $OutputDir $outName
Write-Step "Converting to $Format -> $outPath"
if (Test-Path $outPath) { Remove-Item $outPath -Force }
if ($Format -eq "qcow2") {
    & $qemu convert -p -f vhdx -O qcow2 -o compat=1.1 $osDisk.Path $outPath
} else {
    & $qemu convert -p -f vhdx -O raw $osDisk.Path $outPath
}
if ($LASTEXITCODE -ne 0) { Die "qemu-img convert failed." }
$sizeMB = [math]::Round((Get-Item $outPath).Length / 1MB, 1)
Write-Ok "Done: $outPath ($sizeMB MB)"

Write-Host @"

  +-----------------------------------------------------------+
  |  Ready to migrate to Proxmox                              |
  +-----------------------------------------------------------+

  1) Copy the image to your Proxmox host:
       scp "$outPath" root@<PROXMOX-IP>:/var/lib/vz/template/

  2) Copy the import script (once):
       scp deploy\proxmox\import-from-hyperv.sh root@<PROXMOX-IP>:/root/

  3) On the Proxmox host, run ONE command:
       bash /root/import-from-hyperv.sh \
            --disk /var/lib/vz/template/$outName \
            --vmid 9000 --name $VMName \
            --storage local-lvm --bridge vmbr0

     (add --ip 192.168.1.50/24 --gw 192.168.1.1 for a static IP;
      omit for DHCP)

  The script creates the VM, imports the disk, wires up boot/network and
  starts it. Same containers, same data - now on Proxmox.

"@ -ForegroundColor White
