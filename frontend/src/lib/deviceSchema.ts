/**
 * FEAT-7 — form layout for the Device Detail Dashboard's Overview tab.
 *
 * The listing grids show one row per device; the dashboard shows *one* device
 * as a form, so every column needs a label, an input type and a section it
 * belongs to. That mapping lives here rather than in the page component so the
 * four device types stay readable side by side.
 *
 * Nothing here decides what is *stored* — the backend model is still the single
 * source of truth. ``DeviceOverviewForm`` renders any column returned by the
 * API that is missing from this file in a trailing "Other fields" section, so a
 * new column can never silently disappear from the UI.
 */
import type { DeviceTypeKey } from "../api";

export type DeviceFieldKind =
  /** Free text, saved on blur. */
  | "text"
  /** Multi-line free text, saved on blur. */
  | "textarea"
  /** Integer, saved on blur. */
  | "number"
  /** IP address (PostgreSQL INET), saved on blur. */
  | "ip"
  /** Foreign key, rendered as a <select> of the ``lookup`` resource. */
  | "fk"
  /** JSONB column, rendered read-only. */
  | "json"
  /** Written by the naming engine on every save — never editable. */
  | "generated"
  /** Database-managed timestamp / primary key — never editable. */
  | "readonly";

export interface DeviceField {
  /** Model column name. */
  field: string;
  label: string;
  kind: DeviceFieldKind;
  /** Kebab-case CRUD slug to load options from, for ``kind: "fk"``. */
  lookup?: string;
  /** Short explanation shown under the input. */
  help?: string;
  /** Span both form columns (long text, JSON). */
  wide?: boolean;
}

export interface DeviceSection {
  title: string;
  description?: string;
  fields: DeviceField[];
}

export interface DeviceSchema {
  /** Kebab-case CRUD slug used for PATCHes. */
  resource: string;
  label: string;
  /** Lookup resources the form's dropdowns need. */
  lookups: string[];
  /**
   * Auto-generated identifiers, shown large at the top of the Overview tab.
   * Read-only: the naming engine rewrites them on every save.
   */
  generatedNames: DeviceField[];
  sections: DeviceSection[];
}

/**
 * TIA-606-B labels are produced for the *location* hierarchy (sites), not for
 * devices — no device table has a ``tia606b_name`` column. The dashboard says
 * so instead of rendering an empty field that would look like missing data.
 */
export const TIA606B_NOTE =
  "TIA-606-B labels are generated for sites and the location hierarchy; " +
  "device tables do not store a tia606b_name column. A device's rack/U " +
  "position is shown in the header above.";

/** Columns every device shares at the end of the form. */
const RECORD_SECTION: DeviceSection = {
  title: "Record",
  description: "Maintained by the database.",
  fields: [
    { field: "id", label: "ID", kind: "readonly" },
    { field: "created_at", label: "Created", kind: "readonly" },
    { field: "updated_at", label: "Last updated", kind: "readonly" },
  ],
};

const notesSection = (extra: DeviceField[] = []): DeviceSection => ({
  title: "Notes",
  fields: [
    ...extra,
    { field: "notes", label: "Notes", kind: "textarea", wide: true },
  ],
});

/** Naming inputs shared by every device type. */
const SEQUENCE_FIELDS: DeviceField[] = [
  {
    field: "consecutive",
    label: "Consecutive",
    kind: "number",
    help: "Trailing counter used by the generated names.",
  },
  {
    field: "name_prefix",
    label: "Name prefix",
    kind: "text",
    help: "Prefix the sequence-gap helper allocates against.",
  },
  { field: "sequence_number", label: "Sequence number", kind: "number" },
];

