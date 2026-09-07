"""Phase 5 Task 33 — Bitwarden Secrets Manager client wrapper.

Wraps the official `bitwarden-sdk` package so vf-cmdb-managed credentials
never live as plaintext in this app's own database (Requirement 27).
Authenticates against the administrator's existing Bitwarden Organization
using an Organization ID, a Project ID, and a machine account Access Token,
all supplied via configuration — `BW_ORGANIZATION_ID` / `BW_ACCESS_TOKEN` /
`BW_PROJECT_ID` (Req 27.1).

Supports creating, retrieving, and regenerating a secret only. There is
deliberately NO delete method here (Req 27.2: a secret must never be
deleted as a side effect of an unrelated operation) — nothing in this app
needs to delete a Bitwarden secret, so the capability simply isn't exposed
at all, rather than being exposed-but-unused-by-convention.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from app.config import settings


class BitwardenNotConfigured(RuntimeError):
    """Raised when BW_ORGANIZATION_ID/BW_ACCESS_TOKEN/BW_PROJECT_ID aren't
    all set. vf-cmdb runs fine without Bitwarden configured — credential
    features (Task 34+) just aren't available until this is resolved."""


def _secret_dict(secret) -> dict:
    """Normalize a `bitwarden_sdk` `SecretResponse` object into a plain
    dict, so callers (and tests) don't depend on the SDK's dataclass shape
    directly."""
    return {
        "id": str(secret.id),
        "key": secret.key,
        "value": secret.value,
        "note": secret.note,
    }


class SecretsClient:
    """Thin wrapper around `bitwarden_sdk.BitwardenClient`'s Secrets API.

    A pre-built SDK client can be injected via `sdk_client=` (bypassing the
    real `bitwarden_sdk` import/auth entirely) — this is how tests exercise
    this wrapper against a mock instead of the real Bitwarden API
    (Req 33.2's "pytest against a mocked SDK client").
    """

    def __init__(
        self,
        organization_id: Optional[str] = None,
        access_token: Optional[str] = None,
        project_id: Optional[str] = None,
        sdk_client=None,
    ):
        self.organization_id = organization_id or settings.bw_organization_id
        self.access_token = access_token or settings.bw_access_token
        self.project_id = project_id or settings.bw_project_id
        if not (self.organization_id and self.access_token and self.project_id):
            raise BitwardenNotConfigured(
                "BW_ORGANIZATION_ID, BW_ACCESS_TOKEN and BW_PROJECT_ID must all be set."
            )
        self._sdk_client = sdk_client if sdk_client is not None else self._build_sdk_client()

    def _build_sdk_client(self):
        # Imported lazily so importing this module never fails in an
        # environment that hasn't installed `bitwarden-sdk`'s native
        # extension for some reason — only actually constructing a client
        # (real usage) requires it.
        from bitwarden_sdk import BitwardenClient, DeviceType, client_settings_from_dict

        client = BitwardenClient(
            client_settings_from_dict(
                {
                    "apiUrl": settings.bw_api_url,
                    "deviceType": DeviceType.SDK,
                    "identityUrl": settings.bw_identity_url,
                    "userAgent": "vf-cmdb",
                }
            )
        )
        client.auth().login_access_token(self.access_token)
        return client

    def create_secret(self, key: str, value: str, note: str = "") -> dict:
        """Create a secret in the configured Project.

        Returns ``{"id", "key", "value", "note"}``.
        """
        result = self._sdk_client.secrets().create(
            self.organization_id, key, value, note, [self.project_id]
        )
        return _secret_dict(result.data)

    def get_secret(self, secret_id: str) -> dict:
        """Retrieve a secret's key/value/note by id."""
        result = self._sdk_client.secrets().get(secret_id)
        return _secret_dict(result.data)

    def regenerate_secret(self, secret_id: str, new_value: str) -> dict:
        """Rotate a secret's value IN PLACE (same id) — never deletes it
        (Req 27.2). The secret's key/note are preserved as-is; only the
        value changes."""
        current = self.get_secret(secret_id)
        result = self._sdk_client.secrets().update(
            self.organization_id,
            secret_id,
            current["key"],
            new_value,
            current["note"],
            [self.project_id],
        )
        return _secret_dict(result.data)


def generate_password(length: int = 24) -> str:
    """A strong random password, via the SDK's generator (Phase 5 Task 34).

    Bitwarden's generator needs no authentication (it's pure local
    generation, not a Secrets Manager API call), so this works even before
    `BW_ORGANIZATION_ID`/`BW_ACCESS_TOKEN`/`BW_PROJECT_ID` are configured —
    unlike everything else in this module, it doesn't raise
    `BitwardenNotConfigured`.
    """
    from bitwarden_sdk import BitwardenClient, DeviceType, client_settings_from_dict

    client = BitwardenClient(
        client_settings_from_dict(
            {
                "apiUrl": settings.bw_api_url,
                "deviceType": DeviceType.SDK,
                "identityUrl": settings.bw_identity_url,
                "userAgent": "vf-cmdb",
            }
        )
    )
    return client.generators().generate(length=length)


@lru_cache
def get_secrets_client() -> SecretsClient:
    """Shared `SecretsClient`, built once per process from `settings` —
    the actual authenticated SDK client is expensive-ish to construct
    (an FFI handshake), so callers should use this instead of
    `SecretsClient()` directly unless they need to inject a mock.

    Raises `BitwardenNotConfigured` (not cached, since `lru_cache` never
    caches an exception — the next call retries construction) if Bitwarden
    isn't configured yet.
    """
    return SecretsClient()
