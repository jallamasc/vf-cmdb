// Phase 4 Req 20 — ConnectionDot visual states + click routing.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import ConnectionDot from "./ConnectionDot";
import { PORT_TYPE_HEX } from "./RackDiagramSVG";

// ConnectionDot renders bare SVG elements (<g>/<circle>) meant to live inside
// an <svg> root (as RackDiagramSVG does); wrap it here too so jsdom doesn't
// warn about unrecognized tags outside the SVG namespace.
function renderDot(ui: React.ReactElement) {
  return render(<svg>{ui}</svg>);
}

describe("ConnectionDot", () => {
  it("renders hollow (white fill, thick coloured stroke) when unconnected", () => {
    const { container } = renderDot(
      <ConnectionDot cx={10} cy={10} portType="copper" connected={false} />
    );
    const circle = container.querySelector("circle");
    expect(circle).toBeTruthy();
    expect(circle!.getAttribute("fill")).toBe("#ffffff");
    expect(circle!.getAttribute("stroke")).toBe(PORT_TYPE_HEX.copper);
    // Only one circle — no halo ring when unconnected.
    expect(container.querySelectorAll("circle").length).toBe(1);
  });

  it("renders solid (filled) with a halo ring when connected", () => {
    const { container } = renderDot(
      <ConnectionDot cx={10} cy={10} portType="fiber" connected />
    );
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2); // halo + dot
    const dot = circles[1];
    expect(dot.getAttribute("fill")).toBe(PORT_TYPE_HEX.fiber);
  });

  it("colours by port type, falling back to slate for an unknown type", () => {
    const { container } = renderDot(
      <ConnectionDot cx={10} cy={10} portType="mystery" connected={false} />
    );
    const circle = container.querySelector("circle");
    expect(circle!.getAttribute("stroke")).toBe("#94a3b8");
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    const { container } = renderDot(
      <ConnectionDot cx={10} cy={10} portType="power" connected={false} onClick={onClick} />
    );
    fireEvent.click(container.querySelector("g")!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a <title> tooltip when given", () => {
    const { container } = renderDot(
      <ConnectionDot cx={10} cy={10} portType="power" connected title="eth0 → SRV4 nic1" />
    );
    expect(container.querySelector("title")?.textContent).toBe("eth0 → SRV4 nic1");
  });
});
