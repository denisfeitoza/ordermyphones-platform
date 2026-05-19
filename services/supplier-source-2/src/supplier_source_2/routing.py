"""Routing decision: which underlying feed fulfills a given order item.

See docs/ROUTING.md for the human-readable matrix.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from .config import settings

FeedCode = Literal["source-2-us", "source-2-dxb"]


@dataclass(frozen=True)
class RoutingInput:
    variant_id: str
    qty: int
    customer_account_id: str
    expedited: bool
    us_available_qty: int
    dxb_available_qty: int
    us_landed_cost_cents: int      # unit cost + freight + duty heuristic
    dxb_landed_cost_cents: int


@dataclass(frozen=True)
class RoutingDecision:
    feed: FeedCode
    rationale: str
    eligible_feeds: tuple[FeedCode, ...]
    chosen_at: datetime


def decide(inp: RoutingInput) -> RoutingDecision:
    cfg = settings()
    eligible: list[FeedCode] = []
    if inp.us_available_qty >= inp.qty:
        eligible.append("source-2-us")
    if inp.dxb_available_qty >= inp.qty and not (inp.expedited and cfg.routing_expedited_disable_dxb):
        eligible.append("source-2-dxb")

    if not eligible:
        raise ValueError("no_feed_has_stock_for_qty")

    if len(eligible) == 1:
        chosen = eligible[0]
        return _decision(chosen, f"only_eligible_feed:{chosen}", tuple(eligible))

    # Quantity preference toward wholesale.
    if inp.qty >= cfg.routing_wholesale_qty_threshold and "source-2-dxb" in eligible:
        return _decision(
            "source-2-dxb",
            f"qty>={cfg.routing_wholesale_qty_threshold}_prefers_wholesale",
            tuple(eligible),
        )

    # Landed-cost tie-break.
    if inp.dxb_landed_cost_cents < inp.us_landed_cost_cents and "source-2-dxb" in eligible:
        return _decision(
            "source-2-dxb",
            f"dxb_cheaper_by_{inp.us_landed_cost_cents - inp.dxb_landed_cost_cents}_cents",
            tuple(eligible),
        )

    return _decision("source-2-us", "us_default_or_cheaper", tuple(eligible))


def _decision(feed: FeedCode, rationale: str, eligible: tuple[FeedCode, ...]) -> RoutingDecision:
    return RoutingDecision(
        feed=feed,
        rationale=rationale,
        eligible_feeds=eligible,
        chosen_at=datetime.now(timezone.utc),
    )
