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
    // One <g> wrapper per port dot (ConnectionDot), each carrying a circle
    // stroked in its port-type colour. All are unconnected here (no cables).
    const circles = Array.from(container.querySelectorAll("circle"));
    expect(circles.length).toBe(3);
    const strokes = circles.map((c) => c.getAttribute("stroke"));
    expect(strokes).toContain(PORT_TYPE_HEX.copper);
    expect(strokes).toContain(PORT_TYPE_HEX.fiber);
    expect(strokes).toContain(PORT_TYPE_HEX.power);
    // Unconnected dots are hollow (white fill), not solid.
    circles.forEach((c) => expect(c.getAttribute("fill")).toBe("#ffffff"));
  });

  // Phase 4 Req 20 — cabled ports render solid/filled with a halo ring, and
  // the far end shows up in the hover tooltip.
  it("draws a connected port solid-filled when a matching cable is passed", () => {
    const cables = [
      {
        id: 1,
        cable_type: "copper",
        port_a_type: "network-devices",
        port_a_id: 1,
        port_b_type: "physical-servers",
        port_b_id: 9,
        label_a: "eth0",
        label_b: "nic1",
      },
    ];
    const { container } = render(
      <RackDiagramSVG rack={rack} units={units} face="back" ports={ports} cables={cables} />
    );
    const circles = Array.from(container.querySelectorAll("circle"));
    // 3 ports, but the connected one gets an extra halo ring circle.
    expect(circles.length).toBe(4);
    const filled = circles.filter((c) => c.getAttribute("fill") === PORT_TYPE_HEX.copper);
    expect(filled.length).toBe(1); // only eth0's dot (matches cable's label_a)
  });

  it("does not mark a same-owner, different-label port as connected", () => {
    const cables = [
      {
        id: 1,
        cable_type: "copper",
        port_a_type: "network-devices",
        port_a_id: 1,
        port_b_type: "physical-servers",
        port_b_id: 9,
        label_a: "eth0", // ports[0].label; ports[1] ("sfp1") shares the same owner_id=1
        label_b: "nic1",
      },
    ];
    const { container } = render(
      <RackDiagramSVG rack={rack} units={units} face="back" ports={ports} cables={cables} />
    );
    const circles = Array.from(container.querySelectorAll("circle"));
    // Only ONE dot is solid-filled (eth0) even though two ports share
    // owner_id=1. Exclude the connected dot's halo ring (fill="none").
    const solidFills = circles.filter(
      (c) => c.getAttribute("fill") !== "#ffffff" && c.getAttribute("fill") !== "none"
    );
    expect(solidFills.length).toBe(1);
  });

  it("passes the resolveConnection result to onPortClick", () => {
    const cables = [
      {
        id: 1,
        cable_type: "copper",
        port_a_type: "network-devices",
        port_a_id: 1,
        port_b_type: "physical-servers",
        port_b_id: 9,
        label_a: "eth0",
        label_b: "nic1",
      },
    ];
    const onPortClick = vi.fn();
    const { container } = render(
      <RackDiagramSVG
        rack={rack}
        units={units}
        face="back"
        ports={ports}
        cables={cables}
        onPortClick={onPortClick}
      />
    );
    // Click the connected dot (eth0): it's drawn with a halo, so its own
    // circle is the SECOND circle among the 4 rendered.
    const gs = Array.from(container.querySelectorAll("g")).filter(
      (g) => g.querySelector("circle") && g.querySelector("title")?.textContent?.includes("eth0")
    );
    expect(gs.length).toBe(1);
    fireEvent.click(gs[0]);
    expect(onPortClick).toHaveBeenCalledTimes(1);
    const [, resolution] = onPortClick.mock.calls[0];
    expect(resolution.connected).toBe(true);
    expect(resolution.farLabel).toBe("nic1");
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
        stencilHrefByUnit={{ 10: "/api/v1/stencils/network-device-types-1" }}
      />
    );
    const image = container.querySelector("image");
    expect(image).toBeTruthy();
    expect(image!.getAttribute("href")).toContain("/stencils/");
  });

  it("renders a stencil <image> on the back face too, at full opacity", () => {
    const { container } = render(
      <RackDiagramSVG
        rack={rack}
        units={units}
        face="back"
        stencilHrefByUnit={{ 10: "/api/v1/stencils/network-device-types-1" }}
      />
    );
    const image = container.querySelector("image");
    expect(image).toBeTruthy();
    expect(image!.getAttribute("href")).toContain("/stencils/");
    const group = image!.closest("g");
    expect(group?.getAttribute("opacity")).toBe("1");
  });

  it("dims the plain rectangle on the back face when no stencil is set", () => {
    const { container } = render(
      <RackDiagramSVG rack={rack} units={units} face="back" />
    );
    const rect = container.querySelector("g rect");
    const group = rect?.closest("g");
    expect(group?.getAttribute("opacity")).toBe("0.55");
  });
});
