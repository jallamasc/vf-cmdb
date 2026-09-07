"""SQLAlchemy ORM models for the Virtualfactor IT CMDB."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import CIDR, INET, JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from .database import Base

# ---------------------------------------------------------------------------
# Shared enum value sets and validation helpers
# ---------------------------------------------------------------------------
# Case-enforcement is configured per record-type / category. It controls how
# abbreviation/code values (and relevant name fields) are normalised.
CASE_ENFORCEMENT_VALUES = ("uppercase", "lowercase", "mixed")

# Trim modes control how a short code is auto-derived from a full name on the
# naming-convention records.
TRIM_MODE_VALUES = (
    "manual",
    "first_1",
    "first_2",
    "first_3",
    "first_4",
    "acronym",
    "consonants",
)

# Domain-name charset for all abbreviation/code columns:
#   - only [A-Za-z0-9-]
#   - no leading hyphen, no trailing hyphen, no consecutive hyphens ("--")
# Expressed as a POSIX regular expression usable in a Postgres CHECK.
DOMAIN_NAME_REGEX = r"^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$"

# FEAT-1: how a site's short "simple_name" code is produced.
#   auto   -> derived from organization + campus + region + sequence
#   custom -> free text typed by the user
#   theme  -> picked from a themed name catalogue (FEAT-3)
SITE_CODE_TYPE_VALUES = ("auto", "custom", "theme")

# Phase 5 Task 14 — the fixed set of value representations a FieldTypeDef can
# be backed by. An administrator can name new FieldTypeDefs (e.g. "MAC
# Address") but every one of them still resolves to one of these six storage
# primitives, which is what lets the generic form/grid layer (Task 20) render
# and validate any field type without new code per type.
STORAGE_KIND_VALUES = ("text", "number", "boolean", "date", "reference", "file")

# Phase 5 Task 16 — the fixed set of integrations an EntityTypeDef can opt
# into. Each corresponds to a real code path elsewhere in the app (rack
# elevation, power/network port diagrams, cabling, IP assignment, Ansible
# lifecycle sync, photo upload, stencil/anchor diagrams, blueprint upload) —
# unlike field types and entity types, this list is NOT itself user-
# definable, since every entry has to have actual integration code behind it.
CAPABILITY_VALUES = (
    "rack_placement",
    "power_ports",
    "network_ports",
    "ip_assignment",
    "ansible_managed",
    "cabling",
    "photo",
    "stencil_diagram",
    "blueprint",
)


def _case_enum(name: str) -> Enum:
    """A non-native (VARCHAR + CHECK) enum for case enforcement."""
    return Enum(*CASE_ENFORCEMENT_VALUES, name=name, native_enum=False)


# Phase 5 Task 28 (Req 23.1) — every naming-engine-computed field's manual/
# auto override state (see naming.py's `_is_auto()`). Scoped to the 5 tables
# whose naming.py generator actually sets a field (sites/datacenters/racks/
# patch_panels/power_devices) — DatacenterFloor/Room/Section have no
# generator at all to gate, so adding this column there would be inert.
NAMING_MODE_VALUES = ("auto", "manual")


def _naming_mode_enum(name: str) -> Enum:
    """A non-native (VARCHAR + CHECK) enum for naming_mode. Explicit length
    (longer than "manual") for the same reason `_storage_kind_enum` needs
    one — see that helper's comment for the auto-sizing pitfall."""
    return Enum(
        *NAMING_MODE_VALUES, name=name, native_enum=False, create_constraint=True, length=10
    )


def _trim_enum(name: str) -> Enum:
    """A non-native (VARCHAR + CHECK) enum for trim modes."""
    return Enum(*TRIM_MODE_VALUES, name=name, native_enum=False)


def _site_code_type_enum(name: str) -> Enum:
    """A non-native (VARCHAR + CHECK) enum for the site code mode.

    ``create_constraint=True`` so the database itself rejects any value outside
    the tri-mode set — the mode drives how ``simple_name`` is written, so a bad
    value must never reach a row.
    """
    return Enum(
        *SITE_CODE_TYPE_VALUES, name=name, native_enum=False, create_constraint=True
    )


def _storage_kind_enum(name: str) -> Enum:
    """A non-native (VARCHAR + CHECK) enum for FieldTypeDef.storage_kind.

    ``length=20`` is deliberately wider than the longest value ("reference",
    9 chars) — SQLAlchemy defaults a non-native Enum's VARCHAR to exactly the
    longest member's length, which means an invalid, longer value gets
    rejected by a raw string-truncation error instead of the intended CHECK
    constraint. Widening the column lets the CHECK do the actual validation.
    """
    return Enum(
        *STORAGE_KIND_VALUES,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=20,
    )


