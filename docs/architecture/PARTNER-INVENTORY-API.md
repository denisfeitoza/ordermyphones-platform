# Partner Inventory API (outbound feed)

> The Platform as a **supplier**. Third parties integrate our API and receive a live, marked-up inventory feed — pushed on every real movement, pullable at any time for reconciliation.
>
> This is the **third surface** of the Platform. The other two are inbound (supplier adapters → us) and storefront (us → human buyers). This one is outbound machine-to-machine: **us → a partner's system**.

---

## 1. Business model (why this exists)

Order My Phones aggregates several upstream feeds (Source A, Source B, the reserved DXB slot). Partners do not buy from those suppliers — they buy from **us**. Therefore:

1. Upstream suppliers are **never named** in anything a partner can observe. Each supplier is projected as one **OMP inventory location** (e.g. Source B → `us-tx` / *"Texas Inventory"*, Source A → its own location, the reserved DXB feed → its own).
2. **A SKU can live in several locations at once**, with a different quantity in each — 200 units total might be 140 in one inventory and 60 in another. The partner sees our warehouse network, not our supplier list.
3. Partners never see `unit_cost_cents`. They see **our sell price**, which is upstream cost plus **our margin**.
4. The feed is a **projection**, not a mirror. What a partner receives is computed by us, per partner, from data they have no other route to.
5. **Every movement is presented as ours.** When a sync shows a location's quantity dropped, we publish it as our own stock movement — the partner has no way to tell an OMP order from an upstream sale, and does not need to. The feed is authoritative from where the partner stands.

This is a data-governance requirement, not a display convention. See §7.

---

## 2. Who consumes it

Existing **`accounts`** — no new tenant entity. A business account (typically Tier 3 Multi-Store or Tier 4 Wholesale) is granted feed access by an admin; it then holds API credentials alongside its normal human logins.

| | Storefront customer | Feed partner |
|---|---|---|
| Identity | Supabase Auth JWT (`users` + `account_memberships`) | API key pair, scoped to one `account_id` |
| Same `accounts` row | ✅ | ✅ |
| Sees tier prices | ✅ | Only if margin rules are configured to mirror them (§5) |
| Reads other accounts' data | ❌ | ❌ |

**Invariant:** the **`inventory:read`** key grants **strictly less** than the account's human session. It is read-only over inventory, cannot place orders, cannot read PII, cannot read orders — not even its own account's. It is an inventory feed credential, nothing else.

> **Fulfillment is a separate scope.** A partner that also *places* orders (e.g. SmartPay dropship) holds a distinct **`fulfillment:write`** credential, defined in [`../integrations/SMARTPAY-INTEGRATION.md`](../integrations/SMARTPAY-INTEGRATION.md) §4. The read feed key still cannot write, and the write key cannot read the catalog beyond what an order echoes. Two scopes, two keys — a leak of one never becomes the other. The read-only invariant above is unchanged **for the read key**.

---

## 3. The event that matters

The feed is **state-based, not cause-based**. We do not publish "an order was paid" or "a supplier sync ran". We publish:

> **The partner-visible availability or price of a variant _in one location_ changed.**

The unit of the feed is `(variant, location)`, not `variant`. A SKU present in three locations is three independent rows and emits three independent event streams. We never sum across locations — the partner needs to know *where* the units are, and a summed number would make a location going to zero invisible.

Everything the user asked for falls out of this one rule:

| Real-world movement | Effect on the projection | Emits? |
|---|---|---|
| Order reaches `paid` | Units consumed at the fulfilling location → availability drops there | ✅ |
| Supplier sync reports a new quantity | That location's availability changes | ✅ |
| Supplier sync reports a new cost | That location's marked-up price changes | ✅ |
| Supplier sync reports **identical** data | Projection identical | ❌ (suppressed) |
| Order canceled / refunded / returned | Units released → availability rises | ✅ |
| Admin edits a margin rule | Price changes for the affected partners only | ✅ |
| Product unpublished / variant archived | Availability → 0 in every location, `status: 'delisted'` | ✅ |
| A location's feed goes inactive (`is_public = false`, supplier disabled) | That location's rows → 0 / `delisted`; other locations untouched | ✅ |

**No-op suppression is a hard requirement.** The supplier adapters run on `pg_cron` every N minutes and re-upsert the full feed each time; without change detection, every partner would receive a full-catalog storm on every tick. The emitter compares the newly computed projection row against the last one **actually delivered to that partner** and emits only on a real delta.

### 3.1 Projection pipeline

```
inventory_snapshots (per supplier, raw cost)   orders (paid / canceled)
              │                                        │
              └──────────────┬─────────────────────────┘
                             ▼
              partner_inventory_projection      ← per (account_id, variant_id, location_id)
              available_qty · partner_price_cents  computed with that partner's margin
                             │
                    delta vs last delivered?
                        │            │
                       no            yes
                        │            │
                    (suppress)       ▼
                             partner_webhook_deliveries → HMAC-signed POST
                                                        ↘ retry w/ backoff
```

