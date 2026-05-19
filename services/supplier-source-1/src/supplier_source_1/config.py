"""Environment-bound configuration for the supplier-source-1 adapter."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv(override=False)


@dataclass(frozen=True)
class Settings:
    supplier_api_base: str
    supplier_api_key: str
    supplier_shared_secret: str | None
    supplier_sandbox: bool

    supabase_url: str
    supabase_service_role_key: str

    use_stealth: bool

    sentry_dsn: str | None
    log_level: str

    sync_inventory_interval_s: int
    sync_catalog_interval_s: int


def _env(name: str, default: str | None = None, required: bool = False) -> str:
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"missing env var: {name}")
    return val or ""


@lru_cache
def settings() -> Settings:
    return Settings(
        supplier_api_base=_env("SUPPLIER_1_API_BASE", required=True),
        supplier_api_key=_env("SUPPLIER_1_API_KEY", required=True),
        supplier_shared_secret=_env("SUPPLIER_1_SHARED_SECRET", default=None) or None,
        supplier_sandbox=_env("SUPPLIER_1_SANDBOX", "true").lower() in {"1", "true", "yes"},
        supabase_url=_env("SUPABASE_URL", required=True),
        supabase_service_role_key=_env("SUPABASE_SERVICE_ROLE_KEY", required=True),
        use_stealth=_env("SCRAPLING_USE_STEALTH", "true").lower() in {"1", "true", "yes"},
        sentry_dsn=_env("SENTRY_DSN") or None,
        log_level=_env("LOG_LEVEL", "info"),
        sync_inventory_interval_s=int(_env("SYNC_INVENTORY_INTERVAL_SECONDS", "600")),
        sync_catalog_interval_s=int(_env("SYNC_CATALOG_INTERVAL_SECONDS", "21600")),
    )
