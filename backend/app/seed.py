"""Seed the CMDB with initial data extracted from the source Excel files.

Idempotent: if the ``organizations`` table already has rows the seeder exits
without touching the database.
"""
from __future__ import annotations

import asyncio
import json
import os

from sqlalchemy import func, select

from . import models, naming
from .database import AsyncSessionLocal

HERE = os.path.dirname(__file__)

# ---------------------------------------------------------------------------
# Lookup dictionaries: slug -> list of (full_name, abbreviation, max_length)
# ---------------------------------------------------------------------------
LOOKUPS: dict = {
    models.Organization: [
        ("Virtualfactor", "vf", 2), ("Empresa", "em", 2), ("Cybertronika", "cb", 2),
    ],
    models.Cloud: [
        ("Amazon Web Services", "aw", 2), ("IBM Cloud", "ic", 2),
        ("Microsoft Azure", "az", 2), ("Oracle Cloud", "oc", 2),
        ("Virtualfactor Storm", "vs", 2),
    ],
    models.Region: [
        ("Central Colombia 1", "cc", 3), ("EastUS 1", "eu1", 3),
    ],
    models.Campus: [
        ("Headquarters", "hq", 2), ("Home", "hm", 2),
    ],
    models.Building: [
        ("Main Building 1", "M1", 4), ("Secondary Building 1", "S1", 4),
    ],
    models.FloorSection: [
        ("Floor 1 Section 1", "+F1S1", 5),
    ],
    models.ComputeDeviceType: [
        ("Desktop / Workstation", "ws", 2), ("Laptop", "lp", 2),
        ("Physical Server", "ps", 2), ("Virtual Desktop / Workstation", "vw", 2),
        ("Virtual Server", "vs", 2),
    ],
    models.Brand: [
        ("Apple", "ap", 3), ("MSI", "msi", 3), ("Hewlett Packard", "hp", 3),
        ("Hewlett Packard Enterprise", "hpe", 3), ("Lenovo", "ln", 3),
        ("Seagate", "sgt", 3), ("Western Digital", "wd", 3), ("Linksys", "ls", 3),
        ("Combodo", "cm", 3), ("Oracle", "or", 3), ("Generic", "ge", 3),
        ("Arista", "ar", 3), ("Aruba", "arb", 3), ("3Com", "3c", 3),
        ("TP-Link", "tp", 3), ("Xiaomi", "xi", 3),
    ],
    models.DeviceRole: [
        ("Working Machine", "wm", 3), ("Backup Disk", "bd", 3),
        ("Hypervisor", "hv", 3), ("Virtual Machine Template", "vmt", 3),
        ("FOG", "fog", 3), ("External Drive", "mdr", 3), ("Branch AP", "bap", 3),
        ("Firewall", "frw", 3), ("Firewall (service)", "fw", 3),
        ("Application", "ap", 3), ("Database", "db", 3), ("Proxy", "pr", 3),
        ("Instance", "in", 3), ("All-in-one", "all", 3), ("Management", "mg", 3),
    ],
    models.NetworkDeviceType: [
        ("Firewall", "fw", 3), ("Load Balancer", "lb", 3), ("Router", "ro", 3),
        ("Switch", "sw", 3), ("Security Appliance / Firewall", "sa", 3),
        ("Virtual Switch", "vs", 3), ("Virtual Distributed Switch", "vds", 3),
        ("Standard Portgroup", "sp", 3), ("Distributed Portgroup", "dp", 3),
        ("Wireless Device", "wd", 3), ("Modem", "mo", 3),
        ("Satellital Antenna Kit", "sk", 3),
    ],
    models.NetworkSubtype: [
        ("Core", "c", 1), ("Edge", "e", 1), ("Router", "r", 1),
        ("Antenna", "a", 1), ("Spine", "s", 1),
    ],
    models.OsFamily: [
        ("ESXi", "es", 2), ("Hyper-V", "hv", 2), ("Linux", "ln", 2),
        ("Windows", "wn", 2), ("BSD", "bs", 2), ("OpnSense", "op", 2),
        ("Proxmox", "pr", 2),
    ],
    models.OsVersion: [
        ("Windows 10 Pro", "10p", 4), ("Windows 10 Enterprise", "10e", 4),
        ("Windows Server 2016", "s16", 4), ("Windows Server 2019", "s19", 4),
        ("Ubuntu 18", "u18", 4), ("CentOS 8", "c8", 4),
        ("OpenSense 21", "o21", 4), ("Proxmox 7", "p7", 4),
        ("Ubuntu 18.04", "v04", 5),
    ],
    models.AppType: [
        ("iTop", "it", 5), ("OCS Inventory", "oi", 5), ("OpenProject", "op", 5),
        ("Azure DNS Updater", "adu", 5), ("Traefik", "tr", 5), ("Mailu", "ml", 5),
        ("Certbot", "crt", 5),
    ],
    models.ClusterType: [
        ("Management", "mng", 3), ("Processing", "prc", 3),
    ],
    models.StorageDeviceType: [
        ("Storage Array", "sa", 2), ("Volume", "vl", 2), ("Disk", "dk", 2),
        ("Disk Group / RAID", "dg", 2), ("Volume Group", "vg", 2),
        ("Mobile Drive", "md", 2),
    ],
    models.NetworkIdType: [
        ("Wireless Network", "wn", 3), ("Cable Network", "cn", 3),
    ],
}


