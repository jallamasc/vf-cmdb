// Phase 4 Task 10 — AirportCellEditor: search-and-select IATA code in-cell.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import AirportCellEditor from "./AirportCellEditor";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return { ...actual, api: { ...actual.api, airportCode: vi.fn() } };
});

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    value: "",
    api: { stopEditing: vi.fn() },
    ...overrides,
  } as any;
}

describe("AirportCellEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries and lists matching airports as the operator types a city", async () => {
    (api.airportCode as any).mockResolvedValue({
      matches: [{ iata: "BOG", city: "Bogotá", country: "Colombia", name: "El Dorado Intl" }],
    });
    render(<AirportCellEditor {...baseProps()} ref={createRef()} />);
    fireEvent.change(screen.getByPlaceholderText("City or IATA code…"), {
      target: { value: "Bogota" },
    });
    await waitFor(() => expect(api.airportCode).toHaveBeenCalledWith("Bogota"), {
      timeout: 500,
    });
    expect(await screen.findByText(/El Dorado Intl/)).toBeInTheDocument();
  });

  it("commits the selected airport's IATA code and stops editing", async () => {
    (api.airportCode as any).mockResolvedValue({
      matches: [{ iata: "BOG", city: "Bogotá", country: "Colombia", name: "El Dorado Intl" }],
    });
    const stopEditing = vi.fn();
    const ref = createRef<any>();
    render(<AirportCellEditor {...baseProps({ api: { stopEditing } })} ref={ref} />);
    fireEvent.change(screen.getByPlaceholderText("City or IATA code…"), {
      target: { value: "Bogota" },
    });
    const option = await screen.findByText(/El Dorado Intl/);
    fireEvent.mouseDown(option);
    expect(ref.current.getValue()).toBe("BOG");
    await new Promise((r) => setTimeout(r, 0));
    expect(stopEditing).toHaveBeenCalled();
  });

  it("uppercases a manually typed code so an unknown airport is still usable", () => {
    const ref = createRef<any>();
    render(<AirportCellEditor {...baseProps()} ref={ref} />);
    fireEvent.change(screen.getByPlaceholderText("City or IATA code…"), {
      target: { value: "xyz" },
    });
    expect(ref.current.getValue()).toBe("XYZ");
  });
});
