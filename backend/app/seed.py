"""Seed the CMDB with initial data extracted from the source Excel files.

Idempotent, in two layers:

* **Lookup dictionaries** (``LOOKUPS``) are *additively* upserted on every run.
  A lookup row is matched case-insensitively on its abbreviation, so adding a
  new entry to ``LOOKUPS`` and re-running the seeder inserts only that entry
  and leaves everything else untouched.
* **Demo topology** (site, racks, servers, VLANs, …) is inserted only on a
  virgin database — detected by the ``organizations`` table being empty.
  Re-running the seeder against a populated database therefore refreshes the
  lookups and stops before it could duplicate the topology.
"""
from __future__ import annotations

import asyncio
import json
import os

from sqlalchemy import func, select

from . import abbrev, endoflife_client, models, naming
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
    # FEAT-4: Colombia's six natural regions plus the international regions
    # used for cloud / multi-site deployments.
    #
    # NOTE on the codes: every abbreviation in this system is validated against
    # the domain-name charset ``^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$`` (a DB CHECK on
    # every abbreviation/code column plus ``abbrev.validate_charset``), so
    # underscores and slashes cannot be stored. The requested ``CO_CTR`` style
    # codes therefore use a hyphen (``CO-CTR``), and ``UK/IE`` becomes
    # ``UK-IE``. Everything else is stored exactly as requested.
    # Phase 4 Req 8.1: restricted to Colombia's natural regions plus
    # well-known Americas regions only. The previous broader international
    # set (EMEA/APAC/UK-IE/etc.) and the legacy demo rows ("Central Colombia
    # 1"/"EastUS 1") are intentionally NOT re-added here; migration
    # 0007_region_cleanup removes any pre-existing rows outside this list
    # that no Site still references.
    models.Region: [
        # -- Colombia: natural regions -------------------------------------
        ("Región Central", "CO-CTR", 6),
        ("Región Caribe", "CO-CAR", 6),
        ("Región Pacífica", "CO-PAC", 6),
        ("Región Andina", "CO-AND", 6),
        ("Región Orinoquía", "CO-ORI", 6),
        ("Región Amazonía", "CO-AMZ", 6),
        # -- Well-known Americas regions -------------------------------------
        ("North America East", "NAEAST", 6),
        ("North America West", "NAWEST", 6),
        ("Canada", "CAN", 3),
        ("Mexico and Central America", "MEX-CA", 6),
        ("Caribbean", "CAR", 3),
        ("Latin America South", "LATAM-S", 7),
    ],
    models.Campus: [
        ("Headquarters", "hq", 2), ("Home", "hm", 2),
    ],
    models.Building: [
        ("Main Building 1", "M1", 4), ("Secondary Building 1", "S1", 4),
    ],
    models.FloorSection: [
        ("Floor 1 Section 1", "F1S1", 5),
    ],
    models.ComputeDeviceType: [
        ("Desktop / Workstation", "ws", 2), ("Laptop", "lp", 2),
        ("Physical Server", "ps", 2), ("Virtual Desktop / Workstation", "vw", 2),
        ("Virtual Server", "vse", 3),
    ],
    models.Brand: [
        ("Apple", "apl", 3), ("MSI", "msi", 3), ("Hewlett Packard", "hp", 3),
        ("Hewlett Packard Enterprise", "hpe", 3), ("Lenovo", "ln", 3),
        ("Seagate", "sgt", 3), ("Western Digital", "wd", 3), ("Linksys", "ls", 3),
        ("Combodo", "cm", 3), ("Oracle", "or", 3), ("Generic", "ge", 3),
        ("Arista", "ar", 3), ("Aruba", "arb", 3), ("3Com", "3c", 3),
        ("TP-Link", "tp", 3), ("Xiaomi", "xi", 3),
        # Phase 6 Task 31 (Req 12.2) — curated, hand-verified additions to
        # bring the Brand list up to a realistic ~25-30 well-known IT
        # hardware vendor catalogue. Every abbreviation below was checked
        # against the rest of this file for a global-registry collision
        # before being picked (see `abbrev.sync_registry` — the SAME
        # cross-table uniqueness namespace every abbreviation/code in this
        # app shares).
        ("Dell", "dl", 3), ("Cisco", "cs", 3), ("NetApp", "ntap", 3),
        ("IBM", "ibm", 3), ("Supermicro", "smc", 3), ("Fortinet", "ftnt", 3),
        ("Ubiquiti", "ubnt", 3), ("Netgear", "ntgr", 3), ("Synology", "syn", 3),
        ("QNAP", "qnap", 3), ("Juniper Networks", "jnpr", 3),
        ("Vertiv", "vrt", 3), ("Eaton", "etn", 3),
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
        ("Firewall", "fwl", 3), ("Load Balancer", "lb", 3), ("Router", "ro", 3),
        ("Switch", "sw", 3), ("Security Appliance / Firewall", "sa", 3),
        ("Virtual Switch", "vsw", 3), ("Virtual Distributed Switch", "vds", 3),
        ("Standard Portgroup", "sp", 3), ("Distributed Portgroup", "dp", 3),
        ("Wireless Device", "wl", 3), ("Modem", "mo", 3),
        ("Satellital Antenna Kit", "sk", 3),
    ],
    models.NetworkSubtype: [
        ("Core", "c", 1), ("Edge", "e", 1), ("Router", "r", 1),
        ("Antenna", "a", 1), ("Spine", "s", 1),
    ],
    models.OsFamily: [
        ("ESXi", "es", 2), ("Hyper-V", "hy", 2), ("Linux", "lx", 2),
        ("Windows", "wn", 2), ("BSD", "bs", 2), ("OpnSense", "op", 2),
        ("Proxmox", "px", 2),
    ],
    models.OsVersion: [
        ("Windows 10 Pro", "10p", 4), ("Windows 10 Enterprise", "10e", 4),
        ("Windows Server 2016", "s16", 4), ("Windows Server 2019", "s19", 4),
        ("Ubuntu 18", "u18", 4), ("CentOS 8", "c8", 4),
        ("OpenSense 21", "o21", 4), ("Proxmox 7", "p7", 4),
        ("Ubuntu 18.04", "v04", 5),
    ],
    models.AppType: [
        ("iTop", "it", 5), ("OCS Inventory", "oi", 5), ("OpenProject", "opj", 5),
        ("Azure DNS Updater", "adu", 5), ("Traefik", "tr", 5), ("Mailu", "ml", 5),
        ("Certbot", "crt", 5),
    ],
    models.ClusterType: [
        ("Management", "mng", 3), ("Processing", "prc", 3),
    ],
    models.StorageDeviceType: [
        ("Storage Array", "sar", 3), ("Volume", "vl", 2), ("Disk", "dk", 2),
        ("Disk Group / RAID", "dg", 2), ("Volume Group", "vg", 2),
        ("Mobile Drive", "md", 2),
    ],
    models.NetworkIdType: [
        ("Wireless Network", "wnw", 3), ("Cable Network", "cn", 3),
    ],
}


