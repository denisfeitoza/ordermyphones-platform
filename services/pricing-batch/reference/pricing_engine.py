"""
OMP Pricing Engine v2 — Reference Implementation
=================================================
ordermyphones.com | May 2026

Four-tier pricing engine with competitive benchmarking, CTIA grade gating,
kitting cost model, profit floors, and per-tier flag logic.

Tiers:
    T1 Consumer     (1-9 units)     price = avg SRP benchmark (max profit to market)
    T2 Retailer     (10-49 units)   price = consumer - $20 (retailer min margin)
    T3 Wholesale    (50-399 units)  cost-plus band $7-15
    T4 Distributor  (400+ units)    cost-plus band $3-6

This module is dependency-free (stdlib only) and stack-agnostic.
Wire it to your ingestion pipeline and catalog DB however you like.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from statistics import median
from typing import Optional

# ============================================================================
# CONFIG — all business rules live here; tune without touching logic
# ============================================================================

CONFIG = {
    # Profit floors (minimum OMP margin per unit, per tier)
    "floor_consumer":    10.00,
    "floor_retailer":     5.00,
    "floor_wholesale":    2.50,
    "floor_distributor":  1.00,

    # Retailer guaranteed margin: retailer must be able to net this much
    # selling at OMP's consumer price
    "retailer_min_margin": 20.00,

    # Kitting (box + cable). Baked into T1/T2 pricing only. T3/T4 ship HSO.
    "kit_cost_premium":   5.00,   # Apple or vendor_cost >= kit_premium_threshold
    "kit_cost_standard":  3.00,
    "kit_premium_threshold": 300.00,

    # Wholesale markup bands by vendor cost bracket
    "wholesale_bands":   [(100, 7.00), (300, 10.00), (600, 12.00), (float("inf"), 15.00)],
    # Distributor markup bands
    "distributor_bands": [(100, 3.00), (300, 4.00), (600, 5.00), (float("inf"), 6.00)],
    # Percentage caps for premium devices (cost > 800)
    "premium_cost_threshold": 800.00,
    "distributor_pct_cap": 0.025,
    "wholesale_pct_cap":   0.04,

    # Competitive benchmark
    "outlier_trim_pct":    0.30,  # drop comps >30% from median
    "min_sources_high_confidence": 3,
    "locked_discount":     0.90,  # locked device benchmark multiplier when
                                  # only unlocked comps are available

    # Fallback grade multipliers (used when confidence == NONE)
    "fallback_multipliers": {
        "NEW": 1.55, "CPO": 1.50, "A": 1.45, "B": 1.38, "C": 1.32, "D": 1.20,
    },
    "fallback_default_multiplier": 1.38,

    # Day-over-day vendor cost change that triggers hold-for-review
    "cost_change_review_pct": 0.15,
}

# ============================================================================
# VENDOR GRADE MAPPING — per-vendor taxonomy -> CTIA grade
# Onboarding a new vendor == adding one dict here (or a DB table row set)
# ============================================================================

class CTIAGrade(str, Enum):
    NEW = "NEW"
    CPO = "CPO"
    A   = "A"    # Like-new / A grade  -> consumer/retailer eligible
    B   = "B"
    C   = "C"
    D   = "D"

# Grades visible to Tier 1 & Tier 2 (CTIA A-equivalent and better, per OMP policy)
CONSUMER_ELIGIBLE_CTIA = {CTIAGrade.NEW, CTIAGrade.CPO, CTIAGrade.A}

VENDOR_GRADE_MAPS: dict[str, dict[str, CTIAGrade]] = {
    "HYLA": {
        # Per OMP field experience: only these three HYLA grades meet the
        # CTIA bar for consumer/retailer. Everything else -> T3/T4 only.
        "TPS A+":  CTIAGrade.A,
        "TPS A":   CTIAGrade.A,
        "DLS AA+": CTIAGrade.A,
        # Below the line — mapped for completeness; all gate to T3/T4
        "DLS A+":  CTIAGrade.B,
        "DLS A":   CTIAGrade.B,
        "DLS B+":  CTIAGrade.B,
        "DLS B":   CTIAGrade.B,
        "TPS B+":  CTIAGrade.B,
        "TPS B-":  CTIAGrade.C,
        "DLS C":   CTIAGrade.C,
        "TPS C+":  CTIAGrade.C,
        "TPS C-":  CTIAGrade.C,
        "TPS D":   CTIAGrade.D,
    },
    # "NEXT_VENDOR": { ... }
}

# ============================================================================
# DATA MODELS
# ============================================================================

@dataclass
class StockItem:
    """One normalized row from a vendor stock feed."""
    vendor: str                 # e.g. "HYLA"
    sku_id: str                 # internal SKU key: model|capacity|grade|carrier|lock
    make: str                   # Apple / Samsung / Google / ...
    model: str                  # iPhone 17 / Galaxy S25 / ...
    capacity: str               # 256GB
    vendor_grade: str           # vendor's own label, e.g. "DLS AA+"
    carrier: str                # ATT / VZW / TMO / OTH / UNL
    lock_status: str            # LOCKED / UNLOCKED
    vendor_cost: float          # our buy cost (HSO)
    quantity: int

@dataclass
class CompetitorQuote:
    source: str                 # "amazon_renewed" | "ebay" | "walmart" | "bestbuy" | "backmarket"
    price: float                # landed price shown to consumer (most sources ship free)
    condition_label: str        # source's own condition string
    lock_matched: bool          # True if quote is for same lock status

class Confidence(str, Enum):
    HIGH = "HIGH"; LOW = "LOW"; NONE = "NONE"

class TierFlag(str, Enum):
    OK = "OK"
    HIDDEN_GRADE = "HIDDEN_GRADE"          # grade not consumer-eligible
    FLAG_MARGIN = "FLAG_MARGIN"            # can't clear profit floor at market price
    FLAG_UNBENCHMARKED = "FLAG_UNBENCHMARKED"  # no comps; using fallback formula

@dataclass
class PriceResult:
    sku_id: str
    ctia_grade: CTIAGrade
    total_cost_t12: float               # vendor_cost + kit  (consumer/retailer basis)
    benchmark: Optional[float]
    confidence: Confidence
    consumer_price: Optional[float]
    retailer_price: Optional[float]
    wholesale_price: float
    distributor_price: float
    consumer_flag: TierFlag
    retailer_flag: TierFlag
    notes: list[str] = field(default_factory=list)

# ============================================================================
# CORE LOGIC
# ============================================================================

def map_grade(vendor: str, vendor_grade: str) -> CTIAGrade:
    vmap = VENDOR_GRADE_MAPS.get(vendor, {})
    grade = vmap.get(vendor_grade)
    if grade is None:
        # Unknown grade: safest assumption is C -> T3/T4 only, and log it
        return CTIAGrade.C
    return grade


def kit_cost(make: str, vendor_cost: float) -> float:
    if make.strip().lower() == "apple" or vendor_cost >= CONFIG["kit_premium_threshold"]:
        return CONFIG["kit_cost_premium"]
    return CONFIG["kit_cost_standard"]


def band_markup(cost: float, bands: list[tuple[float, float]]) -> float:
    for ceiling, markup in bands:
        if cost < ceiling:
            return markup
    return bands[-1][1]


def compute_benchmark(
    quotes: list[CompetitorQuote], lock_status: str
) -> tuple[Optional[float], Confidence, list[str]]:
    """
    Average-of-market benchmark with outlier trimming.
    Returns (benchmark, confidence, notes).
    """
    notes: list[str] = []
    if not quotes:
        return None, Confidence.NONE, ["no competitor quotes matched"]

    prices = [q.price for q in quotes]
    med = median(prices)
    trim = CONFIG["outlier_trim_pct"]
    kept = [p for p in prices if abs(p - med) / med <= trim]
    dropped = len(prices) - len(kept)
    if dropped:
        notes.append(f"trimmed {dropped} outlier quote(s) >±{int(trim*100)}% from median")

    benchmark = round(sum(kept) / len(kept), 2)

    # Lock adjustment: if our SKU is locked but comps are unlocked-only,
    # discount the benchmark
    if lock_status == "LOCKED" and not any(q.lock_matched for q in quotes):
        benchmark = round(benchmark * CONFIG["locked_discount"], 2)
        notes.append(f"locked-device discount x{CONFIG['locked_discount']} applied "
                     "(no locked comps found)")

    distinct_sources = len({q.source for q in quotes})
    conf = (Confidence.HIGH
            if distinct_sources >= CONFIG["min_sources_high_confidence"]
            else Confidence.LOW)
    return benchmark, conf, notes


def fallback_consumer_price(total_cost: float, ctia: CTIAGrade) -> float:
    mult = CONFIG["fallback_multipliers"].get(
        ctia.value, CONFIG["fallback_default_multiplier"])
    return round(total_cost * mult, 2)


def price_item(item: StockItem, quotes: list[CompetitorQuote]) -> PriceResult:
    """
    The pricing waterfall. Pure function: same inputs -> same outputs.
    """
    notes: list[str] = []
    ctia = map_grade(item.vendor, item.vendor_grade)
    kc = kit_cost(item.make, item.vendor_cost)
    total_cost = round(item.vendor_cost + kc, 2)   # T1/T2 basis (kitted)

    # ---- Tier 3 / Tier 4: bare-HSO cost-plus, never competitively capped ----
    w_markup = band_markup(item.vendor_cost, CONFIG["wholesale_bands"])
    d_markup = band_markup(item.vendor_cost, CONFIG["distributor_bands"])
    if item.vendor_cost > CONFIG["premium_cost_threshold"]:
        w_markup = min(w_markup, item.vendor_cost * CONFIG["wholesale_pct_cap"])
        d_markup = min(d_markup, item.vendor_cost * CONFIG["distributor_pct_cap"])
    wholesale_price   = round(item.vendor_cost + max(w_markup, CONFIG["floor_wholesale"]), 2)
    distributor_price = round(item.vendor_cost + max(d_markup, CONFIG["floor_distributor"]), 2)

    # ---- Grade gate for consumer/retailer ----
    if ctia not in CONSUMER_ELIGIBLE_CTIA:
        return PriceResult(
            sku_id=item.sku_id, ctia_grade=ctia, total_cost_t12=total_cost,
            benchmark=None, confidence=Confidence.NONE,
            consumer_price=None, retailer_price=None,
            wholesale_price=wholesale_price, distributor_price=distributor_price,
            consumer_flag=TierFlag.HIDDEN_GRADE, retailer_flag=TierFlag.HIDDEN_GRADE,
            notes=[f"grade {item.vendor_grade} -> CTIA {ctia.value}: below consumer bar"],
        )

    # ---- Benchmark ----
    benchmark, conf, bench_notes = compute_benchmark(quotes, item.lock_status)
    notes.extend(bench_notes)

    if benchmark is None:
        # No comps at all: fall back to grade multiplier, tag for review
        consumer_price = fallback_consumer_price(total_cost, ctia)
        consumer_flag = TierFlag.FLAG_UNBENCHMARKED
        notes.append("fallback multiplier pricing used; admin review recommended")
    else:
        # CONSUMER RULE: price AT the average SRP -> max profit from cost
        # up to the market average. We take the whole spread.
        consumer_price = benchmark
        consumer_flag = TierFlag.OK

    # Consumer profit floor
    if consumer_price - total_cost < CONFIG["floor_consumer"]:
        consumer_flag = TierFlag.FLAG_MARGIN
        notes.append(
            f"consumer margin ${consumer_price - total_cost:.2f} "
            f"< floor ${CONFIG['floor_consumer']:.2f} -> hidden from T1")
        consumer_price_out = None
    else:
        consumer_price_out = consumer_price

    # RETAILER RULE: retailer must net >= $20 selling at our consumer price,
    # so retailer price = consumer - retailer_min_margin.
    retailer_flag = TierFlag.OK
    retailer_price_out: Optional[float] = None
    if consumer_price_out is None:
        retailer_flag = consumer_flag          # consumer hidden -> retailer hidden
        notes.append("retailer hidden because consumer tier is hidden")
    else:
        retailer_price = round(consumer_price_out - CONFIG["retailer_min_margin"], 2)
        if retailer_price - total_cost < CONFIG["floor_retailer"]:
            retailer_flag = TierFlag.FLAG_MARGIN
            notes.append(
                f"retailer margin ${retailer_price - total_cost:.2f} "
                f"< floor ${CONFIG['floor_retailer']:.2f} -> hidden from T2")
        else:
            retailer_price_out = retailer_price

    # ---- Tier-order validation (only across visible tiers) ----
    chain = [item.vendor_cost, distributor_price, wholesale_price]
    if retailer_price_out is not None:
        chain.append(retailer_price_out)
    if consumer_price_out is not None:
        chain.append(consumer_price_out)
    if chain != sorted(chain):
        notes.append("TIER ORDER VIOLATION - route to admin, do not publish")

    return PriceResult(
        sku_id=item.sku_id, ctia_grade=ctia, total_cost_t12=total_cost,
        benchmark=benchmark, confidence=conf,
        consumer_price=consumer_price_out, retailer_price=retailer_price_out,
        wholesale_price=wholesale_price, distributor_price=distributor_price,
        consumer_flag=consumer_flag, retailer_flag=retailer_flag, notes=notes,
    )

# ============================================================================
# DEMO
# ============================================================================

if __name__ == "__main__":
    # Real row from HYLA feed: iPhone 17 256GB DLS AA+ ATT LOCKED @ $537
    item = StockItem(
        vendor="HYLA", sku_id="iphone17|256GB|DLS AA+|ATT|LOCKED",
        make="Apple", model="iPhone 17", capacity="256GB",
        vendor_grade="DLS AA+", carrier="ATT", lock_status="LOCKED",
        vendor_cost=537.00, quantity=2,
    )
    # Illustrative competitor quotes (nightly fetch would supply these)
    quotes = [
        CompetitorQuote("amazon_renewed", 729.00, "Excellent", lock_matched=False),
        CompetitorQuote("ebay",           699.00, "Certified Refurbished", lock_matched=False),
        CompetitorQuote("backmarket",     715.00, "Excellent", lock_matched=False),
        CompetitorQuote("walmart",        745.00, "Restored Premium", lock_matched=False),
        CompetitorQuote("ebay",           499.00, "Excellent", lock_matched=False),  # lowball outlier
    ]
    result = price_item(item, quotes)
    print(f"SKU:          {result.sku_id}")
    print(f"CTIA grade:   {result.ctia_grade.value}")
    print(f"Kitted cost:  ${result.total_cost_t12:.2f}")
    print(f"Benchmark:    ${result.benchmark:.2f}  ({result.confidence.value})")
    print(f"T1 Consumer:  ${result.consumer_price:.2f}  [{result.consumer_flag.value}]"
          f"   margin ${result.consumer_price - result.total_cost_t12:.2f}")
    print(f"T2 Retailer:  ${result.retailer_price:.2f}  [{result.retailer_flag.value}]"
          f"   margin ${result.retailer_price - result.total_cost_t12:.2f}")
    print(f"T3 Wholesale: ${result.wholesale_price:.2f}   margin "
          f"${result.wholesale_price - 537.00:.2f}")
    print(f"T4 Distrib.:  ${result.distributor_price:.2f}   margin "
          f"${result.distributor_price - 537.00:.2f}")
    for n in result.notes:
        print(f"  note: {n}")
