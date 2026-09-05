// Phase 4 Task 24 — PortConfigDiagramSVG: dual click targets (connect vs
// settings), fiber/copper classification, connection state.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import PortConfigDiagramSVG from "./PortConfigDiagramSVG";

const device = { id: 3, vf_long_name: "SW-CORE-01" };

const ports = [
  { id: 1, port_number: 1, description: "uplink", speed: "10G-SFP" },
  { id: 2, port_number: 2, description: "srv1", speed: "1G" },
  { id: 3, port_number: 3, description: "srv2", speed: "1G" },
];

describe("PortConfigDiagramSVG", () => {
  it("renders one dot per port", () => {
    const { container } = render(<PortConfigDiagramSVG device={device} ports={ports} />);
    expect(container.querySelectorAll("circle").length).toBe(3);
  });

  it("classifies fiber vs copper by speed for the dot colour", () => {
    const { container } = render(<PortConfigDiagramSVG device={device} ports={ports} />);
    const circles = Array.from(container.querySelectorAll("circle"));
    const strokes = circles.map((c) => c.getAttribute("stroke"));
    // fiber (#f97316) for port 1, copper (#2563eb) for ports 2/3.
    expect(strokes).toContain("#f97316");
    expect(strokes.filter((s) => s === "#2563eb").length).toBe(2);
  });

  it("renders a settings (gear) glyph per port only when onSettingsClick is given", () => {
    const { container: noHandler } = render(
      <PortConfigDiagramSVG device={device} ports={ports} />
    );
    expect(noHandler.textContent).not.toContain("⚙");

    const { container: withHandler } = render(
      <PortConfigDiagramSVG device={device} ports={ports} onSettingsClick={vi.fn()} />
    );
    expect(withHandler.textContent?.match(/⚙/g)?.length).toBe(3);
  });

  it("clicking the gear glyph calls onSettingsClick with the RAW interface row, not a RackPort", () => {
    const onSettingsClick = vi.fn();
    const { container } = render(
      <PortConfigDiagramSVG device={device} ports={ports} onSettingsClick={onSettingsClick} />
    );
    const gear = Array.from(container.querySelectorAll("text")).find((t) =>
      t.textContent?.includes("⚙")
    );
    fireEvent.click(gear!);
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
    const [iface] = onSettingsClick.mock.calls[0];
    expect(iface.id).toBe(1);
    expect(iface.description).toBe("uplink");
  });

  it("clicking the connection dot (not the gear) calls onPortClick with a RackPort + resolution", () => {
    const onPortClick = vi.fn();
    const onSettingsClick = vi.fn();
    const { container } = render(
      <PortConfigDiagramSVG
        device={device}
        ports={ports}
        onPortClick={onPortClick}
        onSettingsClick={onSettingsClick}
      />
    );
    // The dot's own <g> is the first <g> per port group; click it directly.
    const dotGroup = container.querySelectorAll("g")[1]; // ConnectionDot's inner <g>
    fireEvent.click(dotGroup);
    expect(onPortClick).toHaveBeenCalledTimes(1);
    expect(onSettingsClick).not.toHaveBeenCalled();
    const [port, resolution] = onPortClick.mock.calls[0];
    expect(port.port_kind).toBe("interface");
    expect(port.owner_type).toBe("network-devices");
    expect(port.owner_id).toBe(3);
    expect(resolution.connected).toBe(false);
  });

  it("only marks the specifically-cabled port as connected", () => {
    const cables = [
      {
        id: 1,
        cable_type: "fiber",
        port_a_type: "network-devices",
        port_a_id: 3,
        port_b_type: "physical-servers",
        port_b_id: 9,
        label_a: "uplink",
        label_b: "nic1",
      },
    ];
    const { container } = render(
      <PortConfigDiagramSVG device={device} ports={ports} cables={cables} />
    );
    const circles = Array.from(container.querySelectorAll("circle"));
    const solid = circles.filter(
      (c) => c.getAttribute("fill") !== "#ffffff" && c.getAttribute("fill") !== "none"
    );
    expect(solid.length).toBe(1);
  });
});
