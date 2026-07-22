#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Zero-touch Hyper-V provisioner for the Virtualfactor IT CMDB.

.DESCRIPTION
    Creates a Generation-2 Hyper-V VM from the official Ubuntu cloud image and
    a cloud-init NoCloud seed, then boots it. On first boot cloud-init installs
    Podman, clones the repo and runs bootstrap.sh - the CMDB comes up on its own
    with NO manual OS install and NO clicking through an installer.

    This mirrors EXACTLY the Proxmox cloud-init path (same user-data), so what
    you test on your laptop is what you later run on Proxmox. When you are ready
    to migrate, use Export-CmdbForProxmox.ps1 + deploy/proxmox/import-from-hyperv.sh.

    The cloud-init seed disk is built in PURE PowerShell (a small FAT32 VHDX
    labelled CIDATA) - no Windows ADK / oscdimg required. The only external tool
    needed is qemu-img (to convert the .img cloud image to .vhdx); the script
    installs it automatically via winget/choco when missing.

.PARAMETER VMName
    Name of the Hyper-V VM. Default: vf-cmdb.

.PARAMETER Release
    Ubuntu release codename: 'jammy' (22.04) or 'noble' (24.04). Default: noble.
    NOTE: 24.04 ships Podman 4.x -> full Quadlet/systemd always-on. 22.04 ships
    Podman 3.4 -> the stack still runs (podman-compose fallback) but for the best
    parity with a modern Proxmox host, 24.04 is recommended.

.PARAMETER CpuCount
    vCPUs. Default: 2.

.PARAMETER MemoryGB
    RAM in GB (startup, dynamic). Default: 4.

.PARAMETER DiskGB
    OS disk size in GB. Default: 30.

.PARAMETER SwitchName
    Hyper-V virtual switch to attach. If omitted, the script auto-selects an
    existing External switch, otherwise the 'Default Switch' (NAT).

.PARAMETER SshPublicKeyPath
    Path to your SSH public key. Default: $HOME\.ssh\id_ed25519.pub (an ed25519
    keypair is generated automatically if none exists).

.PARAMETER RepoBranch
    Branch of the CMDB repo to deploy. Default: master.

.PARAMETER VMPath
    Root folder for VM files. Default: C:\HyperV\<VMName>.

.PARAMETER WorkDir
    Scratch folder for downloads/conversions. Default: C:\HyperV\_work.

.EXAMPLE
    # Simplest - accept all defaults (Ubuntu 24.04, 2 vCPU, 4 GB, Default Switch)
    .\New-CmdbVM.ps1

.EXAMPLE
    # Pin to an external switch and give it more resources
    .\New-CmdbVM.ps1 -SwitchName "External-LAN" -CpuCount 4 -MemoryGB 8 -DiskGB 40

.NOTES
    Run from an elevated PowerShell (Run as Administrator).
