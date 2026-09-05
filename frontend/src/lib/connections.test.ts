import { describe, it, expect } from "vitest";
import { resolveConnection, CableRow, interfacePortType } from "./connections";

const cables: CableRow[] = [
  {
    id: 1,
    cable_type: "copper",
    port_a_type: "network-devices",
    port_a_id: 3,
    port_b_type: "physical-servers",
    port_b_id: 4,
    label_a: "e0",
    label_b: "nic1",
    label: "SW3-e0→SRV4-nic1",
  },
];

// A single 28-port switch (owner id 3) with only its "e0" port cabled. This
// is the exact ambiguity resolveConnection must handle: many ports share the
// same owner id, so only label matching can tell them apart.
const multiPortCables: CableRow[] = [
  {
    id: 5,
    cable_type: "copper",
    port_a_type: "network-devices",
    port_a_id: 3,
    port_b_type: "physical-servers",
    port_b_id: 4,
    label_a: "e0",
    label_b: "nic1",
    label: "SW3-e0→SRV4-nic1",
  },
];

describe("resolveConnection", () => {
  it("resolves a connected A-end port to its far end", () => {
    const res = resolveConnection({ type: "network-devices", id: 3 }, cables);
    expect(res.connected).toBe(true);
    expect(res.farEnd).toEqual({ type: "physical-servers", id: 4, label: "nic1" });
    expect(res.ownLabel).toBe("e0");
    expect(res.farLabel).toBe("nic1");
    expect(res.cable?.id).toBe(1);
  });

  it("resolves a connected B-end port to its far end (reverse direction)", () => {
    const res = resolveConnection({ type: "physical-servers", id: 4 }, cables);
    expect(res.connected).toBe(true);
    expect(res.farEnd).toEqual({ type: "network-devices", id: 3, label: "e0" });
    expect(res.ownLabel).toBe("nic1");
    expect(res.farLabel).toBe("e0");
  });

  it("is tolerant of underscore/hyphen and casing differences in the type", () => {
    const res = resolveConnection({ type: "Network_Devices", id: 3 }, cables);
    expect(res.connected).toBe(true);
  });

  it("reports unconnected for a port with no matching cable", () => {
    const res = resolveConnection({ type: "network-devices", id: 999 }, cables);
    expect(res.connected).toBe(false);
    expect(res.cable).toBeNull();
    expect(res.farEnd).toBeNull();
  });

  it("reports unconnected for an empty cable list", () => {
    const res = resolveConnection({ type: "network-devices", id: 3 }, []);
    expect(res.connected).toBe(false);
  });

  it("never matches when the port has no id", () => {
    const res = resolveConnection({ type: "network-devices", id: null }, cables);
    expect(res.connected).toBe(false);
  });

  it("falls back to owner-only matching when no label is given (backward compat)", () => {
    const res = resolveConnection({ type: "network-devices", id: 3 }, multiPortCables);
    expect(res.connected).toBe(true);
  });

  it("disambiguates ports on the same owner: the cabled port label matches", () => {
    const res = resolveConnection({ type: "network-devices", id: 3, label: "e0" }, multiPortCables);
    expect(res.connected).toBe(true);
    expect(res.farEnd).toEqual({ type: "physical-servers", id: 4, label: "nic1" });
  });

  it("disambiguates ports on the same owner: a different port label on the same owner is NOT connected", () => {
    const res = resolveConnection({ type: "network-devices", id: 3, label: "e1" }, multiPortCables);
    expect(res.connected).toBe(false);
  });

  it("label matching is case-insensitive and trims whitespace", () => {
    const res = resolveConnection({ type: "network-devices", id: 3, label: "  E0  " }, multiPortCables);
    expect(res.connected).toBe(true);
  });

  it("disambiguates on the B end too: wrong label on the same owner is not connected", () => {
    const res = resolveConnection({ type: "physical-servers", id: 4, label: "nic2" }, multiPortCables);
    expect(res.connected).toBe(false);
  });

  it("disambiguates on the B end: correct label on the same owner is connected", () => {
    const res = resolveConnection({ type: "physical-servers", id: 4, label: "nic1" }, multiPortCables);
    expect(res.connected).toBe(true);
  });
});

describe("interfacePortType", () => {
  it("classifies fiber-ish speed strings as fiber", () => {
    for (const speed of ["10G-SFP", "SFP+", "Fiber", "1000BASE-LR", "optical"]) {
      expect(interfacePortType({ speed })).toBe("fiber");
    }
  });

  it("classifies everything else as copper, including null/empty speed", () => {
    expect(interfacePortType({ speed: "1G" })).toBe("copper");
    expect(interfacePortType({ speed: null })).toBe("copper");
    expect(interfacePortType({})).toBe("copper");
  });
});
