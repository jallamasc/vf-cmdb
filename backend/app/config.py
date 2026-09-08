"""Application configuration loaded from environment variables."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    postgres_user: str = "vfcmdb"
    postgres_password: str = "vfcmdb"
    postgres_db: str = "vfcmdb"
    postgres_host: str = "db"
    postgres_port: int = 5432

    # App
    app_name: str = "Virtualfactor IT CMDB"
    api_prefix: str = "/api/v1"
    cors_origins: str = "*"

    # Bitwarden Secrets Manager (Phase 5 Task 33, Req 27.1) — an
    # administrator's existing Organization/Project + a machine account
    # Access Token. Empty by default: vf-cmdb runs fine without Bitwarden
    # configured, credential features simply aren't available until set.
    bw_organization_id: str = ""
    bw_access_token: str = ""
    bw_project_id: str = ""
    bw_api_url: str = "https://api.bitwarden.com"
    bw_identity_url: str = "https://identity.bitwarden.com"

    # Ansible Semaphore (Phase 5 Task 37, Req 29.2) — the Automation_Client's
    # own URL + API token. Empty by default: automation features simply
    # aren't available until configured.
    semaphore_url: str = ""
    semaphore_api_token: str = ""
    # Phase 5 Task 38 (Req 30.1) — the single Semaphore Project every
    # ansible_managed Generic_Entity's inventory is upserted into. Semaphore
    # has no vf-cmdb-wide "default project" concept of its own, so this
    # mirrors Bitwarden's BW_PROJECT_ID: one fixed target the administrator
    # configures once. 0 (falsy) means "not configured yet".
    semaphore_project_id: int = 0

    # Icecat Open Catalog (Phase 6 Task 34, Req 13.3) — an administrator's
    # Open Icecat account, used by the Hardware_Spec_Lookup's brand+model
    # lookup. Empty by default: the lookup endpoint falls straight through
    # to Brave Search when unset, exactly like Bitwarden/Semaphore degrade
    # gracefully above.
    icecat_username: str = ""
    icecat_password: str = ""
    icecat_base_url: str = "https://data.icecat.biz/xml_s3/xml_server3.cgi"

    # Brave Search (Phase 6 Task 35, Req 13.3) — the fallback source when
    # Icecat has no or incomplete data for a brand+model. Empty by default.
    brave_search_api_key: str = ""
    brave_search_base_url: str = "https://api.search.brave.com/res/v1/web/search"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def sync_database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
