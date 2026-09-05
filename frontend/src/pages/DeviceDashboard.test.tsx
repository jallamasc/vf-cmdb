// Phase 4 Task 27 — AnsibleFactsTab: promoted fields + collapsible JSON tree.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnsibleFactsTab, JsonTree } from "./DeviceDashboard";
import type { DeviceDetail } from "../api";

function makeDetail(record: Record<string, unknown>): DeviceDetail {
  return {
    device_type: "physical_servers",
    resource: "physical-servers",
    table: "physical_servers",
    label: "Physical Server",
    id: 1,
    display_name: "SRV-1",
    name_fields: [],
    relations: [],
    relation_resources: {},
    context: {
      site: null, datacenter: null, room: null, rack: null,
      rack_unit: null, host_server: null, position: null,
    },
    record,
  };
}

describe("JsonTree", () => {
  it("renders primitive values directly", () => {
    render(<JsonTree data="hello" />);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders an empty object/array as a compact placeholder", () => {
    const { container } = render(<JsonTree data={{}} />);
    expect(container.textContent).toContain("{}");
  });

  it("renders a nested object as an expandable tree with its keys visible", () => {
    render(<JsonTree data={{ kernel: "5.15.0", nested: { arch: "x86_64" } }} defaultOpen />);
    expect(screen.getByText(/kernel:/)).toBeInTheDocument();
    expect(screen.getByText(/nested:/)).toBeInTheDocument();
    expect(screen.getByText(/arch:/)).toBeInTheDocument();
  });
});

describe("AnsibleFactsTab", () => {
  it("shows an empty state when nothing has been collected", () => {
    render(<AnsibleFactsTab detail={makeDetail({})} />);
    expect(screen.getByText(/No fact collection has run/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing collected yet/)).toBeInTheDocument();
  });

  it("renders the promoted fields when present", () => {
    render(
      <AnsibleFactsTab
        detail={makeDetail({
          cpu_cores: 8,
          memory_mb: 16384,
          os_distribution: "Ubuntu 22.04",
          last_fact_sync_at: "2026-01-01T00:00:00Z",
          ansible_facts: { cpu_cores: 8, memory_mb: 16384, os_distribution: "Ubuntu 22.04", kernel: "5.15.0" },
        })}
      />
    );
    expect(screen.getAllByText("8").length).toBeGreaterThan(0);
    expect(screen.getAllByText("16384").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ubuntu 22.04").length).toBeGreaterThan(0);
    expect(screen.getByText(/Last synced/)).toBeInTheDocument();
  });

  it("renders the full facts blob as a JSON tree", () => {
    render(
      <AnsibleFactsTab
        detail={makeDetail({
          ansible_facts: { kernel: "5.15.0", hostname: "srv1" },
        })}
      />
    );
    expect(screen.getByText(/kernel:/)).toBeInTheDocument();
    expect(screen.getByText(/hostname:/)).toBeInTheDocument();
  });

  it("shows the POST endpoint hint with the device's own resource+id", () => {
    render(<AnsibleFactsTab detail={makeDetail({})} />);
    expect(screen.getByText(/\/api\/v1\/devices\/physical-servers\/1\/facts/)).toBeInTheDocument();
  });
});
