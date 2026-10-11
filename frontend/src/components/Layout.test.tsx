// Phase 5 Task 8 — every nav entry (and section header) renders an icon,
// not just text (Req 6.1).
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./Layout";

function wrap() {
  // Layout now mounts <VersionFooter/>, which calls useQuery — it needs a
  // QueryClientProvider ancestor (as in the live app's main.tsx).
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<div>home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
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
