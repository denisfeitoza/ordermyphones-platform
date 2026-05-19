"""Scrapling-based fallback for Supplier API #1.

Used only when:
- a field the contract needs is missing from the REST response, or
- the REST endpoint is unavailable for a critical SKU.

Why Scrapling: adaptive selectors auto-relocate elements when the supplier
changes their HTML; stealth fetchers (`StealthyFetcher`/camoufox) handle
bot-protected pages without bespoke maintenance.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone

from .config import settings
from .models import CatalogVariant, InventoryRow


class SupplierScraper:
    """Thin façade around Scrapling fetchers.

    The scaffold imports Scrapling lazily so the package is optional at runtime
    (developers can install with `pip install -e ".[fetchers]"` to enable).
    """

    def __init__(self) -> None:
        self._cfg = settings()
        try:
            # Lazy import: Scrapling pulls in camoufox/playwright on install.
            from scrapling.fetchers import Fetcher, StealthyFetcher  # type: ignore
            self._fetcher = StealthyFetcher if self._cfg.use_stealth else Fetcher
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "Scrapling not installed. Run: pip install -e '.[fetchers]' && scrapling install"
            ) from exc

    # ---------- Catalog ----------

    def iter_catalog(self) -> Iterable[CatalogVariant]:
        """Walk the supplier's catalog pages via adaptive selectors.

        Implementation lands in Phase 2 with the real supplier URL set.
        Selectors use Scrapling's auto-relocation so they survive layout
        drift (e.g. supplier replaces `.sku-card` with `.product-tile`).
        """
        raise NotImplementedError("Scrapling catalog fallback wired in Phase 2.")

    # ---------- Inventory ----------

    def iter_inventory(self) -> Iterable[InventoryRow]:
        """Pull per-SKU stock from the supplier's web UI when REST omits it."""
        # Example shape (kept commented to avoid running against an unknown URL):
        #
        #   page = self._fetcher.get(f"{self._cfg.supplier_api_base}/_/stock", network_idle=True)
        #   for card in page.css(".stock-row", auto_save=True):
        #       yield InventoryRow(
        #           supplier_sku=card.css_first(".sku::text").clean(),
        #           available_qty=int(card.css_first(".qty::text").clean() or 0),
        #           unit_cost_cents=int(float(card.css_first(".cost::text").clean()) * 100),
        #           as_of=datetime.now(timezone.utc),
        #           raw={},
        #       )
        _ = datetime.now(timezone.utc)
        raise NotImplementedError("Scrapling inventory fallback wired in Phase 2.")
