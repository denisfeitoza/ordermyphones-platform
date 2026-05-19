"""Dubai wholesale feed (`source-2-dxb`).

Supports three operating modes:

- ``rest``   — authenticated REST endpoints (preferred).
- ``csv``    — CSV pull from the supplier portal (via Scrapling).
- ``manual`` — operator-uploaded CSV into ``SUPPLIER_DUBAI_MANUAL_DROPBOX``.

All three normalize AED → USD using a configured FX snapshot before yielding
:class:`InventoryRow` and :class:`CatalogVariant`. The contract restricts
launch to USD (Schedule A.3) so DXB costs must be normalized before they
ever reach the pricing engine.
"""

from __future__ import annotations

import csv
import math
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path

from ..config import settings
from ..models import CatalogVariant, DispatchRequest, DispatchResponse, InventoryRow


class DubaiWholesaleFeed:
    feed_code = "source-2-dxb"

    def iter_catalog(self) -> Iterable[CatalogVariant]:
        mode = settings().dxb_mode
        if mode == "rest":
            yield from self._iter_catalog_rest()
        elif mode == "csv":
            yield from self._iter_catalog_csv()
        else:
            # manual mode pushes via dropbox; nothing to pull
            return

    def iter_inventory(self) -> Iterable[InventoryRow]:
        mode = settings().dxb_mode
        if mode == "rest":
            yield from self._iter_inventory_rest()
        elif mode == "csv":
            yield from self._iter_inventory_csv()
        else:
            yield from self._iter_inventory_manual()

    def dispatch(self, _req: DispatchRequest) -> DispatchResponse:
        # Wholesale dispatch frequently includes a manual confirmation gate
        # in the early phase. Implemented in Phase 2 once the partner
        # protocol is signed off.
        raise NotImplementedError(
            "Dubai wholesale dispatch is implemented in Phase 2 (manual or REST per partner)."
        )

    # ---------- REST mode ----------

    def _iter_catalog_rest(self) -> Iterable[CatalogVariant]:  # pragma: no cover
        raise NotImplementedError("REST mode wired in Phase 2 once the partner endpoint is confirmed.")

    def _iter_inventory_rest(self) -> Iterable[InventoryRow]:  # pragma: no cover
        raise NotImplementedError("REST mode wired in Phase 2 once the partner endpoint is confirmed.")

    # ---------- CSV mode (portal scrape) ----------

    def _iter_catalog_csv(self) -> Iterable[CatalogVariant]:  # pragma: no cover
        raise NotImplementedError(
            "CSV-via-Scrapling mode lands in Phase 2 once the portal URL is captured in the audit."
        )

    def _iter_inventory_csv(self) -> Iterable[InventoryRow]:  # pragma: no cover
        raise NotImplementedError(
            "CSV-via-Scrapling mode lands in Phase 2 once the portal URL is captured in the audit."
        )

    # ---------- Manual mode (admin drops files) ----------

    def _iter_inventory_manual(self) -> Iterable[InventoryRow]:
        cfg = settings()
        inbox = Path(cfg.dxb_manual_dropbox)
        if not inbox.exists():
            return
        now = datetime.now(timezone.utc)
        for path in sorted(inbox.glob("*.csv")):
            with path.open() as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    qty_raw = row.get("available_qty") or row.get("qty") or "0"
                    cost_aed = float(row.get("unit_cost_aed") or 0)
                    cost_usd_cents = max(0, math.floor(cost_aed * cfg.dxb_fx_usd_per_aed * 100))
                    yield InventoryRow(
                        feed=self.feed_code,
                        supplier_sku=row["sku"],
                        available_qty=max(0, int(qty_raw)),
                        unit_cost_cents=cost_usd_cents,
                        currency="USD",
                        as_of=now,
                        raw={**row, "_fx_usd_per_aed": cfg.dxb_fx_usd_per_aed},
                    )
