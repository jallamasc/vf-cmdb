// FEAT-6 (6A) — RackDiagramSVG face-aware rendering.
// Feature: rack-back-and-cabling. Covers Req 1.5, 2.3/2.4/2.5, 6.6, 7.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import RackDiagramSVG, { PORT_TYPE_HEX, RackPort } from "./RackDiagramSVG";

const rack = { id: 1, total_units: 4 };
const units = [
  { id: 10, unit_number: 1, height_units: 1, device_type: "switch", label: "SW1" },
];

const ports: RackPort[] = [
  { port_kind: "interface", port_id: 1, owner_type: "network-devices", owner_id: 1, label: "eth0", port_type: "copper", unit_number: 1 },
  { port_kind: "interface", port_id: 2, owner_type: "network-devices", owner_id: 1, label: "sfp1", port_type: "fiber", unit_number: 1 },
  { port_kind: "outlet", port_id: 3, owner_type: "power-devices", owner_id: 1, label: "PWR-A", port_type: "power", unit_number: 1 },
];

describe("RackDiagramSVG", () => {
  it("draws no port dots on the front face", () => {
    const { container } = render(
      <RackDiagramSVG rack={rack} units={units} face="front" ports={ports} />
    );
    // Front face has no connector-dot circles.
    expect(container.querySelectorAll("circle").length).toBe(0);
  });

  it("draws one colour-coded dot per port on the back face", () => {
    const { container } = render(
      <RackDiagramSVG rack={rack} units={units} face="back" ports={ports} />
    );
    const circles = Array.from(container.querySelectorAll("circle"));
    expect(circles.length).toBe(3);
    const fills = circles.map((c) => c.getAttribute("fill"));
    expect(fills).toContain(PORT_TYPE_HEX.copper);
    expect(fills).toContain(PORT_TYPE_HEX.fiber);
    expect(fills).toContain(PORT_TYPE_HEX.power);
  });

  it("fires onPortClick when a back-face dot is clicked", () => {
    const onPortClick = vi.fn();
    const { container } = render(
      <RackDiagramSVG rack={rack} units={units} face="back" ports={ports} onPortClick={onPortClick} />
    );
    const circle = container.querySelector("circle");
    expect(circle).toBeTruthy();
    fireEvent.click(circle!);
    expect(onPortClick).toHaveBeenCalledTimes(1);
  });

  it("renders a stencil <image> on the front face when provided", () => {
    const { container } = render(
      <RackDiagramSVG
        rack={rack}
        units={units}
        face="front"
        stencilHrefByType={{ switch: "/api/v1/stencils/network-device-types-1" }}
      />
    );
    const image = container.querySelector("image");
    expect(image).toBeTruthy();
    expect(image!.getAttribute("href")).toContain("/stencils/");
  });
});
