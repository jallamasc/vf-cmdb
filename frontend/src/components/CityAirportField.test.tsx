// Phase 5 Task 30 (Req 25.1/25.2/25.3) — CityAirportField: Country-gated,
// catalogue-validated city entry with an explicit "not listed" override.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import CityAirportField from "./CityAirportField";
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

function renderField(props: Partial<Parameters<typeof CityAirportField>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <CityAirportField city="" iataCode="" onChange={onChange} {...props} />,
  );
  return { onChange, ...utils };
}

async function selectCountry(name: string) {
  const select = await screen.findByLabelText("Country");
  // The <option> list loads asynchronously via api.airportCountries() —
  // wait for it before setting a value, or the select silently ignores it.
  await waitFor(() => expect(within(select).getByText(name)).toBeTruthy());
  fireEvent.change(select, { target: { value: name } });
}

describe("CityAirportField — Country gating (Req 25.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.airportCode as any).mockResolvedValue({ matches: [] });
  });

  it("disables the City input until a Country is selected", async () => {
    renderField();
    const cityInput = await screen.findByPlaceholderText("Select a country first");
    expect(cityInput).toBeDisabled();
  });

  it("enables the City input once a Country is selected", async () => {
    renderField();
    await screen.findByLabelText("Country");
    await selectCountry("Colombia");
    const cityInput = await screen.findByPlaceholderText("Start typing, e.g. Bogota");
    expect(cityInput).not.toBeDisabled();
  });
});

describe("CityAirportField — catalogue matching (Req 25.2/25.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes suggestion queries to the selected Country", async () => {
    (api.airportCode as any).mockResolvedValue({
      matches: [{ iata: "BOG", city: "Bogota", country: "Colombia", name: "El Dorado Intl" }],
    });
    renderField();
    await selectCountry("Colombia");
    const cityInput = await screen.findByPlaceholderText("Start typing, e.g. Bogota");
    fireEvent.change(cityInput, { target: { value: "Bogota" } });
    await waitFor(() =>
      expect(api.airportCode).toHaveBeenCalledWith("Bogota", 25, "Colombia"),
    );
  });

  it("accepts a city that matches the country-filtered catalogue on blur", async () => {
    (api.airportCode as any).mockResolvedValue({
      matches: [{ iata: "BOG", city: "Bogota", country: "Colombia", name: "El Dorado Intl" }],
    });
    const { onChange } = renderField();
    await selectCountry("Colombia");
    const cityInput = await screen.findByPlaceholderText("Start typing, e.g. Bogota");
    fireEvent.change(cityInput, { target: { value: "Bogota" } });
    await waitFor(() => expect(api.airportCode).toHaveBeenCalled());
    fireEvent.blur(cityInput);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Bogota", "BOG"));
  });

  it("rejects a city not in the country-filtered catalogue and reverts the value", async () => {
    (api.airportCode as any).mockResolvedValue({ matches: [] });
    const { onChange } = renderField();
    await selectCountry("Colombia");
    const cityInput = await screen.findByPlaceholderText("Start typing, e.g. Bogota");
    fireEvent.change(cityInput, { target: { value: "Nowhereville" } });
    await waitFor(() => expect(api.airportCode).toHaveBeenCalled());
    fireEvent.blur(cityInput);
    await waitFor(() =>
      expect(screen.getByText(/isn't in Colombia's catalogue/)).toBeTruthy(),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect((cityInput as HTMLInputElement).value).toBe("");
  });

  it("accepts a freely typed city once 'not listed' is checked", async () => {
    (api.airportCode as any).mockResolvedValue({ matches: [] });
    const { onChange } = renderField();
    fireEvent.click(
      screen.getByLabelText("City not listed in the catalogue (enter it manually)"),
    );
    const cityInput = await screen.findByPlaceholderText("Start typing, e.g. Bogota");
    expect(cityInput).not.toBeDisabled();
    fireEvent.change(cityInput, { target: { value: "Nowhereville" } });
    fireEvent.blur(cityInput);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Nowhereville", ""));
  });

  it("picking a suggestion commits both city and IATA code immediately", async () => {
    (api.airportCode as any).mockResolvedValue({
      matches: [{ iata: "MDE", city: "Medellin", country: "Colombia", name: "Jose Maria Cordova" }],
    });
    const { onChange } = renderField();
    await selectCountry("Colombia");
    const cityInput = await screen.findByPlaceholderText("Start typing, e.g. Bogota");
    fireEvent.focus(cityInput);
    fireEvent.change(cityInput, { target: { value: "Medellin" } });
    const option = await screen.findByText(/Jose Maria Cordova/);
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith("Medellin", "MDE");
  });
});

describe("CityAirportField — resolving Country for a pre-existing value (Req 25.1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("auto-selects the Country when the existing city/code resolves in the catalogue", async () => {
    (api.airportCode as any).mockResolvedValue({
      country: "Colombia",
      matches: [],
    });
    renderField({ city: "Bogota", iataCode: "BOG" });
    await waitFor(() =>
      expect((screen.getByLabelText("Country") as HTMLSelectElement).value).toBe("Colombia"),
    );
  });

  it("falls back to 'not listed' when the existing value has no catalogue match", async () => {
    (api.airportCode as any).mockResolvedValue({ country: null, matches: [] });
    renderField({ city: "Somewhere Unlisted", iataCode: "XYZ" });
    await waitFor(() =>
      expect(
        screen.getByLabelText("City not listed in the catalogue (enter it manually)"),
      ).toBeChecked(),
    );
    // Not locked out despite no Country being selected.
    const cityInput = await screen.findByPlaceholderText("Start typing, e.g. Bogota");
    expect(cityInput).not.toBeDisabled();
  });
});