async def _seed_lookups(session) -> tuple[dict, list[str]]:
    """Additively upsert every lookup row.

    Returns ``({model: {abbr: id}}, ["regions.CO-CTR", …])`` where the second
    element lists the rows that were actually inserted by this run.

    Rows are matched on the abbreviation, case-insensitively, mirroring the
    case-insensitive global uniqueness enforced by
    :func:`app.abbrev.sync_registry`. An abbreviation that is already present
    is reused as-is — its ``full_name`` / ``max_length`` are left alone so a
    re-run never clobbers edits a user made through the UI.
    """
    maps: dict = {}
    created: list[str] = []
    for model, rows in LOOKUPS.items():
        maps[model] = {}

        # One query per table instead of one per row.
        existing = (await session.execute(select(model))).scalars().all()
        by_lower = {
            (row.abbreviation or "").lower(): row
            for row in existing
            if row.abbreviation
        }

        for full_name, abbr, max_len in rows:
            obj = by_lower.get(abbr.lower())
            if obj is None:
                obj = model(
                    full_name=full_name, abbreviation=abbr, max_length=max_len
                )
                session.add(obj)
                await session.flush()
                by_lower[abbr.lower()] = obj
                created.append(f"{model.__tablename__}.{abbr}")
            # Register (or re-affirm) the global abbreviation namespace entry:
            # case-insensitive uniqueness + charset validation. This is a no-op
            # update when the row already owns the value.
            await abbrev.sync_registry(
                session, obj.__tablename__, obj.id, "abbreviation", obj.abbreviation
            )
            maps[model][abbr] = obj.id
    return maps, created


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
        already_seeded = int(existing.scalar() or 0) > 0

        # Lookups are additive on every run: this is what lets new dictionary
        # entries (e.g. FEAT-4's regions) reach an existing database without
        # re-importing — or duplicating — the demo topology below.
        m, created = await _seed_lookups(session)

        if already_seeded:
            await session.commit()
            if created:
                print(f"Added {len(created)} new lookup row(s): {', '.join(created)}")
            else:
                print("Lookups already up to date; nothing to add.")
            print("Demo topology already present; skipping.")
            return

        # Phase 6 Task 30 (Req 12.1) — populate real OsFamily/OsVersion data
        # from endoflife.date on the FIRST seed only (not on every restart —
        # entrypoint.sh runs `python -m app.seed` unconditionally, and a
        # container startup path must never depend on reaching an external
        # network to complete; the manual-trigger endpoint
        # `POST /api/v1/os-data/sync` covers any later refresh). Never
        # fatal to the rest of seeding — a fully offline/air-gapped install
        # just ends up without this optional extra reference data.
        try:
            eol_result = await endoflife_client.sync_products(session)
            if eol_result.families_created or eol_result.versions_created:
                print(
                    f"endoflife.date sync: +{len(eol_result.families_created)} OS "
                    f"famil(y/ies), +{len(eol_result.versions_created)} OS version(s)"
                )
            if eol_result.products_unreachable:
                print(
                    "endoflife.date sync: could not reach "
                    f"{', '.join(eol_result.products_unreachable)} (skipped, non-fatal)"
                )
        except Exception as exc:  # pragma: no cover - defensive; must never block seeding
            print(f"endoflife.date sync failed non-fatally: {exc}")

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
            description="Primary home lab location",
        )
        session.add(home_address)
        await session.flush()

        # ---- Site: Home Datacenter ----
        # NOTE: `simple_name` is intentionally NOT set here. A site's names are
        # produced by the naming engine (vf_long_name / vf_short_name /
        # tia606b_name via generate_site below); seeding a redundant
        # `simple_name` only to have it cleared later produced the spurious
        # "simple_name: Korriban -> None" changelog artifact (BUG-03).
        site = models.Site(
            description="Bogota, Home, 1st Floor Datacenter",
            # Phase 5 fix: "cc" (Central Colombia) was the pre-Phase-4-cleanup
            # region abbreviation; Task 9's region cleanup pruned the seed
            # list down to Colombia's natural regions + well-known Americas
            # regions (see backend/app/seed.py's Region list) without
            # updating this reference, which left a fresh/empty database
            # unable to seed at all (KeyError: 'cc'). Bogota/Cundinamarca
            # sits in Colombia's Andean natural region.
            organization_id=ORG["vf"], cloud_id=CLOUD["vs"], region_id=REGION["CO-AND"],
            campus_id=CAMPUS["hm"], building_id=BUILDING["M1"], floor_section_id=FS["F1S1"],
            site_address_id=home_address.id,
        )
        session.add(site)
        await session.flush()
        await naming.generate_site(session, site)
        await session.flush()

        # ---- Rack types (reference list of standard heights) ----
        rack_type_ids: dict[str, int] = {}
        for rt_name, rt_code, rt_units in [
            ("16U Rack", "16U", 16), ("32U Rack", "32U", 32),
            ("42U Rack", "42U", 42), ("48U Rack", "48U", 48),
        ]:
            rt = models.RackType(name=rt_name, code=rt_code, total_units=rt_units)
            session.add(rt)
            await session.flush()
            await abbrev.sync_registry(session, rt.__tablename__, rt.id, "code", rt_code)
            rack_type_ids[rt_code] = rt.id

        # ---- Physical hierarchy: Datacenter > Floor > Room ----
        datacenter = models.Datacenter(
            name="NA", code="na", site_id=site.id,
            description="Primary datacenter for the home site",
        )
        session.add(datacenter)
        await session.flush()
        await abbrev.sync_registry(
            session, datacenter.__tablename__, datacenter.id, "code", "na"
        )

        floor = models.DatacenterFloor(
            name="1st Floor", code="f1", floor_number=1,
            datacenter_id=datacenter.id, description="Ground floor",
        )
        session.add(floor)
        await session.flush()
        await abbrev.sync_registry(
            session, floor.__tablename__, floor.id, "code", "f1"
        )

        room = models.Room(
            name="Alejandro's Office", code="ao",
            datacenter_floor_id=floor.id, description="Home office / lab room",
        )
        session.add(room)
        await session.flush()
        await abbrev.sync_registry(session, room.__tablename__, room.id, "code", "ao")

        # ---- Rack AA01 (linked into the hierarchy) ----
        rack = models.Rack(
            site_id=site.id, datacenter_floor_id=floor.id, room_id=room.id,
            rack_type_id=rack_type_ids.get("42U"), code="AA01",
            grid_coordinates="AA01", total_units=36,
            description="Home datacenter primary rack", simple_name="AA01",
        )
        session.add(rack)
        await session.flush()
        await abbrev.sync_registry(session, rack.__tablename__, rack.id, "code", "AA01")
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
                vlan_id=vlan_pk, site_id=site.id, network_cidr=cidr,
                gateway=s.get("gateway"),
                range_from=s.get("range_from"), range_to=s.get("range_to"),
                expansion_ceiling=s.get("expansion_ceiling"),
                reserved_count=s.get("reserved_count", 0),
                reservation_anchor=s.get("reservation_anchor", "from_end"),
                description=s["description"],
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
            # Auto-create a locked Gateway reservation (decision Q6) whenever the
            # segment carries a gateway and one is not already present as a role.
            gw = s.get("gateway")
            if gw:
                gw_ip = str(gw).split("/")[0]
                have_gw = any(
                    str(r.get("ipv4") or "").split("/")[0] == gw_ip for r in s["roles"]
                )
                if not have_gw:
                    session.add(models.SubnetRoleAssignment(
                        subnet_ipv4_id=sub.id, role="gateway", label="Gateway",
                        ipv4_address=gw_ip, is_locked=True,
                    ))

        for s in subnet_data["subnets_ipv6"]:
            vid = s["vlan_id"]
            vlan_pk = vlan_by_id.get(vid) if vid is not None else None
            session.add(models.SubnetIpv6(
                vlan_id=vlan_pk, site_id=site.id, network_cidr=s["network"],
                range_from=s.get("range_from"), range_to=s.get("range_to"),
                reserved_count=s.get("reserved_count", 0),
                reservation_anchor=s.get("reservation_anchor", "from_end"),
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
            os_family_id=OSF["px"], os_version_id=OSV["p7"], consecutive=1,
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
            ("opj", "12", "all", 1, "OpenProject"),
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
