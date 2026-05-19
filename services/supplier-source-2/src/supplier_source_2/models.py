"""Normalized data shapes (mirrors supplier-source-1)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, NonNegativeInt, PositiveInt

Condition = Literal["new", "cpo", "refurbished", "used_a", "used_b", "used_c"]
FeedCode = Literal["source-2-us", "source-2-dxb"]


class CatalogVariant(BaseModel):
    feed: FeedCode
    supplier_sku: str = Field(min_length=1)
    brand: str
    model: str
    color: str
    storage_gb: PositiveInt | None = None
    condition: Condition = "new"
    description: str | None = None
    image_url: str | None = None
    raw: dict = Field(default_factory=dict)


class InventoryRow(BaseModel):
    feed: FeedCode
    supplier_sku: str = Field(min_length=1)
    available_qty: NonNegativeInt
    unit_cost_cents: NonNegativeInt
    currency: Literal["USD"] = "USD"  # DXB feed normalizes to USD before this point
    as_of: datetime
    raw: dict = Field(default_factory=dict)


class DispatchRequest(BaseModel):
    feed: FeedCode
    order_item_id: str
    qty: PositiveInt
    shipping_address: dict
    customer_email_hash: str


class DispatchResponse(BaseModel):
    supplier_order_ref: str
    carrier: str | None = None
    tracking_number: str | None = None
    estimated_ship_date: datetime | None = None