def _charset_check(column: str, constraint_name: str) -> CheckConstraint:
    """Domain-name charset CHECK constraint for an abbreviation/code column.

    NULL values are allowed so nullable code columns remain optional.
    """
    return CheckConstraint(
        f"{column} IS NULL OR {column} ~ '{DOMAIN_NAME_REGEX}'",
        name=constraint_name,
    )


# ---------------------------------------------------------------------------
# Lookup / reference tables (naming-convention dictionaries)
# ---------------------------------------------------------------------------
class LookupMixin:
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    abbreviation: Mapped[str] = mapped_column(String(20), nullable=False)
    max_length: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Per record-type case enforcement applied to abbreviation + name fields.
    case_enforcement: Mapped[str] = mapped_column(
        _case_enum("case_enforcement"), nullable=False, default="mixed",
        server_default="mixed",
    )
    # How the abbreviation is auto-derived from the full name.
    trim_mode: Mapped[str] = mapped_column(
        _trim_enum("trim_mode"), nullable=False, default="manual",
        server_default="manual",
    )

    @declared_attr.directive
    def __table_args__(cls):
        # Domain-name charset CHECK on the shared abbreviation column.
        return (
            _charset_check(
                "abbreviation", f"ck_{cls.__tablename__}_abbreviation_charset"
            ),
        )


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

    # FEAT-6 (6B): optional Visio Café stencil for this device model. When set,
    # the rack diagram embeds the cached SVG instead of a plain rectangle.
    stencil_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Phase 4 Req 14: a separate stencil for the back face.
    stencil_url_back: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Phase 5 Req 6.2/7.1: a lucide-react icon name, rendered per row in the
    # owning device's grid (e.g. "Server"). Free text, not FK-constrained —
    # the frontend falls back to a generic icon for an unrecognised name.
    icon: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)


class Brand(LookupMixin, Base):
    __tablename__ = "brands"


class DeviceRole(LookupMixin, Base):
    __tablename__ = "device_roles"


class NetworkDeviceType(LookupMixin, Base):
    __tablename__ = "network_device_types"

    # FEAT-6 (6B): optional Visio Café stencil for this device model.
    stencil_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Phase 4 Req 14: a separate stencil for the back face.
    stencil_url_back: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Phase 5 Req 6.2/7.1: lucide-react icon name rendered per device row.
    icon: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)


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

    # FEAT-6 (6B): optional Visio Café stencil for this device model.
    stencil_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Phase 4 Req 14: a separate stencil for the back face.
    stencil_url_back: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Phase 5 Req 6.2/7.1: lucide-react icon name rendered per device row.
    icon: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)


class PowerDeviceType(LookupMixin, Base):
    """Phase 4 Req 17 — UPS/PDU models, so power devices can carry a stencil.

    Mirrors NetworkDeviceType/ComputeDeviceType/StorageDeviceType exactly:
    ``LookupMixin`` gives it full_name/abbreviation, and it carries the same
    front/back stencil pair.
    """

    __tablename__ = "power_device_types"

    stencil_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    stencil_url_back: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Phase 5 Req 6.2/7.1: lucide-react icon name rendered per device row.
    icon: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)


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
    # FEAT-1: how simple_name is produced — "auto" (derived from
    # org+campus+region+sequence), "custom" (typed by the user) or "theme"
    # (picked from a themed name list, see theme_name / theme_category).
    site_code_type: Mapped[str] = mapped_column(
        _site_code_type_enum("site_code_type"), nullable=False,
        default="auto", server_default="auto",
    )
    # FEAT-3: themed fun name chosen for this site (when site_code_type=theme).
    theme_name: Mapped[Optional[str]] = mapped_column(String(120))
    theme_category: Mapped[Optional[str]] = mapped_column(String(40))
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    tia606b_name: Mapped[Optional[str]] = mapped_column(String(200))
    # Phase 5 Task 28 (Req 23.1/23.2/23.3) — gates vf_long_name/vf_short_name/
    # tia606b_name only; site_code_type above already has its own separate
    # auto/custom/theme mode for simple_name, untouched by this column.
    naming_mode: Mapped[str] = mapped_column(
        _naming_mode_enum("site_naming_mode"), nullable=False,
        default="auto", server_default="auto",
    )
    # Arbitrary user-defined columns (dynamic column feature). Stored as JSON.
    custom_fields: Mapped[Optional[dict]] = mapped_column(JSONB)
    notes: Mapped[Optional[str]] = mapped_column(Text)


