---
inclusion: always
---

# Product — Virtualfactor IT CMDB

A self-hosted Configuration Management Database for the Virtualfactor home/lab
network. It replaces six Excel workbooks with a single source of truth for IT
infrastructure.

## What it manages
- Physical: sites, datacenters, floors, rooms, racks, rack units, power devices,
  patch panels, cables.
- Compute: physical servers, virtual machines, containers/apps, workstations.
- Network: network devices, device interfaces, VLANs, IPv4/IPv6 subnets.
- IPAM: subnets with utilization, next-free-IP, reserved pools.
- Audit: automatic changelog on every change.
- Integration: Ansible dynamic inventory + fact write-back.

## Core value
- Auto-generated hierarchical names (VF long/short names, TIA-606-B labels) so
  there is no manual concatenation and no broken references.
- Full IPAM with dual-stack IPv4/IPv6.
- Spreadsheet-like inline editing (AG Grid) for an Excel-familiar user.
- Complete audit trail.

## Deployment context
- Single user (the sysadmin). No authentication by design — runs on a private
  network. Do not add auth unless explicitly requested.
- Owner: Alejandro (jallamasc), Virtualfactor, Bogotá, Colombia (UTC-5).
- Target: Proxmox Ubuntu VM via Podman (rootless). Local dev at
  /Volumes/development/vf-cmdb.

## Hard product rules
- No credentials stored in the database — only Bitwarden references
  (`bitwarden_ref` text fields).
- Multi-site capable even though only the "Home" site exists today. Design for
  more sites.
- WLAN IPv4 ranges start at 192.168.100.0/24 and continue sequentially
  (100-103, 104-107, 108-111, 112-115). Resolved 2026-09-04.
