"""US dropship feed (`source-2-us`).

Same shape as supplier-source-1: REST first, Scrapling fallback.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from ..config import settings
from ..models import CatalogVariant, DispatchRequest, DispatchResponse, InventoryRow


class UsRestError(Exception):
    """Raised when the US REST endpoint fails non-recoverably."""


_TRANSIENT = (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError)


class UsDropshipFeed:
    """REST + Scrapling fallback for the second US dropship provider."""

    feed_code = "source-2-us"

    def __init__(self) -> None:
        cfg = settings()
        self._http = httpx.Client(
            base_url=cfg.us_api_base,
            timeout=httpx.Timeout(15.0, connect=5.0),
            headers={
                "Authorization": f"Bearer {cfg.us_api_key}",
                "Accept": "application/json",
                "User-Agent": "ordermyphones-supplier-source-2-us/0.1",
            },
        )

    @retry(
        retry=retry_if_exception_type(_TRANSIENT),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def _get(self, path: str, **params: object) -> dict:
        resp = self._http.get(path, params=params)
        if resp.status_code >= 500:
            raise UsRestError(f"5xx: {resp.status_code}")
        if resp.status_code == 429:
            raise UsRestError("rate_limited")
        if resp.status_code >= 400:
            raise UsRestError(f"{resp.status_code}: {resp.text[:200]}")
        return resp.json()

    def iter_catalog(self) -> Iterable[CatalogVariant]:
        cursor: str | None = None
        while True:
            payload = self._get("/v1/catalog", cursor=cursor, limit=200)
            for row in payload.get("items", []):
                yield CatalogVariant(
                    feed=self.feed_code,
                    supplier_sku=row["sku"],
                    brand=row.get("brand", "Unknown"),
                    model=row["model"],
                    color=row.get("color", ""),
                    storage_gb=row.get("storage_gb"),
                    condition=row.get("condition", "new"),
                    description=row.get("description"),
                    image_url=row.get("image_url"),
                    raw=row,
                )
            cursor = payload.get("next_cursor")
            if not cursor:
                return

    def iter_inventory(self) -> Iterable[InventoryRow]:
        cursor: str | None = None
        while True:
            payload = self._get("/v1/inventory", cursor=cursor, limit=500)
            now = datetime.now(timezone.utc)
            for row in payload.get("items", []):
                yield InventoryRow(
                    feed=self.feed_code,
                    supplier_sku=row["sku"],
                    available_qty=max(0, int(row.get("available_qty", 0))),
                    unit_cost_cents=max(0, int(row.get("unit_cost_cents", 0))),
                    currency=row.get("currency", "USD"),
                    as_of=now,
                    raw=row,
                )
            cursor = payload.get("next_cursor")
            if not cursor:
                return

    def dispatch(self, req: DispatchRequest) -> DispatchResponse:
        resp = self._http.post(
            "/v1/orders",
            json=req.model_dump(),
            headers={"Idempotency-Key": req.order_item_id},
        )
        if resp.status_code >= 400:
            raise UsRestError(f"dispatch {resp.status_code}: {resp.text[:200]}")
        return DispatchResponse(**resp.json())