#>
[CmdletBinding()]
param(
    [string]$VMName            = "vf-cmdb",
    [ValidateSet("jammy","noble")]
    [string]$Release           = "noble",
    [int]$CpuCount             = 2,
    [int]$MemoryGB             = 4,
    [int]$DiskGB               = 30,
    [string]$SwitchName        = "",
    [string]$SshPublicKeyPath  = "",
    [string]$RepoBranch        = "master",
    [string]$VMPath            = "",
    [string]$WorkDir           = "C:\HyperV\_work"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step($m){ Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok($m){ Write-Host "    $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "    ! $m" -ForegroundColor Yellow }
function Die($m){ Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

# --------------------------------------------------------------------------
# 0. Pre-flight
# --------------------------------------------------------------------------
Write-Step "Pre-flight checks"
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
    Die "Hyper-V PowerShell module not found. Enable Hyper-V first:`n  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All`nthen reboot and re-run this script."
}
if (Get-VM -Name $VMName -ErrorAction SilentlyContinue) {
    Die "A VM named '$VMName' already exists. Remove it first or pass -VMName <other>."
}
if (-not $VMPath) { $VMPath = "C:\HyperV\$VMName" }
New-Item -ItemType Directory -Force -Path $VMPath  | Out-Null
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
Write-Ok "VM path : $VMPath"
Write-Ok "Work dir: $WorkDir"

# --------------------------------------------------------------------------
# 1. SSH key (create if missing)
# --------------------------------------------------------------------------
Write-Step "SSH key"
if (-not $SshPublicKeyPath) { $SshPublicKeyPath = Join-Path $HOME ".ssh\id_ed25519.pub" }
if (-not (Test-Path $SshPublicKeyPath)) {
    Write-Warn2 "No public key at $SshPublicKeyPath - generating an ed25519 keypair."
    $sshDir = Split-Path $SshPublicKeyPath
    New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
    $privPath = [System.IO.Path]::ChangeExtension($SshPublicKeyPath, $null).TrimEnd('.')
    if (-not (Get-Command ssh-keygen -ErrorAction SilentlyContinue)) {
        Die "ssh-keygen not found. Install the Windows OpenSSH client (Settings > Optional Features) or pass -SshPublicKeyPath."
    }
    & ssh-keygen -t ed25519 -N '""' -f $privPath -C "$env:USERNAME@$VMName" | Out-Null
}
$SshPublicKey = (Get-Content -Raw $SshPublicKeyPath).Trim()
Write-Ok "Using public key: $SshPublicKeyPath"

# --------------------------------------------------------------------------
# 2. Virtual switch
# --------------------------------------------------------------------------
Write-Step "Virtual switch"
if (-not $SwitchName) {
    $ext = Get-VMSwitch -SwitchType External -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ext) {
        $SwitchName = $ext.Name
        Write-Ok "Auto-selected External switch: $SwitchName (VM will be reachable on your LAN)"
    } elseif (Get-VMSwitch -Name "Default Switch" -ErrorAction SilentlyContinue) {
        $SwitchName = "Default Switch"
        Write-Warn2 "No External switch found - using 'Default Switch' (NAT)."
        Write-Warn2 "With NAT the VM gets a private IP; reach it from THIS host only."
        Write-Warn2 "For LAN access create an External switch and re-run with -SwitchName."
    } else {
        Die "No usable virtual switch found. Create one in Hyper-V Manager (External recommended) and pass -SwitchName."
    }
} else {
    if (-not (Get-VMSwitch -Name $SwitchName -ErrorAction SilentlyContinue)) {
        Die "Virtual switch '$SwitchName' not found."
    }
    Write-Ok "Using switch: $SwitchName"
}

# --------------------------------------------------------------------------
# 3. Ensure qemu-img (for .img -> .vhdx conversion)
# --------------------------------------------------------------------------
Write-Step "qemu-img (image conversion tool)"
function Resolve-QemuImg {
    $cmd = Get-Command qemu-img -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @("C:\Program Files\qemu\qemu-img.exe","C:\Program Files\qemu\qemu-img","$env:ProgramData\chocolatey\bin\qemu-img.exe")) {
        if (Test-Path $p) { return $p }
    }
    return $null
}
$qemu = Resolve-QemuImg
if (-not $qemu) {
    Write-Warn2 "qemu-img not found - attempting automatic install."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        try { & winget install --exact --id qemu.qemu --accept-package-agreements --accept-source-agreements --silent | Out-Null }
        catch { Write-Warn2 "winget install attempt failed: $($_.Exception.Message)" }
    }
    $qemu = Resolve-QemuImg
    if (-not $qemu -and (Get-Command choco -ErrorAction SilentlyContinue)) {
        try { & choco install qemu -y | Out-Null }
        catch { Write-Warn2 "choco install attempt failed: $($_.Exception.Message)" }
        $qemu = Resolve-QemuImg
    }
}
if (-not $qemu) {
    Die "qemu-img could not be installed automatically. Install it manually, then re-run:`n   winget install qemu.qemu        (Windows 10 2004+/11)`n   -- or --  choco install qemu`nEnsure qemu-img.exe is on PATH (typically C:\Program Files\qemu)."
}
Write-Ok "qemu-img: $qemu"

# --------------------------------------------------------------------------
# 4. Download Ubuntu cloud image & convert to VHDX
# --------------------------------------------------------------------------
Write-Step "Ubuntu cloud image ($Release)"
$imgUrl  = "https://cloud-images.ubuntu.com/$Release/current/$Release-server-cloudimg-amd64.img"
$imgFile = Join-Path $WorkDir "$Release-server-cloudimg-amd64.img"
if (-not (Test-Path $imgFile)) {
    Write-Ok "Downloading $imgUrl"
    try {
        $bits = Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue
        if ($bits) { Start-BitsTransfer -Source $imgUrl -Destination $imgFile }
        else { Invoke-WebRequest -Uri $imgUrl -OutFile $imgFile }
    } catch { Die "Download failed: $($_.Exception.Message)" }
} else {
    Write-Ok "Cloud image already downloaded (cached)."
}

