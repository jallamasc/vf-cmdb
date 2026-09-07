// Phase 5 Task 34 (Req 28.2/28.3) — CredentialField: masked default admin
// credential with reveal/regenerate actions.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CredentialField from "./CredentialField";
import { api } from "../api";

vi.mock("../api", async (orig) => {
  const actual = await orig<typeof import("../api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      revealCredential: vi.fn(),
      regenerateCredential: vi.fn(),
    },
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("CredentialField", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a not-provisioned message when there's no bw_secret_id yet", () => {
    wrap(
      <CredentialField
        resource="generic-entities"
        row={{ id: 1, admin_username: null, bw_secret_id: null }}
      />
    );
    expect(screen.getByText(/No credential provisioned yet/)).toBeTruthy();
  });

  it("shows the username and a masked password before reveal", () => {
    wrap(
      <CredentialField
        resource="generic-entities"
        row={{ id: 1, admin_username: "admin", bw_secret_id: "secret-1" }}
      />
    );
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.getByText("••••••••••••")).toBeTruthy();
  });

  it("reveals the real password via api.revealCredential", async () => {
    (api.revealCredential as any).mockResolvedValue({
      username: "admin",
      password: "s3cr3t-pw",
    });
    wrap(
      <CredentialField
        resource="generic-entities"
        row={{ id: 7, admin_username: "admin", bw_secret_id: "secret-7" }}
      />
    );
    fireEvent.click(screen.getByText("Reveal"));
    await waitFor(() => expect(api.revealCredential).toHaveBeenCalledWith("generic-entities", 7));
    await waitFor(() => expect(screen.getByText("s3cr3t-pw")).toBeTruthy());
    expect(screen.queryByText("••••••••••••")).toBeNull();
  });

  it("regenerates the password via api.regenerateCredential and shows the new value", async () => {
    (api.regenerateCredential as any).mockResolvedValue({
      username: "admin",
      password: "new-pw-2",
    });
    wrap(
      <CredentialField
        resource="generic-entities"
        row={{ id: 7, admin_username: "admin", bw_secret_id: "secret-7" }}
      />
    );
    fireEvent.click(screen.getByText("Regenerate"));
    await waitFor(() =>
      expect(api.regenerateCredential).toHaveBeenCalledWith("generic-entities", 7)
    );
    await waitFor(() => expect(screen.getByText("new-pw-2")).toBeTruthy());
    expect(screen.getByText("Regenerated")).toBeTruthy();
  });

  it("shows an error message when reveal fails", async () => {
    (api.revealCredential as any).mockRejectedValue(new Error("Bitwarden is not configured."));
    wrap(
      <CredentialField
        resource="generic-entities"
        row={{ id: 7, admin_username: "admin", bw_secret_id: "secret-7" }}
      />
    );
    fireEvent.click(screen.getByText("Reveal"));
    await waitFor(() => expect(screen.getByText("Bitwarden is not configured.")).toBeTruthy());
  });
});
