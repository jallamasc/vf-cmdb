// Phase 5 Task 16/19 — the fixed set of integrations an EntityTypeDef can
// opt into (mirrors backend/app/models.py's CAPABILITY_VALUES). Deliberately
// NOT itself user-definable — every entry gates real integration code
// elsewhere in the app (rack elevation, power/network port diagrams,
// cabling, IP assignment, Ansible lifecycle sync, photo upload, stencil/
// anchor diagrams, blueprint upload). Used by the Entity Type Builder
// (Task 19) to render the capability toggle group.
export const CAPABILITY_VALUES = [
  "rack_placement",
  "power_ports",
  "network_ports",
  "ip_assignment",
  "ansible_managed",
  "cabling",
  "photo",
  "stencil_diagram",
  "blueprint",
] as const;

export type Capability = (typeof CAPABILITY_VALUES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  rack_placement: "Rack placement",
  power_ports: "Power ports",
  network_ports: "Network ports",
  ip_assignment: "IP assignment",
  ansible_managed: "Ansible managed",
  cabling: "Cabling",
  photo: "Photo",
  stencil_diagram: "Stencil diagram",
  blueprint: "Blueprint",
};