$osVhdx = Join-Path $VMPath "$VMName-os.vhdx"
# Resize at the qcow2 level FIRST, then convert to VHDX. Two reasons:
#   * Hyper-V's Resize-VHD refuses to resize the sparse VHDX (0xC03A001A).
#   * Many qemu builds' VHDX driver does not support 'qemu-img resize' at all
#     ("Image format driver does not support resize").
# qcow2 resize is always supported, so we grow a working qcow2 copy, then convert.
$workQcow = Join-Path $WorkDir "$VMName-os-work.qcow2"
if (Test-Path $workQcow) { Remove-Item $workQcow -Force }
Write-Ok "Preparing working qcow2 copy"
& $qemu convert -f qcow2 -O qcow2 $imgFile $workQcow
if ($LASTEXITCODE -ne 0) { Die "qemu-img convert (qcow2 working copy) failed." }
Write-Ok "Resizing (qcow2) to ${DiskGB}GB"
& $qemu resize $workQcow "${DiskGB}G"
if ($LASTEXITCODE -ne 0) { Die "qemu-img resize failed." }
Write-Ok "Converting resized image -> $osVhdx"
& $qemu convert -f qcow2 -O vhdx -o subformat=dynamic $workQcow $osVhdx
if ($LASTEXITCODE -ne 0) { Die "qemu-img convert (vhdx) failed." }
Remove-Item $workQcow -Force -ErrorAction SilentlyContinue

# qemu-img on Windows marks its output with the NTFS "sparse" attribute, which
# Hyper-V refuses to attach (error 0xC03A001A "must not be sparse"). Clear it.
Write-Ok "Clearing sparse attribute on VHDX (Hyper-V requirement)"
& fsutil sparse setflag "$osVhdx" 0 | Out-Null
$sparseState = (& fsutil sparse queryflag "$osVhdx") 2>$null
if ($sparseState -match "is set") {
    # fsutil couldn't clear it (rare) -> rewrite via a plain copy, which drops
    # the sparse flag, then swap the files.
    Write-Warn2 "Sparse flag still set - rewriting file via copy to remove it."
    $tmpCopy = "$osVhdx.nonsparse"
    Copy-Item -LiteralPath $osVhdx -Destination $tmpCopy -Force
    Remove-Item -LiteralPath $osVhdx -Force
    Move-Item  -LiteralPath $tmpCopy -Destination $osVhdx -Force
    & fsutil sparse setflag "$osVhdx" 0 | Out-Null
}

# --------------------------------------------------------------------------
# 5. Build cloud-init NoCloud seed disk (pure PowerShell, no ADK)
# --------------------------------------------------------------------------
Write-Step "cloud-init seed disk"
$tmplDir  = Join-Path $PSScriptRoot "cloud-init"
$userTmpl = Join-Path $tmplDir "user-data.tmpl.yaml"
$metaTmpl = Join-Path $tmplDir "meta-data.tmpl.yaml"
if (-not (Test-Path $userTmpl)) { Die "Template not found: $userTmpl" }

$userData = (Get-Content -Raw $userTmpl).
    Replace("__SSH_PUBLIC_KEY__", $SshPublicKey).
    Replace("__HOSTNAME__",       $VMName).
    Replace("__REPO_BRANCH__",    $RepoBranch)
$metaData = (Get-Content -Raw $metaTmpl).
    Replace("__HOSTNAME__",   $VMName).
    Replace("__INSTANCE_ID__", "iid-$VMName-$(Get-Date -Format yyyyMMddHHmmss)")

# stage files (LF line endings - important for cloud-init/YAML)
$stage = Join-Path $WorkDir "seed-$VMName"
New-Item -ItemType Directory -Force -Path $stage | Out-Null
[System.IO.File]::WriteAllText((Join-Path $stage "user-data"), ($userData -replace "`r`n","`n"))
[System.IO.File]::WriteAllText((Join-Path $stage "meta-data"), ($metaData -replace "`r`n","`n"))