Availability published for a `(variant, location)` is that location's `available_qty − reserved_qty`, clamped to ≥ 0. `reserved_qty` covers orders that are `paid` or `fulfilling` but not yet dispatched **at that location**, so we never publish stock we have already sold.

**Upstream drift is published as our own movement.** In a dropship model the units belong to the supplier, who can sell them through other channels between two syncs. We do not model that as an exception: when the next sync shows a location down 12 units, the projection drops 12 and the partner receives an ordinary `inventory.updated`. From the partner's side there is no observable difference between an OMP order and an upstream sale — and there must not be, since the alternative would leak that the stock is not ours. The residual exposure is the sync interval itself: a partner acting on data older than one tick can order units that no longer exist. That is bounded by sync frequency and the daily full-pull obligation (§4.2), and the feed never promises a firm reservation.

---

## 4. API surface

Base: `https://api.ordermyphones.com/v1` · versioned in the path · JSON only · all money in **integer cents**.

### 4.1 Push — webhook delivery

`POST` to the partner's registered `endpoint_url`.

```jsonc
{
  "event": "inventory.updated",
  "event_id": "evt_01J8Z9K...",        // unique; use for idempotency
  "sequence": 918273,                  // strictly increasing per subscription
  "emitted_at": "2026-07-20T14:03:11Z",
  "data": {
    "sku": "IP15PM-256-TIT",
    "brand": "Apple",
    "model": "iPhone 15 Pro Max",
    "color": "Natural Titanium",
    "storage_gb": 256,
    "condition": "new",
    "available_qty": 42,
    "price_cents": 108900,             // OUR sell price to THIS partner
    "currency": "USD",
    "location": { "code": "us-tx", "label": "Texas Inventory" },
    "status": "available",             // available | out_of_stock | delisted
    "as_of": "2026-07-20T14:03:09Z"
  }
}
```

Headers:

| Header | Meaning |
|---|---|
| `X-OMP-Signature` | `t=<unix>,v1=<hex>` — HMAC-SHA256 of `"{t}.{raw_body}"` with the subscription's signing secret. Same construction as our Stripe ingress, mirrored outbound. |
| `X-OMP-Event-Id` | Duplicate of `event_id`, for cheap dedup at the edge. |
| `X-OMP-Sequence` | Duplicate of `sequence`. |

**Partner contract, documented for them:**
- Verify the signature before parsing. Reject if `|now − t| > 5 min` (replay window).
- Respond `2xx` within **5 s**. Anything else is a failure.
- Deduplicate on `event_id` — we guarantee **at-least-once**, not exactly-once.
- Discard any event whose `sequence` is lower than the highest already applied for that **`(sku, location.code)`** pair. Retries can arrive out of order, and the same SKU has an independent stream per location.
- Key your local stock table on `(sku, location.code)`. A SKU can appear in several locations with different quantities and, if margin rules differ by location cost, different prices.

**Retry:** exponential backoff `10s → 1m → 5m → 30m → 2h → 6h`, 6 attempts, full jitter. After the last failure the subscription is marked `degraded`, the admin dashboard raises an alert, and the partner must reconcile via §4.2. Deliveries are never silently dropped without a `partner_webhook_deliveries` row recording the terminal state.

### 4.2 Pull — reconciliation

```
GET /v1/inventory?updated_since=2026-07-20T00:00:00Z&cursor=...&limit=500
GET /v1/inventory?location=us-tx
GET /v1/inventory/{sku}          → returns one row per location holding that SKU
```

Cursor-paginated, same payload shape as `data` above — **one row per `(sku, location)`**, never a summed row. This endpoint is **not optional**: webhook-only feeds drift the moment a partner has an outage, and drift on a stock feed means overselling. Partners are told to run a full pull at least daily.

Rate limits: `120 req/min` and `1000 req/hour` per API key, returned in `X-RateLimit-*` headers, `429` with `Retry-After` on breach.

### 4.3 Errors

Structured, no internals leaked:

```json
{ "error": { "code": "rate_limited", "message": "…", "correlation_id": "…" } }
```

Codes: `unauthorized`, `forbidden`, `not_found`, `rate_limited`, `invalid_cursor`, `internal`. A `correlation_id` is the only handle a partner gets — stack traces, SQL, supplier names and upstream error text never cross the boundary.

---

## 5. Margin

Global default with per-partner override, in the same shape as `price_rules`.

```
partner_price_cents = ceil( unit_cost_cents × (10_000 + margin_bps) / 10_000 )
```

