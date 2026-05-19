"""Normalized data shapes shared between REST client and Scrapling fallback."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, NonNegativeInt, PositiveInt

Condition = Literal["new", "cpo", "refurbished", "used_a", "used_b", "used_c"]


class CatalogVariant(BaseModel):
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
    supplier_sku: str = Field(min_length=1)
    available_qty: NonNegativeInt
    unit_cost_cents: NonNegativeInt
    currency: Literal["USD"] = "USD"
    as_of: datetime
    raw: dict = Field(default_factory=dict)


class DispatchRequest(BaseModel):
    order_id: str
    items: list[dict]
    shipping_address: dict
    customer_email_hash: str   # never plaintext email — see redaction policy


class DispatchResponse(BaseModel):
    supplier_order_ref: str
    carrier: str | None = None
    tracking_number: str | None = None
    estimated_ship_date: datetime | None = None
