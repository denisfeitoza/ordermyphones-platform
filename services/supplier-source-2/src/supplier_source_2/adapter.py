"""Public surface for supplier-source-2: a single adapter exposing two feeds."""

from __future__ import annotations

from collections.abc import Iterable

from .feeds import DubaiWholesaleFeed, UsDropshipFeed
from .models import CatalogVariant, DispatchRequest, DispatchResponse, InventoryRow


class SupplierSource2:
    """Single public surface — sync jobs and the AI service use this."""

    def __init__(self) -> None:
        self.us = UsDropshipFeed()
        self.dxb = DubaiWholesaleFeed()

    def iter_catalog(self, *, feed: str = "all") -> Iterable[CatalogVariant]:
        if feed in ("all", "us"):
            yield from self.us.iter_catalog()
        if feed in ("all", "dxb"):
            yield from self.dxb.iter_catalog()

    def iter_inventory(self, *, feed: str = "all") -> Iterable[InventoryRow]:
        if feed in ("all", "us"):
            yield from self.us.iter_inventory()
        if feed in ("all", "dxb"):
            yield from self.dxb.iter_inventory()

    def dispatch(self, req: DispatchRequest) -> DispatchResponse:
        if req.feed == "source-2-us":
            return self.us.dispatch(req)
        return self.dxb.dispatch(req)
