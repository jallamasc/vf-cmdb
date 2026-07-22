#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Day-to-day helper for the Virtualfactor IT CMDB Hyper-V VM.

.DESCRIPTION
    Small convenience wrapper around the Hyper-V cmdlets so you never have to
    remember them. Covers the common operations: find the IP, open the app,
    SSH in, start/stop, snapshot (checkpoint), and delete.

.PARAMETER Action
    ip        Show the VM's IPv4 address (waits until one is assigned).
    open      Open the Web UI in your default browser.
    ssh       Open an SSH session (vfadmin@<ip>).
    start     Start the VM.
    stop      Gracefully shut down the VM.
    restart   Restart the VM.
    status    Show VM state, uptime and networking.
    snapshot  Create a checkpoint (name via -SnapshotName, default timestamp).
    connect   Open the Hyper-V console window (vmconnect).
    remove    Delete the VM AND its disks (asks for confirmation).

.PARAMETER VMName
    VM name. Default: vf-cmdb.

.PARAMETER SnapshotName
    Optional checkpoint name for -Action snapshot.

.EXAMPLE
    .\Manage-CmdbVM.ps1 -Action ip
.EXAMPLE
    .\Manage-CmdbVM.ps1 -Action open
.EXAMPLE
    .\Manage-CmdbVM.ps1 -Action snapshot -SnapshotName "before-upgrade"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet("ip","open","ssh","start","stop","restart","status","snapshot","connect","remove")]
    [string]$Action,
    [string]$VMName = "vf-cmdb",
    [string]$SnapshotName = ""
)

$ErrorActionPreference = "Stop"
function Die($m){ Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

if (-not (Get-VM -Name $VMName -ErrorAction SilentlyContinue)) {
    Die "VM '$VMName' not found. Create it with New-CmdbVM.ps1 (or pass -VMName)."
}

# Read the IP from the Hyper-V KVP exchange (works even when the integration
# 'IPAddresses' property is empty on some builds, as long as hv-kvp-daemon runs).
function Get-VMIPFromKvp {
    try {
        $vmWmi = Get-CimInstance -Namespace root\virtualization\v2 -ClassName Msvm_ComputerSystem `
                 -Filter "ElementName='$VMName'" -ErrorAction Stop
        $kvp = Get-CimAssociatedInstance -InputObject $vmWmi `
               -ResultClassName Msvm_KvpExchangeComponent -ErrorAction Stop
        foreach ($item in $kvp.GuestIntrinsicExchangeItems) {
            if ($item -match 'Name>NetworkAddressIPv4<' -or $item -match 'RtrNetworkAddressIPv4') {
                if ($item -match '<Data>([0-9\.;]+)</Data>') {
                    $addr = ($matches[1] -split ';' | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -ne '127.0.0.1' } | Select-Object -First 1)
                    if ($addr) { return $addr }
                }
            }
        }
    } catch { Write-Verbose "KVP lookup failed: $($_.Exception.Message)" }
    return $null
}

function Get-VMIPv4 {
    param([int]$TimeoutSec = 180)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        $ips = (Get-VMNetworkAdapter -VMName $VMName).IPAddresses |
               Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -ne '127.0.0.1' }
        if ($ips) { return $ips | Select-Object -First 1 }
        $kvpIp = Get-VMIPFromKvp
        if ($kvpIp) { return $kvpIp }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)
    return $null
}

switch ($Action) {
    "start"   { Start-VM -Name $VMName;  Write-Host "Started $VMName." -ForegroundColor Green }
    "stop"    { Stop-VM  -Name $VMName;  Write-Host "Stopped $VMName." -ForegroundColor Green }
    "restart" { Restart-VM -Name $VMName -Force; Write-Host "Restarted $VMName." -ForegroundColor Green }
    "connect" { & vmconnect.exe localhost $VMName }
    "status"  {
        Get-VM -Name $VMName | Format-List Name,State,CPUUsage,MemoryAssigned,Uptime,Status
        Get-VMNetworkAdapter -VMName $VMName | Format-List Name,SwitchName,IPAddresses
    }
    "ip" {
        Write-Host "Waiting for $VMName to report an IP..." -ForegroundColor Cyan
        $ip = Get-VMIPv4
        if ($ip) { Write-Host "IP: $ip" -ForegroundColor Green }
        else { Die "No IP yet. Ensure the VM is running and Integration Services are up." }
    }
    "open" {
        $ip = Get-VMIPv4 -TimeoutSec 30
        if (-not $ip) { Die "No IP available yet - try again shortly." }
        Start-Process "http://${ip}:8080"
        Write-Host "Opening http://${ip}:8080" -ForegroundColor Green
    }
    "ssh" {
        $ip = Get-VMIPv4 -TimeoutSec 30
        if (-not $ip) { Die "No IP available yet - try again shortly." }
        Write-Host "Connecting: ssh vfadmin@$ip" -ForegroundColor Cyan
        & ssh "vfadmin@$ip"
    }
    "snapshot" {
        if (-not $SnapshotName) { $SnapshotName = "cmdb-$(Get-Date -Format yyyyMMdd-HHmmss)" }
        Checkpoint-VM -Name $VMName -SnapshotName $SnapshotName
        Write-Host "Checkpoint created: $SnapshotName" -ForegroundColor Green
    }
    "remove" {
        $ans = Read-Host "Delete VM '$VMName' AND its virtual disks? Type YES to confirm"
        if ($ans -ne "YES") { Write-Host "Aborted."; break }
        $disks = (Get-VMHardDiskDrive -VMName $VMName).Path
        if ((Get-VM -Name $VMName).State -ne 'Off') { Stop-VM -Name $VMName -Force }
        Remove-VM -Name $VMName -Force
        foreach ($d in $disks) { if (Test-Path $d) { Remove-Item $d -Force } }
        Write-Host "Removed VM and disks." -ForegroundColor Green
    }
}
