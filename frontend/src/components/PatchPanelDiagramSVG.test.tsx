// Phase 4 Task 21 — PatchPanelDiagramSVG: grid layout, connection state,
// click routing.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import PatchPanelDiagramSVG from "./PatchPanelDiagramSVG";

const panel = { id: 5, panel_id_label: "PP-A" };

const ports = [
  { id: 1, port_number: 1, label: "P1" },
  { id: 2, port_number: 2, label: "P2" },
  { id: 3, port_number: 3, label: "P3" },
];

describe("PatchPanelDiagramSVG", () => {
  it("renders one dot per port", () => {
    const { container } = render(<PatchPanelDiagramSVG panel={panel} ports={ports} />);
    expect(container.querySelectorAll("circle").length).toBe(3);
  });

  it("renders port numbers as labels", () => {
    const { container } = render(<PatchPanelDiagramSVG panel={panel} ports={ports} />);
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("1");
    expect(texts).toContain("2");
    expect(texts).toContain("3");
  });

  it("only marks the specifically-cabled port as connected, not every port on the panel", () => {
    const cables = [
      {
        id: 1,
        cable_type: "copper",
        port_a_type: "patch-panels",
        port_a_id: 5,
        port_b_type: "network-devices",
        port_b_id: 9,
        label_a: "P2",
        label_b: "eth0",
      },
    ];
    const { container } = render(
      <PatchPanelDiagramSVG panel={panel} ports={ports} cables={cables} />
    );
    const circles = Array.from(container.querySelectorAll("circle"));
    // Connected dot = halo ring (fill="none") + solid dot = 2 circles;
    // the other 2 unconnected ports = 1 hollow circle each. Total = 4.
    expect(circles.length).toBe(4);
    const solid = circles.filter(
      (c) => c.getAttribute("fill") !== "#ffffff" && c.getAttribute("fill") !== "none"
    );
    expect(solid.length).toBe(1);
  });

  it("passes a patch_panel_port-shaped RackPort + resolution to onPortClick", () => {
    const onPortClick = vi.fn();
    const { container } = render(
      <PatchPanelDiagramSVG panel={panel} ports={ports} onPortClick={onPortClick} />
    );
    fireEvent.click(container.querySelectorAll("g")[1]); // first ConnectionDot's <g>
    expect(onPortClick).toHaveBeenCalledTimes(1);
    const [port, resolution] = onPortClick.mock.calls[0];
    expect(port.port_kind).toBe("patch_panel_port");
    expect(port.owner_type).toBe("patch-panels");
    expect(port.owner_id).toBe(5);
    expect(resolution.connected).toBe(false);
  });

  it("wraps to a second row past 24 ports", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, port_number: i + 1 }));
    const { container } = render(<PatchPanelDiagramSVG panel={panel} ports={many} />);
    expect(container.querySelectorAll("circle").length).toBe(30);
  });
});
