# SmartPay Integration (OMP as inventory + fulfillment partner)

> **SmartPay (SP)** is building a direct-to-consumer phone **leasing** storefront. **Order My Phones (OMP)** is its inventory and fulfillment partner: OMP feeds SP live stock and prices, and fulfills each lease by dropshipping the device to SP's end customer.
>
> Two-way API. OMP → SP: the inventory feed. SP → OMP: order placement and status. This is the first concrete partner on the [Partner Inventory API](../architecture/PARTNER-INVENTORY-API.md), and the first that goes beyond read-only.
>
> Source: OMP × SmartPay call, 2026-07-21 (Mike U / SP; Tony S, Justin, Anthony W, Abdu, Dennis / OMP).

---

## 1. Shape of the deal

| | |
|---|---|
| **SP's product** | Consumer leasing storefront (SP owns the lease, the consumer, the checkout) |
| **OMP's role** | Supply + fulfillment: live catalog, consumer-tier pricing, dropship to SP's customer |
| **Integration model** | SP defines its ideal API call list; **OMP adapts to it** (Dennis + 2 devs, fast turnaround) |
| **Pricing tier** | **Consumer (T1)** — SP's end-consumer use case is the retail segment ([`../architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md)) |
| **Catalog scope at launch** | Brand-inclusive filter: **all Apple, all Samsung** (~99.8% of SP volume). ~70 models, 100+ SKUs. Expand from there. |
| **Grade scope** | Warranty/certified only — SP wants CTIA **A / CPO / NEW** exclusively (no B/C/D) |
| **Fulfillment** | 1–2 day express, FedEx / UPS. Ground available but requires insurance (breakage risk). |
| **Launch date** | None set — SP still in planning; OMP asked for a target once SP's other workstreams close |
| **Backend contact** | `support@ordermyphones.com` for all backend requests |