# ---------------------------------------------------------------------------
# Physical hierarchy: Site > Datacenter > Floor > Room > Rack
# ---------------------------------------------------------------------------
class Datacenter(Base):
    __tablename__ = "datacenters"
    __table_args__ = (
        _charset_check("code", "ck_datacenters_code_charset"),
        _charset_check("iata_code", "ck_datacenters_iata_code_charset"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(16))  # abbreviation
    description: Mapped[Optional[str]] = mapped_column(Text)
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    # FEAT-5: geographic identity. The IATA airport code of the nearest major
    # airport is the industry-standard city component for datacenter names.
    city: Mapped[Optional[str]] = mapped_column(String(120))
    iata_code: Mapped[Optional[str]] = mapped_column(String(10))
    # Generated from the parent site + IATA code (see naming.generate_datacenter).
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    # Per record-type case enforcement for this hierarchy level.
    case_enforcement: Mapped[str] = mapped_column(
        _case_enum("dc_case_enforcement"), nullable=False, default="mixed",
        server_default="mixed",
    )
    # Phase 5 Task 28 (Req 23.1/23.2/23.3) — gates vf_long_name.
    naming_mode: Mapped[str] = mapped_column(
        _naming_mode_enum("datacenter_naming_mode"), nullable=False,
        default="auto", server_default="auto",
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)


class DatacenterFloor(Base):
    __tablename__ = "datacenter_floors"
    __table_args__ = (
        _charset_check("code", "ck_datacenter_floors_code_charset"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(16))
    floor_number: Mapped[Optional[int]] = mapped_column(Integer)
    datacenter_id: Mapped[Optional[int]] = mapped_column(ForeignKey("datacenters.id"))
    # FEAT-3: optional themed fun name for this floor.
    theme_name: Mapped[Optional[str]] = mapped_column(String(120))
    theme_category: Mapped[Optional[str]] = mapped_column(String(40))
    case_enforcement: Mapped[str] = mapped_column(
        _case_enum("floor_case_enforcement"), nullable=False, default="mixed",
        server_default="mixed",
    )
    description: Mapped[Optional[str]] = mapped_column(Text)
    # Phase 5 Task 26 (Req 21.3) — an uploaded floor-plan image, set by
    # POST /blueprints/datacenter-floors/{id} (backend/app/routers/special.py).
    blueprint_url: Mapped[Optional[str]] = mapped_column(String(500))


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (
        _charset_check("code", "ck_rooms_code_charset"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(16))
    datacenter_floor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("datacenter_floors.id")
    )
    # FEAT-3: optional themed fun name for this room.
    theme_name: Mapped[Optional[str]] = mapped_column(String(120))
    theme_category: Mapped[Optional[str]] = mapped_column(String(40))
    case_enforcement: Mapped[str] = mapped_column(
        _case_enum("room_case_enforcement"), nullable=False, default="mixed",
        server_default="mixed",
    )
    description: Mapped[Optional[str]] = mapped_column(Text)
    # Phase 5 Task 26 (Req 21.3) — an uploaded floor-plan image, set by
    # POST /blueprints/rooms/{id}.
    blueprint_url: Mapped[Optional[str]] = mapped_column(String(500))


class Section(Base):
    """Phase 5 Task 27 — an optional subdivision within a Room (Req 22.1).

    Unlike Room's ``datacenter_floor_id`` (nullable — a Room always has a
    Floor conceptually, but the column stayed nullable for the same
    backward-compatibility reason every other hierarchy FK on these tables
    is nullable), ``room_id`` here is NOT NULL: a Section always belongs to
    exactly one Room (Req 22.1's "Section... within a Room").
    """

    __tablename__ = "sections"
    __table_args__ = (
        _charset_check("code", "ck_sections_code_charset"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(16))
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), nullable=False)
    theme_name: Mapped[Optional[str]] = mapped_column(String(120))
    theme_category: Mapped[Optional[str]] = mapped_column(String(40))
    case_enforcement: Mapped[str] = mapped_column(
        _case_enum("section_case_enforcement"), nullable=False, default="mixed",
        server_default="mixed",
    )
    description: Mapped[Optional[str]] = mapped_column(Text)
    # Phase 5 Task 27 (Req 22.3) — an uploaded floor-plan image, set by
    # POST /blueprints/sections/{id}.
    blueprint_url: Mapped[Optional[str]] = mapped_column(String(500))


class RackType(Base):
    """Reference table of standard rack heights / categories (e.g. 42U)."""

    __tablename__ = "rack_types"
    __table_args__ = (
        _charset_check("code", "ck_rack_types_code_charset"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(16))
    total_units: Mapped[int] = mapped_column(Integer, default=42)
    case_enforcement: Mapped[str] = mapped_column(
        _case_enum("rack_type_case_enforcement"), nullable=False, default="mixed",
        server_default="mixed",
    )
    description: Mapped[Optional[str]] = mapped_column(Text)


class Rack(Base):
    __tablename__ = "racks"
    __table_args__ = (
        _charset_check("code", "ck_racks_code_charset"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    # Physical hierarchy links (nullable for backward compatibility).
    datacenter_floor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("datacenter_floors.id")
    )
    room_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rooms.id"))
    # Phase 5 Task 27 (Req 22.2) — a Rack may belong to a Floor, a Room, or a
    # Section, but only one of the three (enforced at the app layer, see
    # crud._validate_rack — the three columns are independently nullable at
    # the schema level, consistent with every other hierarchy FK here).
    section_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sections.id"))
    rack_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rack_types.id"))
    code: Mapped[Optional[str]] = mapped_column(String(16))  # abbreviation
    grid_coordinates: Mapped[Optional[str]] = mapped_column(String(20))
    total_units: Mapped[int] = mapped_column(Integer, default=42)
    description: Mapped[Optional[str]] = mapped_column(Text)
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    simple_name: Mapped[Optional[str]] = mapped_column(String(120))
    # Phase 5 Task 28 (Req 23.1/23.2/23.3) — gates vf_long_name.
    naming_mode: Mapped[str] = mapped_column(
        _naming_mode_enum("rack_naming_mode"), nullable=False,
        default="auto", server_default="auto",
    )
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
    # Phase 4 Req 17: optional link to a PowerDeviceType lookup row, so a
    # power device can carry a stencil. Additive — brand/model stay free text.
    device_type_id: Mapped[Optional[int]] = mapped_column(ForeignKey("power_device_types.id"))
    device_number: Mapped[Optional[int]] = mapped_column(Integer)
    brand: Mapped[Optional[str]] = mapped_column(String(80))
    model: Mapped[Optional[str]] = mapped_column(String(120))
    serial_number: Mapped[Optional[str]] = mapped_column(String(120))
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    # Phase 5 Task 23 (Req 19.1) — an uploaded photo of this specific unit,
    # set by POST /photos/power-devices/{id} (backend/app/photos.py).
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    # Phase 5 Task 28 (Req 23.1/23.2/23.3) — gates vf_long_name.
    naming_mode: Mapped[str] = mapped_column(
        _naming_mode_enum("power_device_naming_mode"), nullable=False,
        default="auto", server_default="auto",
    )
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
    # Phase 5 Task 23 (Req 19.1) — an uploaded photo of this specific panel.
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    # Phase 5 Task 28 (Req 23.1/23.2/23.3) — gates panel_id_label.
    naming_mode: Mapped[str] = mapped_column(
        _naming_mode_enum("patch_panel_naming_mode"), nullable=False,
        default="auto", server_default="auto",
    )
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
    # FEAT-6 (6C): auto-generated Cable_Label ({from}-{a}->{to}-{b}), produced
    # by naming.generate_cable. Additive — the a/b shape above is preserved.
    label: Mapped[Optional[str]] = mapped_column(String(200))
    # Phase 4 Req 20 — true when this row was created/maintained by the
    # Cable_Sync_Service from a DeviceInterface's connected-* fields, rather
    # than by an operator through the Connect panel or a direct cable CRUD
    # call. Only auto-generated rows are ever auto-updated/auto-deleted.
    auto_generated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)


class StencilAnchor(Base):
    """Phase 4 Req 19 — a precise port/U join point mapped onto a stencil.

    ``owner_resource``/``owner_id`` identify the device-type lookup row the
    stencil belongs to (the same ``{resource}-{id}`` pair the stencil cache
    already keys on). ``x``/``y`` are normalized 0..1 fractions of the
    rendered stencil box, so one mapping works at any render scale. When no
    matching row exists for a (owner, face, port_key), rendering falls back to
    the computed Convention_Layout — mapping is optional per port.
    """

    __tablename__ = "stencil_anchors"
    __table_args__ = (
        UniqueConstraint(
            "owner_resource", "owner_id", "face", "port_key",
            name="uq_stencil_anchor_owner_face_port",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_resource: Mapped[str] = mapped_column(String(40), nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
    face: Mapped[str] = mapped_column(String(10), nullable=False, default="front")
    port_key: Mapped[str] = mapped_column(String(80), nullable=False)
    x: Mapped[float] = mapped_column(nullable=False)
    y: Mapped[float] = mapped_column(nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(120))


# ---------------------------------------------------------------------------
# Network layer
# ---------------------------------------------------------------------------
RESERVATION_ANCHOR_VALUES = ("from_end", "from_start")


class Vlan(Base):
    __tablename__ = "vlans"
    __table_args__ = (
        # Composite uniqueness for query ergonomics. The GLOBAL unique on
        # vlan_id (below) is intentionally kept so a VLAN ID cannot be reused
        # on a different site (user decision Q1).
        UniqueConstraint("site_id", "vlan_id", name="uq_vlan_site_vlanid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Globally unique VLAN id — a VLAN number may exist on only one site.
    vlan_id: Mapped[Optional[int]] = mapped_column(Integer, unique=True)
    name: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text)
    zone: Mapped[Optional[str]] = mapped_column(String(20))
    # Every VLAN belongs to exactly one site.
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False)


class SubnetIpv4(Base):
    __tablename__ = "subnets_ipv4"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vlan_id: Mapped[Optional[int]] = mapped_column(ForeignKey("vlans.id"))
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    network_cidr: Mapped[Optional[str]] = mapped_column(CIDR)
    gateway: Mapped[Optional[str]] = mapped_column(INET)
    range_from: Mapped[Optional[str]] = mapped_column(INET)
    range_to: Mapped[Optional[str]] = mapped_column(INET)
    expansion_ceiling: Mapped[Optional[str]] = mapped_column(INET)
    # Reservation pool: number of IPs reserved for special devices/services and
    # the direction reservations are auto-assigned from.
    reserved_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    reservation_anchor: Mapped[str] = mapped_column(
        String(10), nullable=False, default="from_end", server_default="from_end"
    )
    description: Mapped[Optional[str]] = mapped_column(Text)


class SubnetIpv6(Base):
    __tablename__ = "subnets_ipv6"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vlan_id: Mapped[Optional[int]] = mapped_column(ForeignKey("vlans.id"))
    site_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sites.id"))
    network_cidr: Mapped[Optional[str]] = mapped_column(CIDR)
    range_from: Mapped[Optional[str]] = mapped_column(INET)
    range_to: Mapped[Optional[str]] = mapped_column(INET)
    reserved_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    reservation_anchor: Mapped[str] = mapped_column(
        String(10), nullable=False, default="from_end", server_default="from_end"
    )
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
    # Free-text reservation label (distinct from the structured `role`).
    label: Mapped[Optional[str]] = mapped_column(String(80))
    # Locked reservations (e.g. the gateway) are protected from deletion.
    is_locked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
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
    # Naming: base convention prefix + per-prefix auto-assigned sequence.
    name_prefix: Mapped[Optional[str]] = mapped_column(String(40))
    sequence_number: Mapped[Optional[int]] = mapped_column(Integer)
    os_version: Mapped[Optional[str]] = mapped_column(String(60))
    description: Mapped[Optional[str]] = mapped_column(Text)
    management_ipv4: Mapped[Optional[str]] = mapped_column(INET)
    management_ipv6: Mapped[Optional[str]] = mapped_column(INET)
    management_fqdn: Mapped[Optional[str]] = mapped_column(String(200))
    default_ip: Mapped[Optional[str]] = mapped_column(String(60))
    bitwarden_collection_ref: Mapped[Optional[str]] = mapped_column(String(120))
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    # Phase 4 Req 10: the "Simple Name" shown in the UI. Free text, or set from
    # the networking-themed picker (theme_name/theme_category record which
    # catalogue entry was chosen, mirroring the FEAT-3 columns on sites).
    alternative_name: Mapped[Optional[str]] = mapped_column(String(120))
    theme_name: Mapped[Optional[str]] = mapped_column(String(120))
    theme_category: Mapped[Optional[str]] = mapped_column(String(40))
    vf_friendly_name: Mapped[Optional[str]] = mapped_column(String(120))
    # Phase 5 Task 23 (Req 19.1) — an uploaded photo of this specific device.
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Phase 4 Req 21 — Ansible-depth facts (see PhysicalServer for the
    # rationale; identical shape on every fact-collectable device type).
    ansible_facts: Mapped[Optional[dict]] = mapped_column(JSONB)
    cpu_cores: Mapped[Optional[int]] = mapped_column(Integer)
    memory_mb: Mapped[Optional[int]] = mapped_column(Integer)
    os_distribution: Mapped[Optional[str]] = mapped_column(String(80))
    last_fact_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class DeviceInterface(Base):
    __tablename__ = "device_interfaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # FEAT-6 (6C): relaxed to nullable so a data port can be owned by any device
    # class, not only a network device. Legacy rows keep this FK set.
    network_device_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("network_devices.id"), nullable=True
    )
    # FEAT-6 (6C): polymorphic physical owner of this port. Holds the kebab-case
    # ENTITY_REGISTRY slug (e.g. "network-devices", "physical-servers") + id.
    # This answers "which device owns this port" (rack membership / back face);
    # it is DISTINCT from connected_device_* below, which is the far end of a
    # link. Resolution rule: use (owner_device_type, owner_device_id) when set,
    # else fall back to network_device_id.
    owner_device_type: Mapped[Optional[str]] = mapped_column(String(40))
    owner_device_id: Mapped[Optional[int]] = mapped_column(Integer)
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
    # Naming: base convention prefix + per-prefix auto-assigned sequence.
    name_prefix: Mapped[Optional[str]] = mapped_column(String(40))
    sequence_number: Mapped[Optional[int]] = mapped_column(Integer)
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
    # Phase 5 Task 23 (Req 19.1) — an uploaded photo of this specific server.
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Phase 4 Req 21 — Ansible-depth facts. `ansible_facts` is the catch-all
    # blob for whatever a fact-gathering run reports; a handful of common
    # keys are ALSO promoted to their own column for fast, typed access.
    ansible_facts: Mapped[Optional[dict]] = mapped_column(JSONB)
    cpu_cores: Mapped[Optional[int]] = mapped_column(Integer)
    memory_mb: Mapped[Optional[int]] = mapped_column(Integer)
    os_distribution: Mapped[Optional[str]] = mapped_column(String(80))
    last_fact_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


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
    # Naming: base convention prefix + per-prefix auto-assigned sequence.
    name_prefix: Mapped[Optional[str]] = mapped_column(String(40))
    sequence_number: Mapped[Optional[int]] = mapped_column(Integer)
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    friendly_name: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text)
    management_ipv4: Mapped[Optional[str]] = mapped_column(INET)
    management_ipv6: Mapped[Optional[str]] = mapped_column(INET)
    management_fqdn: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Phase 4 Req 21 — Ansible-depth facts (see PhysicalServer for the
    # rationale; identical shape on every fact-collectable device type).
    ansible_facts: Mapped[Optional[dict]] = mapped_column(JSONB)
    cpu_cores: Mapped[Optional[int]] = mapped_column(Integer)
    memory_mb: Mapped[Optional[int]] = mapped_column(Integer)
    os_distribution: Mapped[Optional[str]] = mapped_column(String(80))
    last_fact_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


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
    # Naming: base convention prefix + per-prefix auto-assigned sequence.
    name_prefix: Mapped[Optional[str]] = mapped_column(String(40))
    sequence_number: Mapped[Optional[int]] = mapped_column(Integer)
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    friendly_name: Mapped[Optional[str]] = mapped_column(String(120))
    description: Mapped[Optional[str]] = mapped_column(Text)
    ipv4_address: Mapped[Optional[str]] = mapped_column(INET)
    ipv6_address: Mapped[Optional[str]] = mapped_column(INET)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Phase 4 Req 21 — Ansible-depth facts (see PhysicalServer for the
    # rationale; identical shape on every fact-collectable device type).
    ansible_facts: Mapped[Optional[dict]] = mapped_column(JSONB)
    cpu_cores: Mapped[Optional[int]] = mapped_column(Integer)
    memory_mb: Mapped[Optional[int]] = mapped_column(Integer)
    os_distribution: Mapped[Optional[str]] = mapped_column(String(80))
    last_fact_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


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
    # Naming: base convention prefix + per-prefix auto-assigned sequence.
    name_prefix: Mapped[Optional[str]] = mapped_column(String(40))
    sequence_number: Mapped[Optional[int]] = mapped_column(Integer)
    vf_long_name: Mapped[Optional[str]] = mapped_column(String(200))
    vf_short_name: Mapped[Optional[str]] = mapped_column(String(120))
    alternative_name: Mapped[Optional[str]] = mapped_column(String(120))
    management_ipv4: Mapped[Optional[str]] = mapped_column(INET)
    management_fqdn: Mapped[Optional[str]] = mapped_column(String(200))
    bitwarden_collection_ref: Mapped[Optional[str]] = mapped_column(String(120))
    # Phase 5 Task 23 (Req 19.1) — an uploaded photo of this specific unit.
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # Phase 4 Req 21 — Ansible-depth facts (see PhysicalServer for the
    # rationale; identical shape on every fact-collectable device type).
    ansible_facts: Mapped[Optional[dict]] = mapped_column(JSONB)
    cpu_cores: Mapped[Optional[int]] = mapped_column(Integer)
    memory_mb: Mapped[Optional[int]] = mapped_column(Integer)
    os_distribution: Mapped[Optional[str]] = mapped_column(String(80))
    last_fact_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


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


# ---------------------------------------------------------------------------
# Global abbreviation registry
#
# Every abbreviation / code used anywhere in the system is mirrored here so a
# single case-insensitive UNIQUE index guarantees global uniqueness across ALL
# record types. Rows are kept in sync by the CRUD layer (and the seeder).
# ---------------------------------------------------------------------------
class AbbreviationRegistry(Base):
    __tablename__ = "abbreviation_registry"
    __table_args__ = (
        # Case-insensitive global uniqueness on the abbreviation value.
        Index(
            "uq_abbreviation_registry_lower",
            text("lower(abbreviation)"),
            unique=True,
        ),
        _charset_check("abbreviation", "ck_abbreviation_registry_charset"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    abbreviation: Mapped[str] = mapped_column(String(40), nullable=False)
    # Which table + row currently owns this abbreviation.
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    field_name: Mapped[str] = mapped_column(String(40), nullable=False, default="abbreviation")


# ---------------------------------------------------------------------------
# Generic Entity Framework (Phase 5, Sub-phase C)
#
# A reference-data-driven layer on top of the hardcoded models above: an
# administrator can define new entity types (EntityTypeDef, Task 16) with
# custom fields (EntityFieldDef, Task 17) backed by named field types
# (FieldTypeDef, this table), and manage records of those types
# (GenericEntity, Task 18) without any code change. See design.md's "Key
# Decisions" for why this is JSONB-backed rather than dynamic DDL.
# ---------------------------------------------------------------------------
class FieldTypeDef(Base):
    """Phase 5 Task 14 — a named field type available when defining custom
    Entity_Field_Defs on an Entity_Type_Def.

    ``builtin`` rows (the 6 seeded storage kinds themselves, used verbatim)
    are protected from deletion by the API layer, not the schema — an
    administrator can still add further NAMED types on top of the same 6
    storage kinds (e.g. "MAC Address" -> storage_kind="text").
    """

    __tablename__ = "field_type_defs"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_field_type_defs_slug"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    storage_kind: Mapped[str] = mapped_column(
        _storage_kind_enum("field_type_def_storage_kind"), nullable=False
    )
    builtin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)


class EntityTypeDef(Base):
    """Phase 5 Task 16 — an admin-defined kind of managed asset.

    ``capabilities`` is a JSONB array of strings drawn from
    ``CAPABILITY_VALUES`` (validated at the application layer in
    ``crud._validate_entity_type_def`` — Postgres has no cheap way to CHECK
    "every element of this JSON array is one of N strings" the way a scalar
    CHECK constrains a single column). Not every type needs every
    capability: a "Monitor" custom type might enable ``photo`` +
    ``power_ports`` without ``ansible_managed``, for example.
    """

    __tablename__ = "entity_type_defs"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_entity_type_defs_slug"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    icon: Mapped[Optional[str]] = mapped_column(String(60))
    capabilities: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text)


class EntityFieldDef(Base):
    """Phase 5 Task 17 — a custom field on an Entity_Type_Def.

    ``field_type_id`` names which Field_Type_Def (and therefore storage
    kind) backs this field's values inside a Generic_Entity's ``attributes``
    JSONB (Task 18). ``reference_target_type`` only applies when the field
    type's storage_kind is "reference" — it names the entity-registry slug
    the value points at (kept nullable/free here; not enforced at the DB
    layer, same rationale as EntityTypeDef.capabilities).

    ``sort_order`` drives display order in the generic dynamic form/grid
    (Task 20) — administrators can reorder fields without changing `key`.
    """

    __tablename__ = "entity_field_defs"
    __table_args__ = (
        UniqueConstraint(
            "entity_type_id", "key", name="uq_entity_field_defs_entity_type_key"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type_id: Mapped[int] = mapped_column(
        ForeignKey("entity_type_defs.id"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(60), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    field_type_id: Mapped[int] = mapped_column(
        ForeignKey("field_type_defs.id"), nullable=False
    )
    required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    reference_target_type: Mapped[Optional[str]] = mapped_column(String(60))


class FieldVisibilityOverride(Base):
    """Phase 5 Task 24 — administrator control over whether a named field
    (column) appears on a named hardcoded entity's grid, without a code
    change (Req 20.1/20.2).

    The absence of a row for an (``entity_slug``, ``field_key``) pair means
    "visible" (the field's normal/default state); a row only needs to exist
    when an administrator wants to deviate from that default. ``entity_slug``
    is an ``ENTITY_REGISTRY`` slug (e.g. ``"network-devices"``), ``field_key``
    a model field/column name (e.g. ``"serial_number"``) — neither is FK/
    enum-constrained, since the set of valid (slug, field) pairs spans every
    registered resource's columns and would be expensive to enumerate and
    keep in sync here; the frontend grid simply ignores an override that
    doesn't name one of its own columns.
    """

    __tablename__ = "field_visibility_overrides"
    __table_args__ = (
        UniqueConstraint(
            "entity_slug", "field_key", name="uq_field_visibility_overrides_entity_field"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_slug: Mapped[str] = mapped_column(String(60), nullable=False)
    field_key: Mapped[str] = mapped_column(String(80), nullable=False)
    visible: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )


class GenericEntity(Base):
    """Phase 5 Task 18 — a record of an admin-defined Entity_Type_Def.

    ``attributes`` is a JSONB object holding this record's custom field
    values, keyed by each EntityFieldDef's ``key`` (validated as a JSON
    object, not e.g. a list, at the application layer — see
    ``crud._validate_generic_entity``; per-field/required-field validation
    against the type's EntityFieldDefs belongs to the generic form layer,
    Task 20). GIN-indexed for efficient containment queries (``@>``).

    The handful of plain columns below back specific capability
    integrations that need real relational columns elsewhere in the app
    (rack elevation, stencil rendering) instead of being read out of JSONB:
    ``rack_id``/``rack_unit`` (``rack_placement`` capability), ``photo_url``
    (``photo``), ``stencil_url``/``stencil_url_back`` (``stencil_diagram``),
    ``ip_id``/``management_ip_id`` (``ip_assignment`` — Phase 5 Task 32,
    Req 26.1/26.2). Unlike every other capability hook here, ``ip_assignment``
    is enforced at the CRUD layer (``crud._validate_generic_entity_ip_assignment``):
    a record whose Entity_Type_Def carries this capability must have BOTH
    ``ip_id`` and ``management_ip_id`` set, on every create and update.
    ``admin_username``/``bw_secret_id`` (``ansible_managed`` — Phase 5
    Task 34, Req 28.1): a default admin credential, auto-provisioned via
    ``crud._provision_credential`` on creation only. The plaintext password
    is never stored here — only the username and the Bitwarden Secrets
    Manager's own reference to it. ``semaphore_host_id`` (``ansible_managed``
    — Phase 5 Task 38, Req 30.1/30.2): the id of the Semaphore Inventory
    ``lifecycle_sync.py`` upserts for this record on every create/update, and
    removes (without touching ``bw_secret_id``/Bitwarden) on delete.
    """

    __tablename__ = "generic_entities"
    __table_args__ = (
        Index(
            "ix_generic_entities_attributes_gin",
            "attributes",
            postgresql_using="gin",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type_id: Mapped[int] = mapped_column(
        ForeignKey("entity_type_defs.id"), nullable=False
    )
    attributes: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    # rack_placement capability hook — same relational shape hardcoded
    # device types (NetworkDevice, PhysicalServer, ...) use.
    rack_id: Mapped[Optional[int]] = mapped_column(ForeignKey("racks.id"))
    rack_unit: Mapped[Optional[int]] = mapped_column(Integer)
    # photo capability hook.
    photo_url: Mapped[Optional[str]] = mapped_column(String(500))
    # stencil_diagram capability hook.
    stencil_url: Mapped[Optional[str]] = mapped_column(String(500))
    stencil_url_back: Mapped[Optional[str]] = mapped_column(String(500))
    # ip_assignment capability hook — usage IP vs. management IP, each its
    # own IpAssignment row (Phase 5 Task 32).
    ip_id: Mapped[Optional[int]] = mapped_column(ForeignKey("ip_assignments.id"))
    management_ip_id: Mapped[Optional[int]] = mapped_column(ForeignKey("ip_assignments.id"))
    # ansible_managed capability hook — default admin credential. Only the
    # username and the Bitwarden Secrets Manager reference are stored here;
    # the plaintext password lives only in Bitwarden (Phase 5 Task 34).
    admin_username: Mapped[Optional[str]] = mapped_column(String(100))
    bw_secret_id: Mapped[Optional[str]] = mapped_column(String(64))
    semaphore_host_id: Mapped[Optional[str]] = mapped_column(String(64))
