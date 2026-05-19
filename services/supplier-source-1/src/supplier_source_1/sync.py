"""Sync jobs for supplier-source-1.

Production scheduling is owned by `pg_cron`. The `--loop` flag is for local
development only — it does not replace the cron schedule and does not acquire
an advisory lock.
"""

from __future__ import annotations

import time

import structlog

from .adapter import SupplierSource1
from .config import settings
from .supabase_writer import (
    insert_inventory_snapshots,
    record_sync_run,
    upsert_catalog,
)

log = structlog.get_logger("supplier-source-1")


def run_catalog(dry_run: bool = False, loop: bool = False) -> None:
    adapter = SupplierSource1()
    cfg = settings()
    while True:
        seen = 0
        upserted = 0
        try:
            rows = list(adapter.iter_catalog())
            seen = len(rows)
            if not dry_run:
                upserted = upsert_catalog(rows)
            log.info("catalog_sync_done", seen=seen, upserted=upserted, dry_run=dry_run)
            record_sync_run("catalog", "success", seen, upserted, error=None)
        except Exception as exc:  # noqa: BLE001
            log.error("catalog_sync_failed", error=str(exc))
            record_sync_run("catalog", "failed", seen, upserted, error=str(exc))
        if not loop:
            return
        time.sleep(cfg.sync_catalog_interval_s)


def run_inventory(dry_run: bool = False, loop: bool = False) -> None:
    adapter = SupplierSource1()
    cfg = settings()
    while True:
        seen = 0
        upserted = 0
        try:
            rows = list(adapter.iter_inventory())
            seen = len(rows)
            if not dry_run:
                upserted = insert_inventory_snapshots(rows)
            log.info("inventory_sync_done", seen=seen, upserted=upserted, dry_run=dry_run)
            record_sync_run("inventory", "success", seen, upserted, error=None)
        except Exception as exc:  # noqa: BLE001
            log.error("inventory_sync_failed", error=str(exc))
            record_sync_run("inventory", "failed", seen, upserted, error=str(exc))
        if not loop:
            return
        time.sleep(cfg.sync_inventory_interval_s)


def run_dispatch(order_id: str) -> None:
    log.info("dispatch_requested", order_id=order_id)
    raise NotImplementedError(
        "Dispatch is wired in Phase 2 once the order schema and Stripe webhook are live."
    )


def run_tracking(shipment_id: str) -> None:
    log.info("tracking_requested", shipment_id=shipment_id)
    raise NotImplementedError("Tracking poller lands with the shipments table in Phase 2.")
