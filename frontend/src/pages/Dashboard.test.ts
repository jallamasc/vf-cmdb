// Phase 4 Task 1 — dashboard navigation resolvers.
import { describe, it, expect } from "vitest";
import { ROUTE_FOR_COUNT, tableToRoute } from "./Dashboard";

const LABEL_KEYS = [
  "sites",
  "racks",
  "network_devices",
  "physical_servers",
  "virtual_machines",
  "containers_apps",
  "workstations",
  "vlans",
  "subnets_ipv4",
  "subnets_ipv6",
  "ip_assignments",
];

describe("ROUTE_FOR_COUNT", () => {
  it("has a route for every dashboard summary key", () => {
    for (const key of LABEL_KEYS) {
      expect(ROUTE_FOR_COUNT[key]).toBeTruthy();
    }
  });
});

describe("tableToRoute", () => {
  it("routes device tables to the device dashboard", () => {
    expect(tableToRoute("network_devices", 5)).toBe("/devices/network_devices/5");
    expect(tableToRoute("physical_servers", 1)).toBe("/devices/physical_servers/1");
  });

  it("routes non-device tables to their listing page", () => {
    expect(tableToRoute("cables", 3)).toBe("/cables");
    expect(tableToRoute("vlans", 9)).toBe("/vlans");
  });

  it("returns null for an unknown table", () => {
    expect(tableToRoute("something_unmapped", 1)).toBeNull();
  });
});
