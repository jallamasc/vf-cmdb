"""SQLAlchemy ORM models for the Virtualfactor IT CMDB."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import CIDR, INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


# ---------------------------------------------------------------------------
# Lookup / reference tables (naming-convention dictionaries)
# ---------------------------------------------------------------------------
class LookupMixin:
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(20), nullable=False)
    max_length: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class Organization(LookupMixin, Base):
    __tablename__ = "organizations"


class Cloud(LookupMixin, Base):
    __tablename__ = "clouds"


class Region(LookupMixin, Base):
    __tablename__ = "regions"


class Campus(LookupMixin, Base):
    __tablename__ = "campuses"


class Building(LookupMixin, Base):
    __tablename__ = "buildings"


class FloorSection(LookupMixin, Base):
    __tablename__ = "floor_sections"


class ComputeDeviceType(LookupMixin, Base):
    __tablename__ = "compute_device_types"


class Brand(LookupMixin, Base):
    __tablename__ = "brands"


class DeviceRole(LookupMixin, Base):
    __tablename__ = "device_roles"


class NetworkDeviceType(LookupMixin, Base):
    __tablename__ = "network_device_types"


class NetworkSubtype(LookupMixin, Base):
    __tablename__ = "network_subtypes"


class OsFamily(LookupMixin, Base):
    __tablename__ = "os_families"


class OsVersion(LookupMixin, Base):
    __tablename__ = "os_versions"


class AppType(LookupMixin, Base):
    __tablename__ = "app_types"


class ClusterType(LookupMixin, Base):
    __tablename__ = "cluster_types"


class StorageDeviceType(LookupMixin, Base):
    __tablename__ = "storage_device_types"


class NetworkIdType(LookupMixin, Base):
    __tablename__ = "network_id_types"


# ---------------------------------------------------------------------------
# Reference data (NON-naming lookup lists: addresses, etc.)
#
# These tables are deliberately kept separate from the naming-convention
# dictionaries above. They hold real-world reference values (e.g. postal
# addresses) that are looked up / referenced by other records but play no
# part in the auto-generated naming engine.
# ---------------------------------------------------------------------------
class SiteAddress(Base):
    __tablename__ = "site_addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    street: Mapped[Optional[str]] = mapped_column(String(200))
    city: Mapped[Optional[str]] = mapped_column(String(120))
    state_region: Mapped[Optional[str]] = mapped_column(String(120))
    postal_code: Mapped[Optional[str]] = mapped_column(String(40))
    country: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Physical layer
# ---------------------------------------------------------------------------
class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    organization_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organizations.id"))
    cloud_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clouds.id"))
    region_id: Mapped[Optional[int]] = mapped_column(ForeignKey("regions.id"))
    campus_id: Mapped[Optional[int]] = mapped_column(ForeignKey("campuses.id"))
    building_id: Mapped[Optional[int]] = mapped_column(ForeignKey("buildings.id"))
    floor_section_id: Mapped[Optional[int]] = mapped_column(ForeignKey("floor_sections.id"))
    # Physical address — reference data, NOT a naming convention.
    site_address_id: Mapped[Optional[int]] = mapped_column(ForeignKey("site_addresses.id"))
    simple_name: Mapped[Optional[str]] = mapped_column(String(120))
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    tia606b_name: Mapped[Optional[str]] = mapped_column(String(200))
    # Arbitrary user-defined columns (dynamic column feature). Stored as JSON.
    custom_fields: Mapped[Optional[dict]] = mapped_column(JSONB)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class Rack(Base):
    __tablename__ = "racks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    grid_coordinates: Mapped[Optional[str]] = mapped_column(String(20))
    total_units: Mapped[int] = mapped_column(Integer, default=42)
    description: Mapped[Optional[str]] = mapped_column(Text)
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    simple_name: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class RackUnit(Base):
    __tablename__ = "rack_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rack_id: Mapped[int] = mapped_column(ForeignKey("racks.id"))
    unit_number: Mapped[int] = mapped_column(Integer)
    device_type: Mapped[str] = mapped_column(String(20), default="empty")  # server/switch/pdu/patchpanel/ups/empty
    device_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    device_table: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    label: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    height_units: Mapped[int] = mapped_column(Integer, default=1)
    side: Mapped[str] = mapped_column(String(10), default="front")  # front/rear/both
    notes: Mapped[Optional[str]] = mapped_column(Text)


class PowerDevice(Base):
    __tablename__ = "power_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    rack_id: Mapped[Optional[int]] = mapped_column(ForeignKey("racks.id"))
    device_type: Mapped[str] = mapped_column(String(10), default="pdu")  # ups/pdu
    device_number: Mapped[Optional[int]] = mapped_column(Integer)
    brand: Mapped[Optional[str]] = mapped_column(String(80))
    model: Mapped[Optional[str]] = mapped_column(String(120))
    serial_number: Mapped[Optional[str]] = mapped_column(String(120))
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class PowerOutlet(Base):
    __tablename__ = "power_outlets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    power_device_id: Mapped[Optional[int]] = mapped_column(ForeignKey("power_devices.id"))
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    rack_id: Mapped[Optional[int]] = mapped_column(ForeignKey("racks.id"))
    wall_section: Mapped[Optional[str]] = mapped_column(String(40))
    port_number: Mapped[Optional[int]] = mapped_column(Integer)
    outlet_type: Mapped[Optional[str]] = mapped_column(String(20))
    label: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class PatchPanel(Base):
    __tablename__ = "patch_panels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rack_id: Mapped[Optional[int]] = mapped_column(ForeignKey("racks.id"))
    rack_unit: Mapped[Optional[int]] = mapped_column(Integer)
    port_count: Mapped[int] = mapped_column(Integer, default=24)
    panel_id_label: Mapped[Optional[str]] = mapped_column(String(40))
    side: Mapped[str] = mapped_column(String(10), default="front")
    notes: Mapped[Optional[str]] = mapped_column(Text)


class PatchPanelPort(Base):
    __tablename__ = "patch_panel_ports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patch_panel_id: Mapped[int] = mapped_column(ForeignKey("patch_panels.id"))
    port_number: Mapped[int] = mapped_column(Integer)
    label: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class Cable(Base):
    __tablename__ = "cables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cable_type: Mapped[str] = mapped_column(String(20), default="patchcord")  # structured/patchcord
    port_a_type: Mapped[Optional[str]] = mapped_column(String(40))
    port_a_id: Mapped[Optional[int]] = mapped_column(Integer)
    port_b_type: Mapped[Optional[str]] = mapped_column(String(40))
    port_b_id: Mapped[Optional[int]] = mapped_column(Integer)
    label_a: Mapped[Optional[str]] = mapped_column(String(120))
    label_b: Mapped[Optional[str]] = mapped_column(String(120))
    media_type: Mapped[Optional[str]] = mapped_column(String(40))
    length_meters: Mapped[Optional[float]] = mapped_column()
    notes: Mapped[Optional[str]] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Network layer
# ---------------------------------------------------------------------------
class Vlan(Base):
    __tablename__ = "vlans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vlan_id: Mapped[Optional[int]] = mapped_column(Integer, unique=True)
    name: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text)
    zone: Mapped[Optional[str]] = mapped_column(String(20))
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))


class SubnetIpv4(Base):
    __tablename__ = "subnets_ipv4"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vlan_id: Mapped[Optional[int]] = mapped_column(ForeignKey("vlans.id"))
    network_cidr: Mapped[Optional[str]] = mapped_column(CIDR)
    gateway: Mapped[Optional[str]] = mapped_column(INET)
    range_from: Mapped[Optional[str]] = mapped_column(INET)
    range_to: Mapped[Optional[str]] = mapped_column(INET)
    expansion_ceiling: Mapped[Optional[str]] = mapped_column(INET)
    description: Mapped[Optional[str]] = mapped_column(Text)


class SubnetIpv6(Base):
    __tablename__ = "subnets_ipv6"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vlan_id: Mapped[Optional[int]] = mapped_column(ForeignKey("vlans.id"))
    network_cidr: Mapped[Optional[str]] = mapped_column(CIDR)
    range_from: Mapped[Optional[str]] = mapped_column(INET)
    range_to: Mapped[Optional[str]] = mapped_column(INET)
    description: Mapped[Optional[str]] = mapped_column(Text)


class SubnetRoleAssignment(Base):
    __tablename__ = "subnet_role_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subnet_ipv4_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subnets_ipv4.id"))
    subnet_ipv6_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subnets_ipv6.id"))
    role: Mapped[str] = mapped_column(String(30))
    slot_number: Mapped[Optional[int]] = mapped_column(Integer)
    ipv4_address: Mapped[Optional[str]] = mapped_column(INET)
    ipv6_address: Mapped[Optional[str]] = mapped_column(INET)
    assigned_device_id: Mapped[Optional[int]] = mapped_column(Integer)
    assigned_device_table: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class NetworkDevice(Base):
    __tablename__ = "network_devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    rack_id: Mapped[Optional[int]] = mapped_column(ForeignKey("racks.id"))
    rack_unit: Mapped[Optional[int]] = mapped_column(Integer)
    device_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("network_device_types.id"))
    subtype_id: Mapped[Optional[int]] = mapped_column(ForeignKey("network_subtypes.id"))
    brand_id: Mapped[Optional[int]] = mapped_column(ForeignKey("brands.id"))
    model: Mapped[Optional[str]] = mapped_column(String(120))
    serial_number: Mapped[Optional[str]] = mapped_column(String(120))
    consecutive: Mapped[Optional[int]] = mapped_column(Integer)
    os_version: Mapped[Optional[str]] = mapped_column(String(60))
    description: Mapped[Optional[str]] = mapped_column(Text)
    management_ipv4: Mapped[Optional[str]] = mapped_column(INET)
    management_ipv6: Mapped[Optional[str]] = mapped_column(INET)
    management_fqdn: Mapped[Optional[str]] = mapped_column(String(200))
    default_ip: Mapped[Optional[str]] = mapped_column(String(60))
    bitwarden_collection_ref: Mapped[Optional[str]] = mapped_column(String(120))
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    alternative_name: Mapped[Optional[str]] = mapped_column(String(120))
    vf_friendly_name: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class DeviceInterface(Base):
    __tablename__ = "device_interfaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    network_device_id: Mapped[int] = mapped_column(ForeignKey("network_devices.id"))
    port_number: Mapped[Optional[int]] = mapped_column(Integer)
    port_mode: Mapped[Optional[str]] = mapped_column(String(20))  # access/trunk/aggregation/disabled
    portgroup: Mapped[Optional[str]] = mapped_column(String(60))
    aggregation_id: Mapped[Optional[str]] = mapped_column(String(60))
    pvid_vlan_id: Mapped[Optional[int]] = mapped_column(ForeignKey("vlans.id"))
    description: Mapped[Optional[str]] = mapped_column(Text)
    objective: Mapped[Optional[str]] = mapped_column(String(120))
    speed: Mapped[Optional[str]] = mapped_column(String(20))
    connected_device_type: Mapped[Optional[str]] = mapped_column(String(40))
    connected_device_id: Mapped[Optional[int]] = mapped_column(Integer)
    connected_port: Mapped[Optional[str]] = mapped_column(String(40))
    admin_status: Mapped[str] = mapped_column(String(10), default="up")
    notes: Mapped[Optional[str]] = mapped_column(Text)


class InterfaceVlanMembership(Base):
    __tablename__ = "interface_vlan_memberships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    interface_id: Mapped[int] = mapped_column(ForeignKey("device_interfaces.id"))
    vlan_id: Mapped[int] = mapped_column(ForeignKey("vlans.id"))
    tagged: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------------------------------------------------------------------
# Compute layer
# ---------------------------------------------------------------------------
class PhysicalServer(Base):
    __tablename__ = "physical_servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    rack_id: Mapped[Optional[int]] = mapped_column(ForeignKey("racks.id"))
    rack_unit: Mapped[Optional[int]] = mapped_column(Integer)
    device_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("compute_device_types.id"))
    cluster_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cluster_types.id"))
    brand_id: Mapped[Optional[int]] = mapped_column(ForeignKey("brands.id"))
    model: Mapped[Optional[str]] = mapped_column(String(120))
    serial_number: Mapped[Optional[str]] = mapped_column(String(120))
    part_number: Mapped[Optional[str]] = mapped_column(String(120))
    role_id: Mapped[Optional[int]] = mapped_column(ForeignKey("device_roles.id"))
    os_family_id: Mapped[Optional[int]] = mapped_column(ForeignKey("os_families.id"))
    os_version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("os_versions.id"))
    consecutive: Mapped[Optional[int]] = mapped_column(Integer)
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    alternative_name: Mapped[Optional[str]] = mapped_column(String(120))
    management_ipv4: Mapped[Optional[str]] = mapped_column(INET)
    management_ipv6: Mapped[Optional[str]] = mapped_column(INET)
    management_fqdn: Mapped[Optional[str]] = mapped_column(String(200))
    ilo_ipmi_ipv4: Mapped[Optional[str]] = mapped_column(INET)
    ilo_ipmi_fqdn: Mapped[Optional[str]] = mapped_column(String(200))
    ilo_ipmi_user: Mapped[Optional[str]] = mapped_column(String(80))
    bitwarden_collection_ref: Mapped[Optional[str]] = mapped_column(String(120))
    domain: Mapped[Optional[str]] = mapped_column(String(120))
    bios_settings: Mapped[Optional[dict]] = mapped_column(JSONB)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class VirtualMachine(Base):
    __tablename__ = "virtual_machines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_server_id: Mapped[Optional[int]] = mapped_column(ForeignKey("physical_servers.id"))
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    cluster_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cluster_types.id"))
    os_family_id: Mapped[Optional[int]] = mapped_column(ForeignKey("os_families.id"))
    os_version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("os_versions.id"))
    role_id: Mapped[Optional[int]] = mapped_column(ForeignKey("device_roles.id"))
    consecutive: Mapped[Optional[int]] = mapped_column(Integer)
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    friendly_name: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text)
    management_ipv4: Mapped[Optional[str]] = mapped_column(INET)
    management_ipv6: Mapped[Optional[str]] = mapped_column(INET)
    management_fqdn: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class ContainerApp(Base):
    __tablename__ = "containers_apps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    host_vm_id: Mapped[Optional[int]] = mapped_column(ForeignKey("virtual_machines.id"))
    host_server_id: Mapped[Optional[int]] = mapped_column(ForeignKey("physical_servers.id"))
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    container_type: Mapped[str] = mapped_column(String(10), default="cn")  # cn/ap
    app_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("app_types.id"))
    version: Mapped[Optional[str]] = mapped_column(String(30))
    role_id: Mapped[Optional[int]] = mapped_column(ForeignKey("device_roles.id"))
    consecutive: Mapped[Optional[int]] = mapped_column(Integer)
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    friendly_name: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text)
    ipv4_address: Mapped[Optional[str]] = mapped_column(INET)
    ipv6_address: Mapped[Optional[str]] = mapped_column(INET)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class Workstation(Base):
    __tablename__ = "workstations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    device_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("compute_device_types.id"))
    brand_id: Mapped[Optional[int]] = mapped_column(ForeignKey("brands.id"))
    serial_number: Mapped[Optional[str]] = mapped_column(String(120))
    role_id: Mapped[Optional[int]] = mapped_column(ForeignKey("device_roles.id"))
    os_family_id: Mapped[Optional[int]] = mapped_column(ForeignKey("os_families.id"))
    os_version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("os_versions.id"))
    consecutive: Mapped[Optional[int]] = mapped_column(Integer)
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    alternative_name: Mapped[Optional[str]] = mapped_column(String(120))
    management_ipv4: Mapped[Optional[str]] = mapped_column(INET)
    management_fqdn: Mapped[Optional[str]] = mapped_column(String(200))
    bitwarden_collection_ref: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)


# ---------------------------------------------------------------------------
# IPAM
# ---------------------------------------------------------------------------
class IpAssignment(Base):
    __tablename__ = "ip_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subnet_ipv4_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subnets_ipv4.id"))
    subnet_ipv6_id: Mapped[Optional[int]] = mapped_column(ForeignKey("subnets_ipv6.id"))
    ipv4_address: Mapped[Optional[str]] = mapped_column(INET)
    ipv6_address: Mapped[Optional[str]] = mapped_column(INET)
    assigned_to_type: Mapped[Optional[str]] = mapped_column(String(50))
    assigned_to_id: Mapped[Optional[int]] = mapped_column(Integer)
    interface_name: Mapped[Optional[str]] = mapped_column(String(60))
    dns_name: Mapped[Optional[str]] = mapped_column(String(200))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active/reserved/deprecated
    notes: Mapped[Optional[str]] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------
class ChangeLog(Base):
    __tablename__ = "change_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(60))
    record_id: Mapped[Optional[int]] = mapped_column(Integer)
    field_name: Mapped[Optional[str]] = mapped_column(String(80))
    old_value: Mapped[Optional[str]] = mapped_column(Text)
    new_value: Mapped[Optional[str]] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    change_source: Mapped[str] = mapped_column(String(30), default="web_ui")
