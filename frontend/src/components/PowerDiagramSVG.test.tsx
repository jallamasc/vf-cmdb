// Phase 4 Task 23 — PowerDiagramSVG: stencil vs fallback rendering,
// anchor-aware positioning, connection state, click routing.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import PowerDiagramSVG from "./PowerDiagramSVG";

const device = { id: 9, vf_long_name: "PDU-A" };

const outlets = [
  { id: 1, port_number: 1, label: "O1" },
  { id: 2, port_number: 2, label: "O2" },
  { id: 3, port_number: 3, label: "O3" },
];

describe("PowerDiagramSVG", () => {
  it("renders a plain frame (no <image>) when there is no stencil", () => {
    const { container } = render(<PowerDiagramSVG device={device} outlets={outlets} />);
    expect(container.querySelector("image")).toBeNull();
    expect(container.querySelector("rect")).toBeTruthy();
  });

  // Phase 6 Task 28 (Req 11.1/11.2).
  it("renders a category-appropriate fallback icon when there is no stencil", () => {
    const { container } = render(
      <PowerDiagramSVG device={{ ...device, device_type: "pdu" }} outlets={outlets} />
    );
    // "pdu" -> the "Zap" lucide icon.
    expect(container.querySelector("svg.lucide-zap")).toBeTruthy();
    // Untouched by the fallback icon (Req 11.2).
    expect(container.querySelectorAll("circle").length).toBe(3);
  });

  it("does not render the fallback icon once a stencil is configured", () => {
    const { container } = render(
      <PowerDiagramSVG
        device={{ ...device, device_type: "pdu" }}
        outlets={outlets}
        stencilHref="/x.svg"
      />
    );
    expect(container.querySelector("svg.lucide-zap")).toBeNull();
  });

  it("renders the stencil <image> when a stencilHref is given", () => {
    const { container } = render(
      <PowerDiagramSVG device={device} outlets={outlets} stencilHref="/api/v1/stencils/power-device-types-1" />
    );
    const image = container.querySelector("image");
    expect(image).toBeTruthy();
    expect(image!.getAttribute("href")).toContain("/stencils/");
  });

  it("renders one dot per outlet in both the stencil and fallback paths", () => {
    const { container: noStencil } = render(<PowerDiagramSVG device={device} outlets={outlets} />);
    expect(noStencil.querySelectorAll("circle").length).toBe(3);

    const { container: withStencil } = render(
      <PowerDiagramSVG device={device} outlets={outlets} stencilHref="/x.svg" />
    );
    expect(withStencil.querySelectorAll("circle").length).toBe(3);
  });

  it("uses a mapped anchor's position instead of the grid fallback when one exists", () => {
    const anchors = [
      { owner_resource: "power-device-types", owner_id: 1, face: "front" as const, port_key: "2", x: 0.9, y: 0.9 },
    ];
    const { container } = render(
      <PowerDiagramSVG device={device} outlets={outlets} anchors={anchors} />
    );
    const circles = Array.from(container.querySelectorAll("circle"));
    // Outlet 2's dot should sit near the anchor's (0.9, 0.9) corner, i.e. far
    // larger cx/cy than outlet 1 or 3 which use the grid fallback.
    const cxs = circles.map((c) => Number(c.getAttribute("cx")));
    expect(Math.max(...cxs)).toBeGreaterThan(200);
  });

  it("only marks the specifically-cabled outlet as connected", () => {
    const cables = [
      {
        id: 1,
        cable_type: "power",
        port_a_type: "power-devices",
        port_a_id: 9,
        port_b_type: "network-devices",
        port_b_id: 4,
        label_a: "O2",
        label_b: "psu1",
      },
    ];
    const { container } = render(
      <PowerDiagramSVG device={device} outlets={outlets} cables={cables} />
    );
    const circles = Array.from(container.querySelectorAll("circle"));
    const solid = circles.filter(
      (c) => c.getAttribute("fill") !== "#ffffff" && c.getAttribute("fill") !== "none"
    );
    expect(solid.length).toBe(1);
  });

  // Phase 5 Task 10 — visual overhaul: the device box itself shows a hover
  // tooltip, in both the fallback and stencil paths.
  it("shows the device name as a tooltip on the fallback box", () => {
    const { container } = render(<PowerDiagramSVG device={device} outlets={outlets} />);
    const title = container.querySelector("rect title");
    expect(title?.textContent).toBe("PDU-A");
  });

  it("shows the device name as a tooltip on the stencil image", () => {
    const { container } = render(
      <PowerDiagramSVG device={device} outlets={outlets} stencilHref="/x.svg" />
    );
    const title = container.querySelector("image title");
    expect(title?.textContent).toBe("PDU-A");
  });

  it("passes an outlet-shaped RackPort + resolution to onPortClick", () => {
    const onPortClick = vi.fn();
    const { container } = render(
      <PowerDiagramSVG device={device} outlets={outlets} onPortClick={onPortClick} />
    );
    fireEvent.click(container.querySelectorAll("g")[1]);
    expect(onPortClick).toHaveBeenCalledTimes(1);
    const [port, resolution] = onPortClick.mock.calls[0];
    expect(port.port_kind).toBe("outlet");
    expect(port.owner_type).toBe("power-devices");
    expect(port.owner_id).toBe(9);
    expect(resolution.connected).toBe(false);
  });
});