**Supply reality SP must plan around:** OMP's largest vendor (HYLA) is only ~0.3% consumer-eligible by grade. Consumer-tier depth for SP comes from OMP's **CPO / new** stock and other vendors, **not** from raw HYLA volume. Set catalog-depth expectations accordingly ([`../architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md) §2).

---

## 2. Two directions, two trust levels

```
        ┌───────────────────────── OMP → SP  (read) ─────────────────────────┐
        │  Inventory feed: consumer-tier price, availability, location,        │
        │  delivery ETA. Push (webhook) + pull (reconcile). No cost, no        │
        │  supplier identity — same allow-list as the Partner Inventory API.   │
        └──────────────────────────────────────────────────────────────────────┘

        ┌───────────────────────── SP → OMP  (write) ────────────────────────┐
        │  Fulfillment: place order, cancel, track. Carries the end           │
        │  customer's ship-to address (PII). Idempotent. Scoped to a          │
        │  SEPARATE credential from the read feed.                            │
        └──────────────────────────────────────────────────────────────────────┘
```

**The two directions never share one key.** The read feed key is `inventory:read` (the existing Partner API scope — no PII, no writes). Fulfillment uses a distinct `fulfillment:write` key. A leak of one cannot exercise the other. See §7.

---

## 3. OMP → SP — the inventory feed

Reuses the [Partner Inventory API](../architecture/PARTNER-INVENTORY-API.md) verbatim, with SP subscribed at **consumer tier** and filtered to Apple + Samsung, CTIA-A/CPO/NEW.

### 3.1 What changes vs. a wholesale partner

| | Wholesale partner (default) | SmartPay |
|---|---|---|
| Price shown | T3/T4 (cost-plus margin) | **T1 consumer** (benchmark-driven, from the nightly batch) |
| Grades in feed | All CTIA grades | **A / CPO / NEW only** (grade gate already hides sub-A from consumer pricing) |
| Brand filter | none | Apple + Samsung |
| Delivery ETA | optional | **required** (drives SP's storefront promise) |

Because the pricing engine already prices every SKU at all four tiers and **hides sub-A grades from the consumer tier**, "consumer-tier + certified only" is not new logic — it is what the T1 projection already contains. SP simply subscribes to the T1 view.

### 3.2 Feed payload (delta vs. the base contract)

The base `inventory.updated` payload ([Partner API §4.1](../architecture/PARTNER-INVENTORY-API.md)) plus two fields SP needs:

```jsonc
{
  "event": "inventory.updated",
  "event_id": "evt_…",
  "data": {
    "sku": "APPLE-IPHONE16PRO-256-BLACKTITANIUM",
    "brand": "Apple",
    "model": "iPhone 16 Pro",
    "color": "Black Titanium",
    "storage_gb": 256,
    "condition": "cpo",              // A / CPO / NEW only for SP
    "available_qty": 42,
    "price_cents": 89900,            // OMP consumer price to SP
    "currency": "USD",
    "location": { "code": "us-tx", "label": "Texas" },   // for ETA, not the supplier
    "delivery_eta_days": 2,          // ← SP-facing addition
    "carrier_options": ["fedex_express", "ups_express"], // ← SP-facing addition
    "status": "available"
  }
}
```

`location` is a **delivery origin for ETA estimation**, never the upstream supplier. Stock ships mainly from **Texas**, with partner stock in **Florida** and **California**; the location code lets SP show a realistic delivery window without ever learning who OMP buys from. Masking is unchanged: supplier identity, OMP cost, and margin never cross the boundary ([Partner API §7](../architecture/PARTNER-INVENTORY-API.md)).

### 3.3 Pull + filter

```
GET /v1/inventory?brand=apple,samsung&condition=a,cpo,new&updated_since=…
GET /v1/inventory/{sku}
```

Brand filtering is **inclusive by brand** (whole-brand allow, e.g. "all Apple"), not per-model exclusion lists — matches how SP wants to scope the catalog and how it expands (add a brand, not a thousand SKUs).

---

## 4. SP → OMP — fulfillment (the new surface)

When a consumer completes a lease on SP's storefront, SP calls OMP to fulfill. This is **write** access and it moves an end-customer address into OMP — a deliberate, separately-scoped crossing.

### 4.1 Place an order

```
POST /v1/fulfillment/orders
Authorization: Bearer <fulfillment_key_id>.<secret>
Idempotency-Key: sp_order_7Y2k9…        ← REQUIRED
```

```jsonc
{
  "partner_order_ref": "SP-2026-00184122",   // SP's own id; unique per partner
  "lines": [
    { "sku": "APPLE-IPHONE16PRO-256-BLACKTITANIUM", "qty": 1 }
  ],
  "ship_to": {
    "name": "…", "line1": "…", "line2": "…",
    "city": "…", "state": "…", "postal_code": "…", "country": "US"
  },
  "shipping_speed": "express",               // express | ground(+insurance)
  "signature_required": true
}
```

Response:

```jsonc
{
  "omp_order_id": "ord_01J…",
  "partner_order_ref": "SP-2026-00184122",
  "status": "accepted",                      // accepted | rejected
  "lines": [
    { "sku": "…", "qty": 1, "unit_price_cents": 89900, "reserved_location": "us-tx" }
  ],
  "estimated_ship_date": "2026-07-22",
  "estimated_delivery_date": "2026-07-24"
}
```

**Idempotency is non-negotiable.** The `Idempotency-Key` header is **required**; a retry with the same key returns the *same* `omp_order_id` and never dispatches twice. A double-submit here is a double dropship — a physical device shipped and real money lost. The key is stored per partner and honored for 24 h; `partner_order_ref` is additionally `unique` per partner as a second guard.

**Price is authoritative from the feed, not the order.** SP does not send a price. OMP fulfills at the current published consumer price for the SKU; if it moved since SP's last sync, the response carries the real `unit_price_cents` and SP reconciles. OMP never trusts a client-supplied price.

**Reservation.** Acceptance reserves stock at a specific location (`reserved_location`) — the same net-of-reservations quantity that the feed already publishes, so an accepted order immediately decrements what other partners see. Insufficient stock → `status: "rejected", reason: "insufficient_stock"`, nothing reserved.

### 4.2 Status + tracking

```
GET  /v1/fulfillment/orders/{omp_order_id}
POST /v1/fulfillment/orders/{omp_order_id}/cancel     // only while status = accepted | processing
```

OMP also **pushes** fulfillment status to SP's webhook as it advances:

```
order.accepted → order.processing → order.shipped (carrier + tracking) → order.delivered
                                  ↘ order.canceled | order.exception
```

Same signed-webhook mechanics as the inventory feed (`X-OMP-Signature`, HMAC-SHA256, at-least-once, dedupe on `event_id`).

### 4.3 Cancellation window

Cancel is allowed only before dispatch (`accepted` / `processing`). Once `shipped`, the flow is a return, not a cancel — handled out of band (RMA), not through this endpoint in v1.

---

## 5. Delivery ETA

`delivery_eta_days` and `estimated_delivery_date` come from the **origin location** + shipping speed:

- Origin is the masked location holding the reserved unit (TX / FL / CA).
- Express (FedEx/UPS) = 1–2 business days; ground is slower and **requires insurance** (breakage risk on handsets) — surfaced as a separate `shipping_speed` with its own cost in Phase 2.
- v1 uses a static origin→region day table. **Phase 2** wires live FedEx/UPS rate + transit APIs; the `landed_cost` field is reserved in the schema from day one for exactly this ([`../architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md) §4 integration note).