- Margin is expressed in **basis points** (`margin_bps`), integer, consistent with `price_rules.value_bps`.
- `ceil`, not `round` — rounding down would silently donate margin on high-volume SKUs.
- Resolution order, most specific wins:

```
variant rule (this partner) > product rule (this partner) > global rule (this partner) > platform default > error
```

- `unit_cost_cents` is **that location's own cost**. Two locations holding the same SKU at different upstream costs produce two rows at two prices — which is honest, since they are genuinely different stock. The partner picks; we do not silently reroute a purchase to a cheaper location behind a single blended price.
- **Floor invariant:** `partner_price_cents ≥ unit_cost_cents + min_margin_cents` (default `min_margin_cents = 1`). We never emit a price at or below cost, whatever the rules say. A rule that would violate this is rejected at write time, not at emit time.
- **No price, no publish.** If a variant has no resolvable margin rule for a partner, it is **omitted from that partner's feed** and an admin alert is raised. We never invent a price — same posture as [`PRICING-ENGINE.md`](PRICING-ENGINE.md) §3.

### 5.1 Two pricing paths (cost-plus margin vs. tier)

A subscription declares a `price_source`:

- **`cost_plus_margin`** (default, wholesale reseller) — the `margin_bps` model above, over hidden cost. A wholesale construct for machines, deliberately **independent of Tiers 1–4**.
- **`tier`** (a partner priced at a standard tier, e.g. **SmartPay at consumer**) — the partner receives the already-computed `prices` row for that tier, straight from the Pricing Engine v2 nightly batch. No `margin_bps`; the tier price already embeds OMP's margin (benchmark − cost). See [`PRICING-ENGINE.md`](PRICING-ENGINE.md) and [`../integrations/SMARTPAY-INTEGRATION.md`](../integrations/SMARTPAY-INTEGRATION.md).

The two are **exclusive per subscription** — `price_source` decides which table is read. `partner_margin_rules` and the tier `prices` are never blended. This is the reconciliation of the original wholesale-margin model with v2's tier pricing.

---

## 6. Data model additions

Full field detail lands in [`DATA-MODEL.md`](DATA-MODEL.md); this is the shape.

| Table | Purpose |
|---|---|
| `partner_api_keys` | `account_id`, `key_id` (public), `secret_hash` (Argon2 — plaintext shown exactly once at creation), `scopes`, `last_used_at`, `expires_at`, `revoked_at`. |
| `partner_feed_subscriptions` | `account_id`, `endpoint_url`, `signing_secret`, `status` (`active`/`paused`/`degraded`), `last_sequence`, filter (brands / conditions / locations the partner subscribes to). |
| `partner_margin_rules` | `account_id` (null = platform default), `scope` (`global`/`product`/`variant`), `target_id`, `margin_bps`, `min_margin_cents`, `priority`, `effective_from`/`effective_to`. |
| `partner_inventory_projection` | Materialized `(account_id, variant_id, location_id)` → `available_qty`, `partner_price_cents`, `status`, `content_hash`, `last_emitted_sequence`. The `content_hash` is what makes no-op suppression cheap. |
| `partner_webhook_deliveries` | `subscription_id`, `event_id`, `sequence`, `payload`, `attempt`, `http_status`, `error`, `delivered_at`, `next_retry_at`. Full delivery forensics. |
| `inventory_locations` | `supplier_id` → `code` (`us-tx`), `label` (*Texas Inventory*). One row per supplier. **The masking map.** Admin-only; the join key never leaves the server. |

Rotation: keys and signing secrets support overlap — a new secret is issued while the old one stays valid for a grace window, so partners rotate without downtime. Both are `Restricted` class ([`../security/DATA-CLASSIFICATION.md`](../security/DATA-CLASSIFICATION.md)).

---

## 7. Non-disclosure invariants (enforced, not conventional)

A partner-visible payload **must never** contain:

1. Supplier identity — name, code, `supplier_id`, domain, or any upstream external ID.
2. `unit_cost_cents`, margin values, or anything from which cost is derivable.
3. Another account's data — pricing, quantities, order volume, or existence.
4. Internal UUIDs beyond the SKU (`variant_id`, `supplier_id`, `account_id` stay server-side).
5. Raw supplier responses (`inventory_snapshots.raw`) or upstream error text.

Enforcement is a **serializer allow-list**, not a redaction pass: the outbound DTO is constructed field-by-field from an explicit list. A new column on `inventory_snapshots` can therefore never leak by default. A contract test asserts the emitted JSON keys equal the allow-list exactly, and a second test asserts no supplier `display_name` string appears anywhere in a generated payload.

