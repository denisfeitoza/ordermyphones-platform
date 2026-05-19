"""Environment-bound configuration for supplier-source-2."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from dotenv import load_dotenv

load_dotenv(override=False)

DubaiMode = Literal["rest", "csv", "manual"]


@dataclass(frozen=True)
class Settings:
    us_api_base: str
    us_api_key: str
    us_sandbox: bool

    dxb_mode: DubaiMode
    dxb_api_base: str
    dxb_api_key: str
    dxb_manual_dropbox: str
    dxb_fx_usd_per_aed: float

    routing_wholesale_qty_threshold: int
    routing_expedited_disable_dxb: bool

    use_stealth: bool

    supabase_url: str
    supabase_service_role_key: str

    sentry_dsn: str | None
    log_level: str

    sync_inv_us_s: int
    sync_inv_dxb_s: int
    sync_cat_us_s: int
    sync_cat_dxb_s: int


def _env(name: str, default: str | None = None, required: bool = False) -> str:
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"missing env var: {name}")
    return val or ""


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "true" if default else "false")
    return raw.lower() in {"1", "true", "yes"}


@lru_cache
def settings() -> Settings:
    mode_raw = _env("SUPPLIER_DUBAI_MODE", "rest").lower()
    if mode_raw not in {"rest", "csv", "manual"}:
        raise RuntimeError(f"invalid SUPPLIER_DUBAI_MODE: {mode_raw}")
    return Settings(
        us_api_base=_env("SUPPLIER_2_API_BASE", required=True),
        us_api_key=_env("SUPPLIER_2_API_KEY", required=True),
        us_sandbox=_bool("SUPPLIER_2_SANDBOX", default=True),
        dxb_mode=mode_raw,  # type: ignore[arg-type]
        dxb_api_base=_env("SUPPLIER_DUBAI_API_BASE", default=""),
        dxb_api_key=_env("SUPPLIER_DUBAI_API_KEY", default=""),
        dxb_manual_dropbox=_env("SUPPLIER_DUBAI_MANUAL_DROPBOX", "/var/lib/source-2-dxb/inbox"),
        dxb_fx_usd_per_aed=float(_env("SUPPLIER_DUBAI_FX_USD_PER_AED", "0.272")),
        routing_wholesale_qty_threshold=int(_env("ROUTING_WHOLESALE_QTY_THRESHOLD", "100")),
        routing_expedited_disable_dxb=_bool("ROUTING_EXPEDITED_DISABLE_DXB", default=True),
        use_stealth=_bool("SCRAPLING_USE_STEALTH", default=True),
        supabase_url=_env("SUPABASE_URL", required=True),
        supabase_service_role_key=_env("SUPABASE_SERVICE_ROLE_KEY", required=True),
        sentry_dsn=_env("SENTRY_DSN") or None,
        log_level=_env("LOG_LEVEL", "info"),
        sync_inv_us_s=int(_env("SYNC_INVENTORY_US_INTERVAL_SECONDS", "600")),
        sync_inv_dxb_s=int(_env("SYNC_INVENTORY_DXB_INTERVAL_SECONDS", "3600")),
        sync_cat_us_s=int(_env("SYNC_CATALOG_US_INTERVAL_SECONDS", "21600")),
        sync_cat_dxb_s=int(_env("SYNC_CATALOG_DXB_INTERVAL_SECONDS", "43200")),
    )
