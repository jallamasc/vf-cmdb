// Phase 4 Task 10 / Phase 5 Task 30 (Req 25.1/25.2/25.3) — AirportCellEditor:
// search-and-select IATA code in-cell, now gated behind a required Country.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import AirportCellEditor from "./AirportCellEditor";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      airportCode: vi.fn(),
      airportCountries: vi.fn().mockResolvedValue({ countries: ["Colombia", "Costa Rica"] }),
    },
  };
});

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    value: "",
    api: { stopEditing: vi.fn() },
    ...overrides,
  } as any;
}

async function selectCountry(name: string) {
  const select = await screen.findByLabelText("Country");
  await waitFor(() => expect(within(select).getByText(name)).toBeTruthy());
  fireEvent.change(select, { target: { value: name } });
}

describe("AirportCellEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables the search input until a Country is selected", async () => {
    (api.airportCountries as any).mockResolvedValue({ countries: ["Colombia"] });
    render(<AirportCellEditor {...baseProps()} ref={createRef()} />);
    const input = await screen.findByPlaceholderText("Select a country first…");
    expect(input).toBeDisabled();
  });

  it("queries and lists matching airports scoped to the selected Country", async () => {
    (api.airportCountries as any).mockResolvedValue({ countries: ["Colombia"] });
    (api.airportCode as any).mockResolvedValue({
      matches: [{ iata: "BOG", city: "Bogotá", country: "Colombia", name: "El Dorado Intl" }],
    });
    render(<AirportCellEditor {...baseProps()} ref={createRef()} />);
    await screen.findByLabelText("Country");
    await selectCountry("Colombia");
    const input = await screen.findByPlaceholderText("City or IATA code…");
    fireEvent.change(input, { target: { value: "Bogota" } });
    await waitFor(
      () => expect(api.airportCode).toHaveBeenCalledWith("Bogota", 25, "Colombia"),
      { timeout: 500 },
    );
    expect(await screen.findByText(/El Dorado Intl/)).toBeInTheDocument();
  });

  it("commits the selected airport's IATA code and stops editing", async () => {
    (api.airportCountries as any).mockResolvedValue({ countries: ["Colombia"] });
    (api.airportCode as any).mockResolvedValue({
      matches: [{ iata: "BOG", city: "Bogotá", country: "Colombia", name: "El Dorado Intl" }],
    });
    const stopEditing = vi.fn();
    const ref = createRef<any>();
    render(<AirportCellEditor {...baseProps({ api: { stopEditing } })} ref={ref} />);
    await selectCountry("Colombia");
    const input = await screen.findByPlaceholderText("City or IATA code…");
    fireEvent.change(input, { target: { value: "Bogota" } });
    const option = await screen.findByText(/El Dorado Intl/);
    fireEvent.mouseDown(option);
    expect(ref.current.getValue()).toBe("BOG");
    await new Promise((r) => setTimeout(r, 0));
    expect(stopEditing).toHaveBeenCalled();
  });

  it("uppercases a manually typed code only once 'not listed' is checked (Req 25.2/25.3)", async () => {
    (api.airportCountries as any).mockResolvedValue({ countries: [] });
    const ref = createRef<any>();
    render(<AirportCellEditor {...baseProps()} ref={ref} />);
    await screen.findByText("Not listed in the catalogue");
    fireEvent.click(screen.getByLabelText("Not listed in the catalogue"));
    const input = await screen.findByPlaceholderText("City or IATA code…");
    fireEvent.change(input, { target: { value: "xyz" } });
    expect(ref.current.getValue()).toBe("XYZ");
  });

  it("does not commit a manually typed value while still gated (no Country, no override)", async () => {
    (api.airportCountries as any).mockResolvedValue({ countries: ["Colombia"] });
    const ref = createRef<any>();
    render(<AirportCellEditor {...baseProps()} ref={ref} />);
    const input = await screen.findByPlaceholderText("Select a country first…");
    fireEvent.change(input, { target: { value: "xyz" } });
    // Disabled inputs still allow a synthetic fireEvent.change in jsdom, but
    // the component must not have wired that keystroke into `committed`.
    expect(ref.current.getValue()).toBe("");
  });
});