> ⚠️ **Open item for the Client — legal, not technical.** Reselling upstream inventory under our own brand, with supplier identity masked, has to be permitted by the agreements with Source A and Source B (resale rights, white-label / no-attribution clauses, price-display restrictions, data-redistribution terms). The Platform enforces the masking; it cannot make it lawful. This needs confirming against each supplier contract before the feed is exposed to a real partner. See [`../contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md`](../contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md) §1.4 / Schedule A.2.

---

## 8. Auth & RLS

- **Authentication:** `Authorization: Bearer <key_id>.<secret>`. The secret is verified against `secret_hash`; only `key_id` is ever logged.
- **Not a Supabase JWT.** The API service resolves the key to an `account_id` and then queries with `service_role`, applying the partner scope **in application code**. It never mints a customer JWT and never hands a partner anything that looks like a session.
- **Blast radius:** a leaked partner key exposes exactly that partner's own marked-up feed — no PII, no orders, no other tenant, no cost data. That is the whole point of the scope being this narrow.
- RLS rows for the new tables: admin/staff read, `service_role` write. Account owners may read **their own** `partner_api_keys` metadata (never `secret_hash`) and `partner_feed_subscriptions`. `partner_margin_rules` and `inventory_locations` are **admin-only, never account-readable** — margin and the masking map are ours.

Detail in [`AUTH-AND-RLS.md`](AUTH-AND-RLS.md) §4.

---

## 9. Failure modes and what we do about them

| Failure | Consequence | Control |
|---|---|---|
| Partner endpoint down | Feed drifts stale → partner oversells | Retry + backoff; `degraded` status; admin alert; daily full-pull obligation in the partner contract |
| Retry storm after long outage | Thundering herd on partner recovery | Per-subscription delivery concurrency cap + jitter; coalesce queued events per SKU to the latest state before flushing |
| Supplier sync flaps a value back and forth | Event churn | `content_hash` comparison suppresses no-ops; a flapping SKU trips a per-SKU emit-rate limit and an `inventory-triage-agent` review |
| Two suppliers report the same SKU with different costs | Two locations, two prices — by design, not a conflict | Each location prices from its own cost. A *large* spread still routes to `inventory-triage-agent` as a possible feed-parsing bug (see [`SYSTEM-OVERVIEW.md`](SYSTEM-OVERVIEW.md) §3.2) |
| Partner sums our per-location rows and treats it as one pool | Oversell against a location that is empty | Payload has no total field; the integration guide states the `(sku, location)` key explicitly; `GET /v1/inventory/{sku}` returns rows, never a sum |
| Upstream sells units through another channel between syncs | Partner ordered stock that is gone | Published as an ordinary movement on the next sync (§3.1); bounded by sync frequency; the feed never promises a firm reservation, and the partner contract says so in writing |
| Concurrent order paid + supplier sync | Lost update on `available_qty` | Projection recomputed inside the same transaction as the movement, `pg_advisory_lock` per `(variant_id, location_id)`; the projection is derived, never incremented in place |
| Margin rule deleted while feed is live | Variant silently vanishes from the feed | Deletion is soft + blocked when it would orphan an active subscription; admin must set a replacement first |
| Partner replays an old captured payload | Stale state applied | `sequence` monotonicity + 5-min signature timestamp window; documented as the partner's obligation |
| Overselling across partners | Same units promised twice | Availability is published **net of reservations**; a shared pool means partners see the same declining number — an optional per-partner `allocation_cap` is available where a hard reserve is commercially agreed |

---

## 10. Out of scope (v1)

- ~~Partners placing orders through the API~~ — **now in scope** via the `fulfillment:write` surface for SmartPay ([`../integrations/SMARTPAY-INTEGRATION.md`](../integrations/SMARTPAY-INTEGRATION.md) §4). The *read feed* remains read-only.
- Per-partner currency conversion — USD only, matching Schedule A.3.
- GraphQL / gRPC surfaces.
- Partner-facing self-service key management UI (admin issues keys in v1).
- Hard stock reservation per partner (`allocation_cap` is designed for but not shipped).
- Cross-location routing ("give me 200 units, split them however"). v1 sells per location.

---

## 11. Related docs

- [`SYSTEM-OVERVIEW.md`](SYSTEM-OVERVIEW.md) — where this context sits in the whole.
- [`DATA-MODEL.md`](DATA-MODEL.md) — table definitions.
- [`PRICING-ENGINE.md`](PRICING-ENGINE.md) — retail tier pricing, deliberately separate from partner margin.
- [`AUTH-AND-RLS.md`](AUTH-AND-RLS.md) — the M2M identity.
- [`../security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) — partner-surface threats.
- [`../security/DATA-CLASSIFICATION.md`](../security/DATA-CLASSIFICATION.md) — what a partner may and may not observe.
- [`../integrations/SUPPLIER-SOURCE-2.md`](../integrations/SUPPLIER-SOURCE-2.md) — the inbound feed this projects from.