$seedVhdx = Join-Path $VMPath "$VMName-seed.vhdx"
if (Test-Path $seedVhdx) { Remove-Item $seedVhdx -Force }
Write-Ok "Creating FAT32 seed VHDX labelled CIDATA"
New-VHD -Path $seedVhdx -SizeBytes 64MB -Dynamic | Out-Null
$disk = Mount-VHD -Path $seedVhdx -Passthru | Get-Disk
Initialize-Disk -Number $disk.Number -PartitionStyle MBR -Confirm:$false | Out-Null
$part = New-Partition -DiskNumber $disk.Number -UseMaximumSize -AssignDriveLetter
Format-Volume -Partition $part -FileSystem FAT32 -NewFileSystemLabel "CIDATA" -Confirm:$false | Out-Null
$drv  = "$($part.DriveLetter):"
Copy-Item (Join-Path $stage "user-data") "$drv\user-data" -Force
Copy-Item (Join-Path $stage "meta-data") "$drv\meta-data" -Force
Dismount-VHD -Path $seedVhdx
Write-Ok "Seed disk ready: $seedVhdx"

# --------------------------------------------------------------------------
# 6. Create the VM
# --------------------------------------------------------------------------
Write-Step "Creating Generation-2 VM"
New-VM -Name $VMName -Generation 2 -MemoryStartupBytes ($MemoryGB * 1GB) `
        -VHDPath $osVhdx -SwitchName $SwitchName -Path $VMPath | Out-Null
# Keep the dynamic-memory floor at/below the requested size (avoids min>max when MemoryGB<2).
$memMaxBytes = [int64]$MemoryGB * 1GB
$memMinBytes = [Math]::Min([int64]2GB, $memMaxBytes)
Set-VM -Name $VMName -ProcessorCount $CpuCount `
       -DynamicMemory -MemoryMinimumBytes $memMinBytes -MemoryMaximumBytes $memMaxBytes `
       -AutomaticStartAction Start -AutomaticStopAction ShutDown -CheckpointType Disabled
# Ubuntu cloud images are signed for the Microsoft UEFI CA -> keep Secure Boot ON with that template
Set-VMFirmware -VMName $VMName -EnableSecureBoot On -SecureBootTemplate MicrosoftUEFICertificateAuthority
# attach the cloud-init seed as a second SCSI disk
Add-VMHardDiskDrive -VMName $VMName -Path $seedVhdx
# boot from the OS disk
$osDrive = Get-VMHardDiskDrive -VMName $VMName | Where-Object { $_.Path -eq $osVhdx }
Set-VMFirmware -VMName $VMName -FirstBootDevice $osDrive
Write-Ok "VM created: $CpuCount vCPU, ${MemoryGB}GB RAM, ${DiskGB}GB disk, switch '$SwitchName'"

# --------------------------------------------------------------------------
# 7. Start
# --------------------------------------------------------------------------
Write-Step "Starting VM (cloud-init will deploy the CMDB automatically)"
Start-VM -Name $VMName
Write-Ok "VM '$VMName' started."

Write-Host @"

  +-----------------------------------------------------------+
  |  Virtualfactor IT CMDB - Hyper-V VM is provisioning       |
  +-----------------------------------------------------------+
  First boot installs Podman, clones the repo and deploys the
  stack. Allow ~5-8 minutes on first run.

  Find the VM's IP address (three easy ways):
     1) .\Manage-CmdbVM.ps1 -VMName $VMName -Action ip
     2) Open the console (.\Manage-CmdbVM.ps1 -Action connect) - the IP and
        all URLs are printed right on the LOGIN SCREEN, no login needed.
        (If it still says '\4', press Enter once to refresh, or wait for the
        network to come up.)
     3) Hyper-V Manager -> $VMName -> Networking tab

  Console / SSH credentials:
     SSH (preferred) : vfadmin@<VM-IP>   using key $SshPublicKeyPath
     Console login   : vfadmin / changeme-on-first-login

  Then browse from your laptop:
     Web UI   : http://<VM-IP>:8080
     API docs : http://<VM-IP>:8000/docs
     pgAdmin  : http://<VM-IP>:5050

  Connect VS Code Remote-SSH:
     ssh vfadmin@<VM-IP>       (key: $SshPublicKeyPath)

  When ready to move to Proxmox:
     .\Export-CmdbForProxmox.ps1 -VMName $VMName

"@ -ForegroundColor White
