"""Idempotent writes from the adapter into Supabase."""

from __future__ import annotations

from collections.abc import Iterable

from supabase import Client, create_client

from .config import settings
from .models import CatalogVariant, InventoryRow

SUPPLIER_CODE = "source-1"


def _client() -> Client:
    cfg = settings()
    return create_client(cfg.supabase_url, cfg.supabase_service_role_key)


def upsert_catalog(rows: Iterable[CatalogVariant]) -> int:
    """Upsert into `products` and `product_variants`. Returns count seen."""
    sb = _client()
    count = 0
    for v in rows:
        slug = _slug_from_variant(v)
        product_resp = sb.table("products").upsert(
            {
                "slug": slug,
                "brand": v.brand,
                "model": v.model,
                "summary": v.description or v.model,
                "description": v.description or "",
                "hero_image_path": v.image_url or "",
                "viewer_3d_path": None,
                "status": "draft",
            },
            on_conflict="slug",
        ).execute()
        product_id = product_resp.data[0]["id"]

        sb.table("product_variants").upsert(
            {
                "product_id": product_id,
                "sku": v.supplier_sku,
                "color": v.color,
                "storage_gb": v.storage_gb,
                "condition": v.condition,
                "attributes": v.raw,
            },
            on_conflict="sku",
        ).execute()

        count += 1
    return count


def insert_inventory_snapshots(rows: Iterable[InventoryRow]) -> int:
    """Append `inventory_snapshots` rows. The latest snapshot per (variant, supplier) is the truth."""
    sb = _client()
    count = 0
    payload: list[dict] = []
    for row in rows:
        variant = (
            sb.table("product_variants")
            .select("id")
            .eq("sku", row.supplier_sku)
            .single()
            .execute()
        )
        if not variant.data:
            continue
        payload.append(
            {
                "variant_id": variant.data["id"],
                "supplier_id": _supplier_id(sb),
                "available_qty": row.available_qty,
                "unit_cost_cents": row.unit_cost_cents,
                "currency": row.currency,
                "as_of": row.as_of.isoformat(),
                "raw": row.raw,
            }
        )
        count += 1
        if len(payload) >= 200:
            sb.table("inventory_snapshots").insert(payload).execute()
            payload = []
    if payload:
        sb.table("inventory_snapshots").insert(payload).execute()
    return count


def record_sync_run(kind: str, status: str, rows_seen: int, rows_upserted: int, error: str | None) -> None:
    sb = _client()
    sb.table("supplier_sync_runs").insert(
        {
            "supplier_id": _supplier_id(sb),
            "kind": kind,
            "started_at": None,  # populated by the caller in a future revision
            "ended_at": None,
            "rows_seen": rows_seen,
            "rows_upserted": rows_upserted,
            "rows_failed": rows_seen - rows_upserted,
            "status": status,
            "error_summary": error,
        }
    ).execute()


def _supplier_id(sb: Client) -> str:
    resp = sb.table("suppliers").select("id").eq("code", SUPPLIER_CODE).single().execute()
    if not resp.data:
        raise RuntimeError(f"supplier '{SUPPLIER_CODE}' not seeded in `suppliers` table")
    return resp.data["id"]


def _slug_from_variant(v: CatalogVariant) -> str:
    raw = f"{v.brand}-{v.model}".lower().strip()
    return "-".join(filter(None, raw.replace("/", "-").split()))
