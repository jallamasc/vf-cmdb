"""Maps public API resource slugs to ORM models."""
from . import models

ENTITY_REGISTRY = {
    # lookups
    "organizations": models.Organization,
    "clouds": models.Cloud,
    "regions": models.Region,
    "campuses": models.Campus,
    "buildings": models.Building,
    "floor-sections": models.FloorSection,
    "compute-device-types": models.ComputeDeviceType,
    "brands": models.Brand,
    "device-roles": models.DeviceRole,
    "network-device-types": models.NetworkDeviceType,
    "network-subtypes": models.NetworkSubtype,
    "os-families": models.OsFamily,
    "os-versions": models.OsVersion,
    "app-types": models.AppType,
    "cluster-types": models.ClusterType,
    "storage-device-types": models.StorageDeviceType,
    "network-id-types": models.NetworkIdType,
    "power-device-types": models.PowerDeviceType,
    # reference data (NON-naming lookup lists)
    "site-addresses": models.SiteAddress,
    "rack-types": models.RackType,
    "stencil-anchors": models.StencilAnchor,
    # Phase 5 Task 14/16/17 — generic entity framework metadata.
    "field-type-defs": models.FieldTypeDef,
    "entity-type-defs": models.EntityTypeDef,
    "entity-field-defs": models.EntityFieldDef,
    # physical
    "sites": models.Site,
    "datacenters": models.Datacenter,
    "datacenter-floors": models.DatacenterFloor,
    "rooms": models.Room,
    "racks": models.Rack,
    "rack-units": models.RackUnit,
    "power-devices": models.PowerDevice,
    "power-outlets": models.PowerOutlet,
    "patch-panels": models.PatchPanel,
    "patch-panel-ports": models.PatchPanelPort,
    "cables": models.Cable,
    # network
    "vlans": models.Vlan,
    "subnets-ipv4": models.SubnetIpv4,
    "subnets-ipv6": models.SubnetIpv6,
    "subnet-role-assignments": models.SubnetRoleAssignment,
    "network-devices": models.NetworkDevice,
    "device-interfaces": models.DeviceInterface,
    "interface-vlan-memberships": models.InterfaceVlanMembership,
    # compute
    "physical-servers": models.PhysicalServer,
    "virtual-machines": models.VirtualMachine,
    "containers-apps": models.ContainerApp,
    "workstations": models.Workstation,
    # ipam
    "ip-assignments": models.IpAssignment,
}

# True naming-convention dictionaries (full_name -> abbreviation) that feed
# the auto-naming engine. These are the ONLY tables surfaced on the
# "Naming Conventions" page.
LOOKUP_SLUGS = [
    "organizations", "clouds", "regions", "campuses", "buildings",
    "floor-sections", "compute-device-types", "brands", "device-roles",
    "network-device-types", "network-subtypes", "os-families", "os-versions",
    "app-types", "cluster-types", "storage-device-types", "network-id-types",
    # Phase 4 Req 17: power device models, so they get the same "Naming
    # Conventions" + stencil-panel treatment as the other 3 device types.
    "power-device-types",
]

# Reference / lookup data that is NOT a naming convention. These are plain
# reference lists (e.g. physical addresses) that other records point to but
# that never participate in name generation. Surfaced under "Reference Data".
REFERENCE_SLUGS = [
    "site-addresses",
    "rack-types",
    # Phase 5 Task 14/15 — managed from Reference Data, not a naming
    # convention dictionary.
    "field-type-defs",
]
