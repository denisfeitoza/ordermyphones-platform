# Partner Inventory API (outbound feed)

> The Platform as a **supplier**. Third parties integrate our API and receive a live, marked-up inventory feed — pushed on every real movement, pullable at any time for reconciliation.
>
> This is the **third surface** of the Platform. The other two are inbound (supplier adapters → us) and storefront (us → human buyers). This one is outbound machine-to-machine: **us → a partner's system**.

---

## 1. Business model (why this exists)

Order My Phones aggregates several upstream feeds (Assurant, Mannapov LLC, the reserved DXB slot). Partners do not buy from those suppliers — they buy from **us**. Therefore:

1. Upstream suppliers are **never named** in anything a partner can observe. Each supplier is projected as an **OMP inventory location** (e.g. Mannapov LLC → `us-tx` / *"Texas Inventory"*).
2. Partners never see `unit_cost_cents`. They see **our sell price**, which is upstream cost plus **our margin**.
3. The feed is a **projection**, not a mirror. What a partner receives is computed by us, per partner, from data they have no other route to.

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

**Invariant:** an API key grants **strictly less** than the account's human session. It is read-only over inventory, cannot place orders, cannot read PII, cannot read orders — not even its own account's. It is an inventory feed credential, nothing else.

---

## 3. The event that matters

The feed is **state-based, not cause-based**. We do not publish "an order was paid" or "a supplier sync ran". We publish:

> **The partner-visible availability or price of a variant changed.**

Everything the user asked for falls out of this one rule:

| Real-world movement | Effect on the projection | Emits? |
|---|---|---|
| Order reaches `paid` | Units consumed → availability drops | ✅ |
| Supplier sync reports a new quantity | Availability changes | ✅ |
| Supplier sync reports a new cost | Marked-up price changes | ✅ |
| Supplier sync reports **identical** data | Projection identical | ❌ (suppressed) |
| Order canceled / refunded / returned | Units released → availability rises | ✅ |
| Admin edits a margin rule | Price changes for the affected partners only | ✅ |
| Product unpublished / variant archived | Availability → 0, `status: 'delisted'` | ✅ |

**No-op suppression is a hard requirement.** The supplier adapters run on `pg_cron` every N minutes and re-upsert the full feed each time; without change detection, every partner would receive a full-catalog storm on every tick. The emitter compares the newly computed projection row against the last one **actually delivered to that partner** and emits only on a real delta.

### 3.1 Projection pipeline

```
inventory_snapshots (per supplier, raw cost)   orders (paid / canceled)
              │                                        │
              └──────────────┬─────────────────────────┘
                             ▼
              partner_inventory_projection            ← per (account_id, variant_id)
              available_qty · partner_price_cents      computed with that partner's margin
                             │
                    delta vs last delivered?
                        │            │
                       no            yes
                        │            │
                    (suppress)       ▼
                             partner_webhook_deliveries → HMAC-signed POST
                                                        ↘ retry w/ backoff
```

Availability published to partners is `sum(available_qty across active suppliers) − reserved_qty`, clamped to ≥ 0. `reserved_qty` covers orders that are `paid` or `fulfilling` but not yet dispatched, so we never publish stock we have already sold.

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
- Discard any event whose `sequence` is lower than the highest already applied for that SKU. Retries can arrive out of order.

**Retry:** exponential backoff `10s → 1m → 5m → 30m → 2h → 6h`, 6 attempts, full jitter. After the last failure the subscription is marked `degraded`, the admin dashboard raises an alert, and the partner must reconcile via §4.2. Deliveries are never silently dropped without a `partner_webhook_deliveries` row recording the terminal state.

### 4.2 Pull — reconciliation

```
GET /v1/inventory?updated_since=2026-07-20T00:00:00Z&cursor=...&limit=500
GET /v1/inventory/{sku}
```

Cursor-paginated, same payload shape as `data` above. This endpoint is **not optional**: webhook-only feeds drift the moment a partner has an outage, and drift on a stock feed means overselling. Partners are told to run a full pull at least daily.

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

- `unit_cost_cents` is the **lowest active cost across suppliers** for that variant. If costs differ across feeds, the partner still sees one price; the cheaper feed is what fulfills.
- **Floor invariant:** `partner_price_cents ≥ unit_cost_cents + min_margin_cents` (default `min_margin_cents = 1`). We never emit a price at or below cost, whatever the rules say. A rule that would violate this is rejected at write time, not at emit time.
- **No price, no publish.** If a variant has no resolvable margin rule for a partner, it is **omitted from that partner's feed** and an admin alert is raised. We never invent a price — same posture as [`PRICING-ENGINE.md`](PRICING-ENGINE.md) §3.

