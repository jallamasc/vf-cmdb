// Phase 4 Req 15 — shared connection resolution: given a port and the full
// list of cables, is this port connected, and if so to what. Used by every
// graphical view to decide a Connection_Dot's visual state and click target.
import { Row } from "../api";

export interface PortRef {
  /** Polymorphic type discriminator, e.g. "network-devices", "physical-servers". */
  type: string | null | undefined;
  id: number | null | undefined;
  /**
   * The SPECIFIC port's own label (e.g. "eth0", "outlet 3"). Required to
   * disambiguate ports: a Cable's `port_a_id`/`port_b_id` is the OWNING
   * DEVICE's id (a switch, a PDU), not the individual interface/outlet's own
   * id — every port on that device shares the same owner id. Without label
   * matching, one cable on a 28-port switch would make all 28 ports look
   * connected. When omitted, matching falls back to owner-only (useful for
   * device kinds where a Cable end already identifies a single, unambiguous
   * port).
   */
  label?: string | null;
}

export type CableRow = Row & {
  id: number;
  cable_type?: string | null;
  port_a_type?: string | null;
  port_a_id?: number | null;
  port_b_type?: string | null;
  port_b_id?: number | null;
  label_a?: string | null;
  label_b?: string | null;
  label?: string | null;
};

export interface ConnectionResolution {
  connected: boolean;
  cable: CableRow | null;
  /** The opposite end of the cable when connected, else null. */
  farEnd: PortRef | null;
  /** This port's own label as recorded on the cable, else null. */
  ownLabel: string | null;
  /** The far end's label as recorded on the cable, else null. */
  farLabel: string | null;
}

/**
 * Normalize a polymorphic type discriminator for comparison. Mirrors the
 * backend's `devices.polymorphic_aliases` tolerance: "physical-servers" and
 * "physical_servers" (and "Physical-Servers") must all be treated as equal.
 */
function normalizeType(t: string | null | undefined): string {
  return (t ?? "").trim().toLowerCase().replace(/_/g, "-");
}

function normalizeLabel(l: string | null | undefined): string {
  return (l ?? "").trim().toLowerCase();
}

/**
 * copper vs fiber from a DeviceInterface's free-text `speed` column — mirrors
 * the backend's `ports._interface_port_type` rule exactly. Shared here so
 * every view that classifies interface ports (RackView, PortConfigView)
 * applies the identical rule instead of maintaining its own copy.
 */
export function interfacePortType(iface: { speed?: string | null }): string {
  const speed = String(iface.speed ?? "").toLowerCase();
  if (["sfp", "fiber", "fibre", "lc", "sr", "lr", "optical"].some((t) => speed.includes(t)))
    return "fiber";
  return "copper";
}

/**
 * True when `a` (the port we're resolving) matches the cable end described
 * by `type`/`id`/`endLabel`. Owner type+id must always match. When `a.label`
 * is provided, `endLabel` must also match it (trimmed, case-insensitive) —
 * this is what disambiguates individual ports on a multi-port owner. When
 * `a.label` is omitted, matching falls back to owner-only.
 */
function sameEnd(
  a: PortRef,
  type: string | null | undefined,
  id: number | null | undefined,
  endLabel: string | null | undefined,
): boolean {
  if (a.id == null || id == null) return false;
  if (normalizeType(a.type) !== normalizeType(type) || Number(a.id) !== Number(id)) return false;
  if (a.label == null || a.label === "") return true;
  return normalizeLabel(a.label) === normalizeLabel(endLabel);
}

/**
 * Resolve whether `port` has an existing Cable, and describe the far end.
 * A cable matches when `port` equals either its A or B end; the OTHER end is
 * reported as `farEnd`. When multiple cables match (should not normally
 * happen — a port has at most one connection), the first match wins.
 */
export function resolveConnection(port: PortRef, cables: CableRow[] | undefined): ConnectionResolution {
  const none: ConnectionResolution = {
    connected: false,
    cable: null,
    farEnd: null,
    ownLabel: null,
    farLabel: null,
  };
  if (!cables || cables.length === 0) return none;

  for (const cable of cables) {
    if (sameEnd(port, cable.port_a_type, cable.port_a_id, cable.label_a)) {
      return {
        connected: true,
        cable,
        farEnd: { type: cable.port_b_type, id: cable.port_b_id, label: cable.label_b ?? null },
        ownLabel: cable.label_a ?? null,
        farLabel: cable.label_b ?? null,
      };
    }
    if (sameEnd(port, cable.port_b_type, cable.port_b_id, cable.label_b)) {
      return {
        connected: true,
        cable,
        farEnd: { type: cable.port_a_type, id: cable.port_a_id, label: cable.label_a ?? null },
        ownLabel: cable.label_b ?? null,
        farLabel: cable.label_a ?? null,
      };
    }
  }
  return none;
}
