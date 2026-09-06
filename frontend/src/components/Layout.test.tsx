// Phase 5 Task 8 — every nav entry (and section header) renders an icon,
// not just text (Req 6.1).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Layout from "./Layout";

function wrap() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("Layout — navigation icons (Req 6.1)", () => {
  it("renders an svg icon inside every nav link", () => {
    wrap();
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link.querySelector("svg")).toBeTruthy();
    });
  });

  it("renders an icon next to every section header", () => {
    wrap();
    expect(screen.getByText("Reference").querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Networking & IPAM").querySelector("svg")).toBeTruthy();
  });
});