This layer is **independent of Tiers 1–4**. Tier pricing is a retail construct for humans checking out; partner margin is a wholesale construct for machines. They must not be conflated — a partner's tier does not move their feed price.

---

## 6. Data model additions

Full field detail lands in [`DATA-MODEL.md`](DATA-MODEL.md); this is the shape.

| Table | Purpose |
|---|---|
| `partner_api_keys` | `account_id`, `key_id` (public), `secret_hash` (Argon2 — plaintext shown exactly once at creation), `scopes`, `last_used_at`, `expires_at`, `revoked_at`. |
| `partner_feed_subscriptions` | `account_id`, `endpoint_url`, `signing_secret`, `status` (`active`/`paused`/`degraded`), `last_sequence`, filter (brands / conditions / locations the partner subscribes to). |
| `partner_margin_rules` | `account_id` (null = platform default), `scope` (`global`/`product`/`variant`), `target_id`, `margin_bps`, `min_margin_cents`, `priority`, `effective_from`/`effective_to`. |
| `partner_inventory_projection` | Materialized `(account_id, variant_id)` → `available_qty`, `partner_price_cents`, `status`, `content_hash`, `last_emitted_sequence`. The `content_hash` is what makes no-op suppression cheap. |
| `partner_webhook_deliveries` | `subscription_id`, `event_id`, `sequence`, `payload`, `attempt`, `http_status`, `error`, `delivered_at`, `next_retry_at`. Full delivery forensics. |
| `inventory_locations` | `supplier_id` → `code` (`us-tx`), `label` (*Texas Inventory*). **The masking map.** Admin-only; the join key never leaves the server. |

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

> ⚠️ **Open item for the Client — legal, not technical.** Reselling upstream inventory under our own brand, with supplier identity masked, has to be permitted by the agreements with Assurant and Mannapov LLC (resale rights, white-label / no-attribution clauses, price-display restrictions, data-redistribution terms). The Platform enforces the masking; it cannot make it lawful. This needs confirming against each supplier contract before the feed is exposed to a real partner. See [`../contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md`](../contract/SOFTWARE_DEVELOPMENT_AGREEMENT.md) §1.4 / Schedule A.2.

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
| Two suppliers report the same SKU with different costs | Ambiguous partner price | Lowest active cost wins; discrepancy already routed to `inventory-triage-agent` (see [`SYSTEM-OVERVIEW.md`](SYSTEM-OVERVIEW.md) §3.2) |
| Concurrent order paid + supplier sync | Lost update on `available_qty` | Projection recomputed inside the same transaction as the movement, `pg_advisory_lock` per `variant_id`; the projection is derived, never incremented in place |
| Margin rule deleted while feed is live | Variant silently vanishes from the feed | Deletion is soft + blocked when it would orphan an active subscription; admin must set a replacement first |
| Partner replays an old captured payload | Stale state applied | `sequence` monotonicity + 5-min signature timestamp window; documented as the partner's obligation |
| Overselling across partners | Same units promised twice | Availability is published **net of reservations**; a shared pool means partners see the same declining number — an optional per-partner `allocation_cap` is available where a hard reserve is commercially agreed |

---

## 10. Out of scope (v1)

- Partners **placing** orders through the API (feed is read-only; ordering stays on the portal). Natural v2.
- Per-partner currency conversion — USD only, matching Schedule A.3.
- GraphQL / gRPC surfaces.
- Partner-facing self-service key management UI (admin issues keys in v1).
- Hard stock reservation per partner (`allocation_cap` is designed for but not shipped).

---

## 11. Related docs

- [`SYSTEM-OVERVIEW.md`](SYSTEM-OVERVIEW.md) — where this context sits in the whole.
- [`DATA-MODEL.md`](DATA-MODEL.md) — table definitions.
- [`PRICING-ENGINE.md`](PRICING-ENGINE.md) — retail tier pricing, deliberately separate from partner margin.
- [`AUTH-AND-RLS.md`](AUTH-AND-RLS.md) — the M2M identity.
- [`../security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) — partner-surface threats.
- [`../security/DATA-CLASSIFICATION.md`](../security/DATA-CLASSIFICATION.md) — what a partner may and may not observe.
- [`../integrations/SUPPLIER-SOURCE-2.md`](../integrations/SUPPLIER-SOURCE-2.md) — the inbound feed this projects from.