async def _seed_lookups(session) -> dict:
    """Insert lookups and return {model: {abbreviation: id}}."""
    maps: dict = {}
    for model, rows in LOOKUPS.items():
        maps[model] = {}
        for full_name, abbr, max_len in rows:
            obj = model(full_name=full_name, abbreviation=abbr, max_length=max_len)
            session.add(obj)
            await session.flush()
            maps[model][abbr] = obj.id
    return maps


async def _log_create(session, obj) -> None:
    """Record a compact import changelog entry for a seeded row."""
    session.add(
        models.ChangeLog(
            table_name=obj.__tablename__,
            record_id=obj.id,
            field_name="__created__",
            old_value=None,
            new_value=getattr(obj, "vf_short_name", None)
            or getattr(obj, "vf_long_name", None)
            or getattr(obj, "simple_name", None)
            or str(obj.id),
            change_source="import",
        )
    )


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(func.count()).select_from(models.Organization))
        if int(existing.scalar() or 0) > 0:
            print("Database already seeded; skipping.")
            return

        m = await _seed_lookups(session)
        ORG = m[models.Organization]; CLOUD = m[models.Cloud]; REGION = m[models.Region]
        CAMPUS = m[models.Campus]; BUILDING = m[models.Building]; FS = m[models.FloorSection]
        CDT = m[models.ComputeDeviceType]; BRAND = m[models.Brand]; ROLE = m[models.DeviceRole]
        NDT = m[models.NetworkDeviceType]; NST = m[models.NetworkSubtype]
        OSF = m[models.OsFamily]; OSV = m[models.OsVersion]; APP = m[models.AppType]

        # ---- Reference data: site addresses (NOT naming conventions) ----
        home_address = models.SiteAddress(
            label="Home Datacenter — Bogota",
            street="1st Floor",
            city="Bogota",
            state_region="Cundinamarca",
            country="Colombia",
            notes="Primary home lab location",
        )
        session.add(home_address)
        await session.flush()

        # ---- Site: Home Datacenter (Korriban) ----
        site = models.Site(
            description="Bogota, Home, 1st Floor Datacenter",
            organization_id=ORG["vf"], cloud_id=CLOUD["vs"], region_id=REGION["cc"],
            campus_id=CAMPUS["hm"], building_id=BUILDING["M1"], floor_section_id=FS["+F1S1"],
            site_address_id=home_address.id,
            simple_name="Korriban",
        )
        session.add(site)
        await session.flush()
        await naming.generate_site(session, site)
        await session.flush()

        # ---- Rack AA01 ----
        rack = models.Rack(
            site_id=site.id, grid_coordinates="AA01", total_units=36,
            description="Home datacenter primary rack", simple_name="AA01",
        )
        session.add(rack)
        await session.flush()
        await naming.generate_rack(session, rack)
        await session.flush()

        # ---- Rack units (from Rack.xlsx layout) ----
        rack_layout = [
            (36, "patchpanel", "Patch Panel"),
            (35, "pdu", "PDU"),
            (34, "server", "TP-LINK ARCHER A6  S/N 219C904002565"),
            (33, "server", "TP-LINK ARCHER A6  S/N 219C904002562"),
            (32, "switch", "3COM 3CDS G8  S/N AA/2AFGBXP293B20"),
            (29, "server", "HPE PROLIANT GEN10 PLUS V2  S/N MXQ3240CGQ  P/N P54654-001"),
            (26, "switch", "HP A5120-1  S/N CN29BYS073  P/N JE067A"),
            (22, "server", "D2000  S/N 5C715P44M  P/N AJ940A"),
            (21, "server", "DL560 G8  S/N 2M234602KG  P/N 697607-S01"),
            (20, "server", "DL560 G8  S/N 2M234602KB  P/N 697607-S01"),
            (2, "pdu", "PDU"),
            (1, "ups", "Power Supply"),
        ]
        occupied = {u for u, _, _ in rack_layout}
        for u in range(1, 37):
            if u in occupied:
                dt, label = next((d, l) for uu, d, l in rack_layout if uu == u)
            else:
                dt, label = "empty", None
            session.add(models.RackUnit(
                rack_id=rack.id, unit_number=u, device_type=dt, label=label,
                height_units=1, side="front",
            ))

        # ---- Power devices ----
        session.add_all([
            models.PowerDevice(site_id=site.id, rack_id=rack.id, device_type="pdu",
                               device_number=1, brand="Generic", model="PDU"),
            models.PowerDevice(site_id=site.id, rack_id=rack.id, device_type="ups",
                               device_number=1, brand="APC", model="SRV3KA",
                               serial_number="9S1926A54611"),
        ])

        # ---- Patch panel ----
        pp = models.PatchPanel(rack_id=rack.id, rack_unit=36, port_count=48,
                               panel_id_label="AA01-48", side="front")
        session.add(pp)
        await session.flush()
        for p in range(1, 49):
            session.add(models.PatchPanelPort(patch_panel_id=pp.id, port_number=p))

        # ---- VLANs + subnets + role assignments ----
        with open(os.path.join(HERE, "seed_subnets.json")) as f:
            subnet_data = json.load(f)

        vlan_by_id: dict[int, int] = {}
        subnet4_by_vlan: dict[int, int] = {}
        for s in subnet_data["subnets_ipv4"]:
            vid = s["vlan_id"]
            vlan_pk = None
            if vid is not None and vid not in vlan_by_id:
                vlan = models.Vlan(vlan_id=vid, name=s["description"],
                                   description=s["description"], zone=s["zone"],
                                   site_id=site.id)
                session.add(vlan)
                await session.flush()
                vlan_by_id[vid] = vlan.id
                vlan_pk = vlan.id
            elif vid is not None:
                vlan_pk = vlan_by_id[vid]

            cidr = None
            if s["network"] and s["prefix"]:
                import ipaddress as _ip
                try:
                    cidr = str(_ip.ip_network(f"{s['network']}/{s['prefix']}", strict=False))
                except ValueError:
                    cidr = None
            sub = models.SubnetIpv4(
                vlan_id=vlan_pk, network_cidr=cidr, gateway=s.get("gateway"),
                range_from=s.get("range_from"), range_to=s.get("range_to"),
                expansion_ceiling=s.get("expansion_ceiling"), description=s["description"],
            )
            session.add(sub)
            await session.flush()
            if vid is not None:
                subnet4_by_vlan[vid] = sub.id
            for r in s["roles"]:
                session.add(models.SubnetRoleAssignment(
                    subnet_ipv4_id=sub.id, role=r["role"], slot_number=r["slot"],
                    ipv4_address=r["ipv4"],
                ))

        for s in subnet_data["subnets_ipv6"]:
            vid = s["vlan_id"]
            vlan_pk = vlan_by_id.get(vid) if vid is not None else None
            session.add(models.SubnetIpv6(
                vlan_id=vlan_pk, network_cidr=s["network"],
                range_from=s.get("range_from"), range_to=s.get("range_to"),
                description=s["description"],
            ))

        # ---- Network devices ----
        nd_specs = [
            dict(model_="HP A5120-2", serial_number="s073", device_type="sw",
                 subtype="e", brand="hp", consecutive=1, alternative_name="Myrmidon",
                 rack_unit=32),
            dict(model_="HP A5120-1", serial_number="xwy2", device_type="sw",
                 subtype="e", brand="hp", consecutive=2, rack_unit=32),
            dict(model_="3Com 3CRS45G/4510G", serial_number=None, device_type="sw",
                 subtype="e", brand="3c", consecutive=1, rack_unit=29,
                 management_ipv4="10.0.10.124", default_ip="10.0.10.124/25",
                 os_version="5.2", bitwarden_collection_ref="HQ-Switches",
                 alternative_name="vfbohswacc01", description="Switch Core VF HQ - L3"),
            dict(model_="Arista DCS-7148S", serial_number=None, device_type="sw",
                 subtype="s", brand="ar", consecutive=1, rack_unit=26),
            dict(model_="Aruba 2930F", serial_number="101R", device_type="sw",
                 subtype="c", brand="arb", consecutive=1, rack_unit=27,
                 alternative_name="Ione"),
        ]
        nd_by_alt: dict[str, int] = {}
        core_switch_id = None
        for spec in nd_specs:
            nd = models.NetworkDevice(
                site_id=site.id, rack_id=rack.id, rack_unit=spec.get("rack_unit"),
                device_type_id=NDT[spec["device_type"]], subtype_id=NST[spec["subtype"]],
                brand_id=BRAND[spec["brand"]], model=spec["model_"],
                serial_number=spec.get("serial_number"), consecutive=spec["consecutive"],
                os_version=spec.get("os_version"), description=spec.get("description"),
                management_ipv4=spec.get("management_ipv4"),
                default_ip=spec.get("default_ip"),
                bitwarden_collection_ref=spec.get("bitwarden_collection_ref"),
                alternative_name=spec.get("alternative_name"),
            )
            session.add(nd)
            await session.flush()
            await naming.generate_network_device(session, nd)
            await session.flush()
            if spec.get("alternative_name"):
                nd_by_alt[spec["alternative_name"]] = nd.id
            if spec["model_"].startswith("3Com"):
                core_switch_id = nd.id

        # ---- 3Com core switch port config (from Firewall.xlsx) ----
        port_config = [
            (1, "Access", "Management", None, 1, None, "Any", "Open"),
            (2, "Access", "Interconnect", None, 100, "400", "P2 / 3CDSG8", "Internet"),
            (3, "Access", "Management", None, 1, None, "Any", "Open"),
            (4, "Trunk", "Hypervisor", None, 1, "20", "P1 / bohpsvehv01", "Servicios"),
            (5, "Trunk", "Hypervisor", None, 1, "All", "P3 / bohpsvehv01", "Servicios"),
            (6, "Trunk", "Hypervisor", None, 1, "All", "P1 / bohpsvehv02", "Servicios"),
            (7, "Trunk", "Hypervisor", None, 1, "All", "P3 / bohpsvehv02", "Servicios"),
            (8, "Trunk", "Hypervisor", None, 1, "All", "P1 / bohpsvehv03", "Servicios"),
            (9, "Trunk", "Hypervisor", None, 1, "All", "P3 / bohpsvehv03", "Servicios"),
            (10, "Trunk", "Hypervisor", None, 1, "All", "P1 / bohpsvehv04", "Servicios"),
            (11, "Trunk", "Hypervisor", None, 1, "All", "P3 / bohpsvehv04", "Servicios"),
            (12, "Trunk", "Hypervisor", None, 1, "All", "P1 / bohpsvehv05", "Servicios"),
            (13, "Trunk", "Hypervisor", None, 1, "All", "P3 / bohpsvehv05", "Servicios"),
            (14, "Access", "ServiceL", None, 400, None, "Open", "Servicios"),
            (15, "Access", "ServiceL", None, 400, None, "Open", "Servicios"),
            (16, "Access", "ServiceL", None, 400, None, "Open", "Servicios"),
            (17, "Access", "ServiceL", None, 400, None, "Open", "Servicios"),
            (18, "Access", "ServiceL", None, 400, None, "Open", "Servicios"),
            (19, "Access", "ServiceL", None, 400, None, "Open", "Servicios"),
            (20, "Access", "ServiceW", None, 500, None, "P / AccessPoint", "Servicios"),
            (21, "Aggregation", "Management", "Aggregation 1", 1, "All", "P23 / 3CBLS24G", "Agregacion"),
            (22, "Aggregation", "Management", "Aggregation 1", 1, "All", "P24 / 3CBLS24G", "Agregacion"),
            (23, "Disabled", None, None, None, None, None, None),
            (24, "Disabled", None, None, None, None, None, None),
            (25, "Disabled", None, None, None, None, None, None),
            (26, "Aggregation", "Management", "Aggregation 2", 1, "All", "P47 / DCS-7148S", "Agregacion"),
            (27, "Disabled", None, None, None, None, None, None),
            (28, "Aggregation", "Management", "Aggregation 2", 1, "All", "P47 / DCS-7148S", "Agregacion"),
        ]
        if core_switch_id:
            for (num, mode, pg, agg, pvid, vlans, desc, objective) in port_config:
                pvid_pk = vlan_by_id.get(pvid) if pvid else None
                iface = models.DeviceInterface(
                    network_device_id=core_switch_id, port_number=num,
                    port_mode=mode.lower(), portgroup=pg, aggregation_id=agg,
                    pvid_vlan_id=pvid_pk, description=desc, objective=objective,
                    admin_status="down" if mode == "Disabled" else "up",
                )
                session.add(iface)
                await session.flush()
                if vlans and vlans not in ("All", "NA"):
                    for v in vlans.split(","):
                        v = v.strip()
                        if v.isdigit() and int(v) in vlan_by_id:
                            session.add(models.InterfaceVlanMembership(
                                interface_id=iface.id, vlan_id=vlan_by_id[int(v)],
                                tagged=(mode != "Access"),
                            ))

        # ---- Physical servers ----
        psrv = models.PhysicalServer(
            site_id=site.id, rack_id=rack.id, rack_unit=29,
            device_type_id=CDT["ps"], brand_id=BRAND["ge"], role_id=ROLE["hv"],
            os_family_id=OSF["pr"], os_version_id=OSV["p7"], consecutive=1,
            model="HPE ProLiant Gen10 Plus V2", serial_number="MXQ3240CGQ",
            part_number="P54654-001", management_ipv4="10.0.16.106",
            ilo_ipmi_user="Administrator", ilo_ipmi_fqdn="MXQ3240CGQ",
            bitwarden_collection_ref="HQ-Servers", domain="srv.virtualfactor.co",
            bios_settings={"Serial Ports": "Disabled", "SR-IOV": "Enabled"},
            notes="Proxmox Hypervisor",
        )
        session.add(psrv)
        await session.flush()
        await naming.generate_physical_server(session, psrv)
        await session.flush()

        # ---- Virtual machines ----
        vm = models.VirtualMachine(
            host_server_id=psrv.id, site_id=site.id, os_family_id=OSF["op"],
            role_id=ROLE["fw"], consecutive=1, friendly_name="VyOS Firewall",
            description="VyOS 1 on Proxmox", management_ipv4="10.0.0.126/25",
        )
        session.add(vm)
        await session.flush()
        await naming.generate_vm(session, vm)
        await session.flush()

        # ---- Containers / apps ----
        container_specs = [
            ("it", "3", "ap", 1, "iTop Container"),
            ("it", "3", "db", 1, "iTop Container Database"),
            ("oi", "2", "ap", 1, "OCS Inventory Container App"),
            ("oi", "2", "db", 1, "OCS Inventory Container Database"),
            ("oi", "2", "pr", 1, "OCS Inventory Container Proxy"),
            ("op", "12", "all", 1, "OpenProject"),
            ("adu", "1", "ap", 1, "Azure DNS Updater"),
            ("tr", "1", "in", 1, "Traefik Reverse Proxy / Load Balancer"),
            ("ml", "1", "in", 1, "Mailu"),
            ("crt", "1", "in", 1, "Certbot"),
        ]
        for app_abbr, ver, role_abbr, cons, desc in container_specs:
            c = models.ContainerApp(
                host_vm_id=vm.id, site_id=site.id, container_type="cn",
                app_type_id=APP[app_abbr], version=ver, role_id=ROLE[role_abbr],
                consecutive=cons, description=desc,
            )
            session.add(c)
            await session.flush()
            await naming.generate_container(session, c)
            await session.flush()

        await session.commit()
        print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