---

## 6. Open items (genuinely undecided — do not invent)

1. **OMP ↔ SP margin formula.** The call left this "to be defined: fixed margin or percentage per unit sold." v2 pricing already produces the consumer price SP pays; what is unsettled is whether OMP takes an **additional** partner margin on top of the consumer price, or the consumer price *is* the wholesale-to-SP price. Blocks final commercial terms, not the API shape.
2. **Blind dropship / branding.** Does OMP ship in **plain / SP-branded** packaging (blind dropship) so the consumer sees SmartPay, not OMP? This ties to the masking model — if the box says "Order My Phones," the white-label story leaks at the doorstep. Confirm packaging + return-address branding before first fulfillment.
3. **Returns / RMA flow.** Out of scope for v1 fulfillment; needs its own contract before volume.
4. **Launch date.** SP-driven; OMP is ready on a fast timeline once SP sets it.

---

## 7. Security & data classification (fulfillment changes the threat model)

Fulfillment **reverses two invariants** the read-only Partner API relied on — it introduces writes and it moves PII across the boundary. Handled explicitly, not bolted on:

| Concern | Control |
|---|---|
| Write access | `fulfillment:write` is a **separate credential** from `inventory:read`; a read-key leak cannot place orders, a write-key leak cannot read the whole catalog beyond what an order echoes |
| End-customer PII (`ship_to`) | `Confidential` class ([`../security/DATA-CLASSIFICATION.md`](../security/DATA-CLASSIFICATION.md)); stored for fulfillment only, never in logs/prompts, opaque IDs across service boundaries |
| Double dispatch | **Required** `Idempotency-Key` (24 h) + `unique (partner_id, partner_order_ref)`; retries are safe, replays are no-ops |
| Client-supplied price tampering | Price is never accepted from SP; OMP fulfills at its own published price |
| Supplier / cost leak | Unchanged: allow-list serializer; `location` is a delivery origin, not a supplier ([Partner API §7](../architecture/PARTNER-INVENTORY-API.md)) |
| Order spoofing | HMAC-signed inbound (mutual): SP signs its POSTs, OMP verifies before acting; 5-min timestamp window |

New threats and mitigations are folded into [`../security/THREAT-MODEL.md`](../security/THREAT-MODEL.md); PII fields into [`../security/DATA-CLASSIFICATION.md`](../security/DATA-CLASSIFICATION.md).

---

## 8. Next steps (from the call)

1. **SP** drafts its ideal API call list → shares with Dennis. OMP adapts its infra to fit.
2. **SP** (Mike U) sets a delivery timeline once other workstreams close.
3. **OMP** is validating the same API surface against the CUPE marketplace integration this week and will share learnings.
4. Launch scope = filtered brand catalog (Apple, Samsung), certified grades, consumer pricing → expand.

---

## 9. Related docs

- [`../architecture/PARTNER-INVENTORY-API.md`](../architecture/PARTNER-INVENTORY-API.md) — the outbound feed SP subscribes to.
- [`../architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md) — the consumer price SP receives and the grade gate that scopes it.
- [`../architecture/PRODUCT-CATALOG-STANDARD.md`](../architecture/PRODUCT-CATALOG-STANDARD.md) — catalog attributes, CTIA grades, locations.
- [`../architecture/DATA-MODEL.md`](../architecture/DATA-MODEL.md) — `partner_*` tables + fulfillment orders.
- [`../security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) · [`../security/DATA-CLASSIFICATION.md`](../security/DATA-CLASSIFICATION.md) — the write + PII surface.
- [`SHIPMENT-TRACKING.md`](SHIPMENT-TRACKING.md) — carrier tracking that backs `order.shipped`.
