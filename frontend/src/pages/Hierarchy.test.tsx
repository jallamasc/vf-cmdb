// Phase 5 Task 26/27 — Hierarchy: BlueprintList expand toggle + Section
// Quick Add + Rack Section picker (Req 21.3, 22.1, 22.3).
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Hierarchy from "./Hierarchy";
import { api } from "../api";

const FIXTURES: Record<string, any[]> = {
  sites: [],
  datacenters: [],
  "datacenter-floors": [{ id: 1, name: "Floor1", code: "f1", blueprint_url: null }],
  rooms: [{ id: 1, name: "Room1", code: "r1", datacenter_floor_id: 1, blueprint_url: null }],
  sections: [{ id: 1, name: "Section1", code: "s1", room_id: 1, blueprint_url: null }],
  racks: [],
  "rack-types": [],
  organizations: [],
  clouds: [],
  regions: [],
  campuses: [],
  buildings: [],
  "floor-sections": [],
};

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      list: vi.fn((resource: string) => Promise.resolve(FIXTURES[resource] ?? [])),
      create: vi.fn().mockResolvedValue({ id: 99 }),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function getCard(headingText: string): HTMLElement {
  const heading = screen.getByText(headingText);
  const card = heading.closest(".shadow-sm");
  if (!card) throw new Error(`Could not find the LevelCard for "${headingText}"`);
  return card as HTMLElement;
}

describe("Hierarchy — Room/Section blueprint + Section level (Req 21.3, 22.1, 22.3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expands an inline blueprint editor for a Room row on toggle", async () => {
    wrap(<Hierarchy />);
    await waitFor(() => expect(screen.getByText(/Room1/)).toBeTruthy());

    // Two "Blueprint" toggle buttons exist (Floors row + Rooms row) — this
    // is scoped by clicking within the Rooms card specifically.
    const roomsCard = getCard("Rooms");
    fireEvent.click(within(roomsCard).getByText("Blueprint"));

    await waitFor(() => expect(within(roomsCard).getByText("Upload blueprint")).toBeTruthy());
  });

  it("shows a Sections level with a Room picker", async () => {
    wrap(<Hierarchy />);
    await waitFor(() => expect(screen.getByText(/Section1/)).toBeTruthy());
    expect(screen.getByText("Sections")).toBeTruthy();
  });

  it("creates a Section scoped to the chosen Room via Quick Add", async () => {
    wrap(<Hierarchy />);
    await waitFor(() => expect(screen.getByText(/Section1/)).toBeTruthy());

    const sectionsCard = getCard("Sections");
    fireEvent.click(within(sectionsCard).getByText("+ Quick Add"));

    // `Field`'s <label> is a sibling of its control (not a wrapping
    // element), so implicit label association doesn't apply — locate each
    // control via the label text node's next sibling instead.
    const nameInput = within(sectionsCard).getByText("Name").nextElementSibling as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Section" } });
    const roomSelect = within(sectionsCard).getByText("Room (parent)")
      .nextElementSibling as HTMLSelectElement;
    fireEvent.change(roomSelect, { target: { value: "1" } });
    fireEvent.click(within(sectionsCard).getByText("Create"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        "sections",
        expect.objectContaining({ name: "New Section", room_id: 1 })
      )
    );
  });

  it("Phase 6 Task 13/14: Floor Quick Add defaults to auto-generated code (no code/naming_mode sent)", async () => {
    wrap(<Hierarchy />);
    await waitFor(() => expect(screen.getByText(/Floor1/)).toBeTruthy());

    const floorsCard = getCard("Floors");
    fireEvent.click(within(floorsCard).getByText("+ Quick Add"));
    const nameInput = within(floorsCard).getByText("Name").nextElementSibling as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Floor" } });
    expect(within(floorsCard).queryByText(/Abbreviation/)).toBeNull();
    fireEvent.click(within(floorsCard).getByText("Create"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        "datacenter-floors",
        expect.not.objectContaining({ naming_mode: "manual" })
      )
    );
  });

  it("Phase 6 Task 13/14: unchecking Auto-generate code reveals the manual code field and sends naming_mode manual", async () => {
    wrap(<Hierarchy />);
    await waitFor(() => expect(screen.getByText(/Section1/)).toBeTruthy());

    const sectionsCard = getCard("Sections");
    fireEvent.click(within(sectionsCard).getByText("+ Quick Add"));
    const nameInput = within(sectionsCard).getByText("Name").nextElementSibling as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Manual Section" } });
    const roomSelect = within(sectionsCard).getByText("Room (parent)")
      .nextElementSibling as HTMLSelectElement;
    fireEvent.change(roomSelect, { target: { value: "1" } });

    fireEvent.click(within(sectionsCard).getByText("Auto-generate code (Code Mode)"));
    expect(within(sectionsCard).queryByText(/Abbreviation/)).toBeTruthy();

    fireEvent.click(within(sectionsCard).getByText("Create"));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        "sections",
        expect.objectContaining({ name: "Manual Section", room_id: 1, naming_mode: "manual" })
      )
    );
  });

  it("offers a Section picker on the Rack Quick Add form", async () => {
    wrap(<Hierarchy />);
    await waitFor(() => expect(screen.getByText(/Section1/)).toBeTruthy());

    const racksCard = getCard("Racks");
    fireEvent.click(within(racksCard).getByText("+ Quick Add"));

    expect(within(racksCard).getByText(/Section \(or Floor, or Room/i)).toBeTruthy();
  });

  // Round 6 QA — "check that every field ... has a fantastic name with a
  // totally enabled dropdown to select fantastic names". Floor/Room/
  // Section's ThemeNameEditor used to be a plain text input only; it now
  // also offers the same catalogue-backed "🎭 Pick" picker every other
  // themed resource has.
  it("offers a 🎭 Pick catalogue picker (not just free text) in a Room's Fantastic Name editor", async () => {
    wrap(<Hierarchy />);
    await waitFor(() => expect(screen.getByText(/Room1/)).toBeTruthy());

    const roomsCard = getCard("Rooms");
    fireEvent.click(within(roomsCard).getByText("🎭 Fantastic name"));

    expect(within(roomsCard).getByPlaceholderText("Fantastic name (nickname)")).toBeTruthy();
    expect(within(roomsCard).getByText("🎭 Pick")).toBeTruthy();
  });
});
