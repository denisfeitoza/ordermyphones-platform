"""Sync jobs for supplier-source-2 (US + DXB consolidated)."""

from __future__ import annotations

import time

import structlog

from .adapter import SupplierSource2
from .config import settings
from .supabase_writer import insert_inventory_snapshots, upsert_catalog

log = structlog.get_logger("supplier-source-2")


def run_catalog(feed: str = "all", dry_run: bool = False, loop: bool = False) -> None:
    adapter = SupplierSource2()
    cfg = settings()
    while True:
        try:
            rows = list(adapter.iter_catalog(feed=feed))
            seen = len(rows)
            upserted = 0 if dry_run else upsert_catalog(rows)
            log.info("catalog_sync_done", feed=feed, seen=seen, upserted=upserted, dry_run=dry_run)
        except Exception as exc:  # noqa: BLE001
            log.error("catalog_sync_failed", feed=feed, error=str(exc))
        if not loop:
            return
        interval = cfg.sync_cat_us_s if feed == "us" else cfg.sync_cat_dxb_s
        time.sleep(interval)


def run_inventory(feed: str = "all", dry_run: bool = False, loop: bool = False) -> None:
    adapter = SupplierSource2()
    cfg = settings()
    while True:
        try:
            rows = list(adapter.iter_inventory(feed=feed))
            seen = len(rows)
            upserted = 0 if dry_run else insert_inventory_snapshots(rows)
            log.info("inventory_sync_done", feed=feed, seen=seen, upserted=upserted, dry_run=dry_run)
        except Exception as exc:  # noqa: BLE001
            log.error("inventory_sync_failed", feed=feed, error=str(exc))
        if not loop:
            return
        interval = cfg.sync_inv_us_s if feed == "us" else cfg.sync_inv_dxb_s
        time.sleep(interval)


def run_dispatch(order_item_id: str) -> None:
    log.info("dispatch_requested", order_item_id=order_item_id)
    raise NotImplementedError(
        "Dispatch is wired in Phase 2 once routing.RoutingDecision and the order schema land."
    )
