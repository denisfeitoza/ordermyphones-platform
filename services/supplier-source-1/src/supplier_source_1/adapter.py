"""Unified adapter — REST first, Scrapling fallback when needed."""

from __future__ import annotations

from collections.abc import Iterable

from .client import SupplierRestClient, SupplierRestError
from .models import CatalogVariant, DispatchRequest, DispatchResponse, InventoryRow
from .scraper import SupplierScraper


class SupplierSource1:
    """Single public surface used by the sync jobs and the AI service."""

    def __init__(self) -> None:
        self._rest = SupplierRestClient()
        self._scraper: SupplierScraper | None = None

    # ---------- Catalog ----------

    def iter_catalog(self) -> Iterable[CatalogVariant]:
        try:
            yield from self._rest.iter_catalog()
        except SupplierRestError:
            yield from self._scraper_lazy().iter_catalog()

    # ---------- Inventory ----------

    def iter_inventory(self) -> Iterable[InventoryRow]:
        try:
            yield from self._rest.iter_inventory()
        except SupplierRestError:
            yield from self._scraper_lazy().iter_inventory()

    # ---------- Dispatch ----------

    def dispatch(self, req: DispatchRequest) -> DispatchResponse:
        # Dispatch always goes through REST; there is no Scrapling fallback
        # for state-changing actions.
        return self._rest.dispatch(req)

    # ---------- Internals ----------

    def _scraper_lazy(self) -> SupplierScraper:
        if self._scraper is None:
            self._scraper = SupplierScraper()
        return self._scraper