export const DEVICE_SCHEMAS: Record<DeviceTypeKey, DeviceSchema> = {
  physical_servers: {
    resource: "physical-servers",
    label: "Physical Server",
    lookups: [
      "sites",
      "racks",
      "compute-device-types",
      "cluster-types",
      "brands",
      "device-roles",
      "os-families",
      "os-versions",
    ],
    generatedNames: [
      { field: "vf_long_name", label: "VF long name", kind: "generated" },
      { field: "vf_short_name", label: "VF short name", kind: "generated" },
    ],
    sections: [
      {
        title: "Identity",
        fields: [
          { field: "alternative_name", label: "Alternative name", kind: "text" },
          { field: "domain", label: "Domain", kind: "text" },
          ...SEQUENCE_FIELDS,
        ],
      },
      {
        title: "Placement",
        description: "Where the chassis physically lives.",
        fields: [
          { field: "site_id", label: "Site", kind: "fk", lookup: "sites" },
          { field: "rack_id", label: "Rack", kind: "fk", lookup: "racks" },
          { field: "rack_unit", label: "Rack unit (U)", kind: "number" },
        ],
      },
      {
        title: "Classification",
        description: "Feeds the generated names.",
        fields: [
          {
            field: "device_type_id",
            label: "Device type",
            kind: "fk",
            lookup: "compute-device-types",
          },
          {
            field: "cluster_type_id",
            label: "Cluster type",
            kind: "fk",
            lookup: "cluster-types",
          },
          { field: "brand_id", label: "Brand", kind: "fk", lookup: "brands" },
          { field: "role_id", label: "Role", kind: "fk", lookup: "device-roles" },
        ],
      },
      {
        title: "Hardware",
        fields: [
          { field: "model", label: "Model", kind: "text" },
          { field: "serial_number", label: "Serial number", kind: "text" },
          { field: "part_number", label: "Part number", kind: "text" },
        ],
      },
      {
        title: "Operating system",
        fields: [
          {
            field: "os_family_id",
            label: "OS family",
            kind: "fk",
            lookup: "os-families",
          },
          {
            field: "os_version_id",
            label: "OS version",
            kind: "fk",
            lookup: "os-versions",
          },
        ],
      },
      {
        title: "Management access",
        fields: [
          { field: "management_ipv4", label: "Management IPv4", kind: "ip" },
          { field: "management_ipv6", label: "Management IPv6", kind: "ip" },
          { field: "management_fqdn", label: "Management FQDN", kind: "text" },
          { field: "ilo_ipmi_ipv4", label: "iLO / IPMI IPv4", kind: "ip" },
          { field: "ilo_ipmi_fqdn", label: "iLO / IPMI FQDN", kind: "text" },
          { field: "ilo_ipmi_user", label: "iLO / IPMI user", kind: "text" },
          {
            field: "bitwarden_collection_ref",
            label: "Bitwarden collection",
            kind: "text",
            help: "Reference only — no credential is ever stored in the CMDB.",
          },
        ],
      },
      {
        title: "Collected facts",
        description: "Written by Ansible fact collection. See the Ansible Facts tab.",
        fields: [
          { field: "bios_settings", label: "BIOS settings", kind: "json", wide: true },
        ],
      },
      notesSection(),
      RECORD_SECTION,
    ],
  },

  virtual_machines: {
    resource: "virtual-machines",
    label: "Virtual Machine",
    lookups: [
      "physical-servers",
      "sites",
      "cluster-types",
      "device-roles",
      "os-families",
      "os-versions",
    ],
    generatedNames: [
      { field: "vf_short_name", label: "VF short name", kind: "generated" },
    ],
    sections: [
      {
        title: "Identity",
        fields: [
          { field: "friendly_name", label: "Friendly name", kind: "text" },
          ...SEQUENCE_FIELDS,
        ],
      },
      {
        title: "Placement",
        fields: [
          {
            field: "host_server_id",
            label: "Host server",
            kind: "fk",
            lookup: "physical-servers",
          },
          { field: "site_id", label: "Site", kind: "fk", lookup: "sites" },
        ],
      },
      {
        title: "Classification",
        fields: [
          {
            field: "cluster_type_id",
            label: "Cluster type",
            kind: "fk",
            lookup: "cluster-types",
          },
          { field: "role_id", label: "Role", kind: "fk", lookup: "device-roles" },
        ],
      },
      {
        title: "Operating system",
        fields: [
          {
            field: "os_family_id",
            label: "OS family",
            kind: "fk",
            lookup: "os-families",
          },
          {
            field: "os_version_id",
            label: "OS version",
            kind: "fk",
            lookup: "os-versions",
          },
        ],
      },
      {
        title: "Management access",
        fields: [
          { field: "management_ipv4", label: "Management IPv4", kind: "ip" },
          { field: "management_ipv6", label: "Management IPv6", kind: "ip" },
          { field: "management_fqdn", label: "Management FQDN", kind: "text" },
        ],
      },
      notesSection([
        { field: "description", label: "Description", kind: "textarea", wide: true },
      ]),
      RECORD_SECTION,
    ],
  },

  workstations: {
    resource: "workstations",
    label: "Workstation",
    lookups: [
      "sites",
      "compute-device-types",
      "brands",
      "device-roles",
      "os-families",
      "os-versions",
    ],
    generatedNames: [
      { field: "vf_long_name", label: "VF long name", kind: "generated" },
      { field: "vf_short_name", label: "VF short name", kind: "generated" },
    ],
    sections: [
      {
        title: "Identity",
        fields: [
          { field: "alternative_name", label: "Alternative name", kind: "text" },
          ...SEQUENCE_FIELDS,
        ],
      },
      {
        title: "Placement",
        fields: [{ field: "site_id", label: "Site", kind: "fk", lookup: "sites" }],
      },
      {
        title: "Classification",
        fields: [
          {
            field: "device_type_id",
            label: "Device type",
            kind: "fk",
            lookup: "compute-device-types",
          },
          { field: "brand_id", label: "Brand", kind: "fk", lookup: "brands" },
          { field: "role_id", label: "Role", kind: "fk", lookup: "device-roles" },
        ],
      },
      {
        title: "Hardware",
        fields: [{ field: "serial_number", label: "Serial number", kind: "text" }],
      },
      {
        title: "Operating system",
        fields: [
          {
            field: "os_family_id",
            label: "OS family",
            kind: "fk",
            lookup: "os-families",
          },
          {
            field: "os_version_id",
            label: "OS version",
            kind: "fk",
            lookup: "os-versions",
          },
        ],
      },
      {
        title: "Management access",
        fields: [
          { field: "management_ipv4", label: "Management IPv4", kind: "ip" },
          { field: "management_fqdn", label: "Management FQDN", kind: "text" },
          {
            field: "bitwarden_collection_ref",
            label: "Bitwarden collection",
            kind: "text",
            help: "Reference only — no credential is ever stored in the CMDB.",
          },
        ],
      },
      notesSection(),
      RECORD_SECTION,
    ],
  },

  network_devices: {
    resource: "network-devices",
    label: "Network Device",
    lookups: [
      "sites",
      "racks",
      "network-device-types",
      "network-subtypes",
      "brands",
    ],
    generatedNames: [
      { field: "vf_long_name", label: "VF long name", kind: "generated" },
      { field: "vf_friendly_name", label: "VF friendly name", kind: "generated" },
    ],
    sections: [
      {
        title: "Identity",
        fields: [
          { field: "alternative_name", label: "Alternative name", kind: "text" },
          ...SEQUENCE_FIELDS,
        ],
      },
      {
        title: "Placement",
        fields: [
          { field: "site_id", label: "Site", kind: "fk", lookup: "sites" },
          { field: "rack_id", label: "Rack", kind: "fk", lookup: "racks" },
          { field: "rack_unit", label: "Rack unit (U)", kind: "number" },
        ],
      },
      {
        title: "Classification",
        fields: [
          {
            field: "device_type_id",
            label: "Device type",
            kind: "fk",
            lookup: "network-device-types",
          },
          {
            field: "subtype_id",
            label: "Subtype",
            kind: "fk",
            lookup: "network-subtypes",
          },
          { field: "brand_id", label: "Brand", kind: "fk", lookup: "brands" },
        ],
      },
      {
        title: "Hardware",
        fields: [
          { field: "model", label: "Model", kind: "text" },
          { field: "serial_number", label: "Serial number", kind: "text" },
          { field: "os_version", label: "OS version", kind: "text" },
        ],
      },
      {
        title: "Management access",
        fields: [
          { field: "management_ipv4", label: "Management IPv4", kind: "ip" },
          { field: "management_ipv6", label: "Management IPv6", kind: "ip" },
          { field: "management_fqdn", label: "Management FQDN", kind: "text" },
          {
            field: "default_ip",
            label: "Factory default IP",
            kind: "text",
            help: "Address the device answers on before it is configured.",
          },
          {
            field: "bitwarden_collection_ref",
            label: "Bitwarden collection",
            kind: "text",
            help: "Reference only — no credential is ever stored in the CMDB.",
          },
        ],
      },
      notesSection([
        { field: "description", label: "Description", kind: "textarea", wide: true },
      ]),
      RECORD_SECTION,
    ],
  },
};

/** Every column the schema for ``type`` knows about, including hero names. */
export function schemaFields(type: DeviceTypeKey): Set<string> {
  const schema = DEVICE_SCHEMAS[type];
  const seen = new Set<string>(schema.generatedNames.map((f) => f.field));
  schema.sections.forEach((s) => s.fields.forEach((f) => seen.add(f.field)));
  return seen;
}
