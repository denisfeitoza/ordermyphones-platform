# Stripe — Payments Integration

> Stripe is the primary payment gateway (Agreement §1.9, §A.2). The account is opened in the **Client's** legal name (Agreement §2.7). The architecture leaves room for additional gateways without rewrites.

## 1. Account ownership

- **Merchant account:** Order My Phones LLC (the Client). The Developer never holds funds, never receives payouts.
- **API keys:** restricted keys per environment. The developer scope is read-only on `customers` and `payment_intents` for support; full access is held by the Client.
- **Webhook signing secret:** stored only in Supabase secrets and the VPS env. Rotated yearly.

## 2. Money flow

```
Customer ── card ──▶ Stripe Checkout (Stripe-hosted)
                    │
                    │ success
                    ▼
              checkout.session.completed
                    │
                    ▼
           supabase/functions/stripe-webhook
                    │
                    ▼
   Postgres: orders.status = 'paid'
             payments row written
             tier-upgrade triggered
             fulfillment dispatched (per order_items.supplier_id)
```

Payouts go directly from Stripe to the Client's bank — outside the Platform's path.

## 3. PCI scope

- We use **Stripe Checkout** (hosted page) and Stripe Elements where embedding is needed. The Platform never sees raw card data; PCI scope stays SAQ-A.
- All requests to Stripe APIs go through the server (edge functions and the AI service). The browser never sees a secret key.
- Customer-facing UI uses the **publishable** key, scoped to the production domain.

## 4. Implementation contract

### 4.1 Creating a checkout session

`POST /api/checkout/session` (Supabase edge function or framework-level server action) given the cart receipt:

- Validates the cart server-side via the pricing engine ([`PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md)).
- Creates a `draft` order with line items and a derived total.
- Calls `stripe.checkout.sessions.create({...})` with `client_reference_id = orders.id`, `metadata = { account_id, customer_id, tier_id_at_order }`, idempotency key `orders.id`.
- Returns the session URL to the storefront.

### 4.2 Webhook handling

[`supabase/functions/stripe-webhook/`](../../supabase/functions/stripe-webhook/) handles:

| Event | Action |
|---|---|
| `checkout.session.completed` | Transition `orders` to `paid`; insert `payments`; enqueue `tier-upgrade`; enqueue fulfillment per `order_items.supplier_id`. |
| `payment_intent.succeeded` | Cross-check `payments.status = 'succeeded'`; no double-count. |
| `payment_intent.payment_failed` | Mark order `pending_payment` with diagnostic; surface to admin. |
| `charge.refunded` | Insert refund record; transition `orders` to `refunded` or `partial_refund` depending on amount. |
| `charge.dispute.created` | Insert a `tickets` row; notify admin Slack. |

**All handlers are idempotent.** The function:

1. Verifies the signature using the webhook secret.
2. Looks up `stripe_event_id`; if seen, returns `200` without re-processing.
3. Otherwise, processes the event inside a single Postgres transaction.

### 4.3 Refunds

Triggered from the admin dashboard against an `orders.id`:

- Calls `stripe.refunds.create({ payment_intent, amount })` with idempotency key `refund:<order_id>:<attempt>`.
- The actual state transition happens on the `charge.refunded` webhook, not on the refund creation response — Stripe is the source of truth.
- Refunds within the rolling tier window can demote a customer; demotion respects the grace period from [`PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md) §5.

## 5. Tax handling (v1)

- Stripe Tax is **not enabled by default** at launch; the launch market is USD with no multi-region tax obligation built into the contract (Schedule A.3 keeps multi-currency / multi-language out of scope).
- Schema reserves `orders.tax_cents` for the day Stripe Tax is turned on. Turning it on is a small change (server-side flag), but the decision is the Client's at the maintenance stage.

## 6. Environments

| Env | Stripe mode | Publishable key prefix | Webhook endpoint |
|---|---|---|---|
| `local` | test | `pk_test_...` | `https://<ngrok>/functions/v1/stripe-webhook` via Stripe CLI |
| `staging` | test | `pk_test_...` | `https://staging.ordermyphones.com/functions/v1/stripe-webhook` |
| `production` | live | `pk_live_...` | `https://ordermyphones.com/functions/v1/stripe-webhook` |

Keys are stored in Supabase project secrets (server) and `.env.local` for the storefront publishable key (per environment).

## 7. Disputes and chargebacks

- A new dispute opens a `tickets` row owned by the account; admin sees it in the dashboard inbox.
- Evidence checklist (order history, IP, timestamps, shipment tracking) is provided in [`OBSERVABILITY.md`](../architecture/OBSERVABILITY.md).
- The Platform does not auto-respond to disputes; the Client decides the response per case.

## 8. Failure modes (handled)

| Failure | Behavior |
|---|---|
| Stripe API timeout on checkout session create | Server retries with the same idempotency key once; on second failure, returns a user-facing message and logs the event. |
| Webhook signature mismatch | Request rejected; event logged with a `signature_invalid` reason. |
| Webhook arrives before our DB has the `orders.id` | Webhook handler reads the `client_reference_id`; if the order is missing, it requeues with an exponential backoff and surfaces an alert after 5 minutes. |
| Duplicate webhook deliveries (Stripe retries) | Idempotency via `stripe_event_id` table; second delivery is a no-op. |
| Card declined post-session | `payment_intent.payment_failed` flows through; order stays in `pending_payment` with diagnostic. |
| Refund event with no `payments` row | Logged + alerted; admin reviews manually. |

## 9. Future gateways (architecture, not delivered in scope)

The gateway-agnostic layer keeps the order-to-payment boundary clean:

```
orders → PaymentSession (interface) → StripeSessionAdapter
                                    → AdyenSessionAdapter   (future)
                                    → MercadoPagoAdapter    (future)
```

Adding a gateway is a **change order** (Agreement §8). The DB schema does not need to change — `payments.raw_event` already absorbs provider-specific fields.

## 10. References

- [`../architecture/SYSTEM-OVERVIEW.md`](../architecture/SYSTEM-OVERVIEW.md) — data flow diagrams.
- [`../architecture/PRICING-ENGINE.md`](../architecture/PRICING-ENGINE.md) — pricing inputs to checkout.
- [`../architecture/OBSERVABILITY.md` §5.2](../architecture/OBSERVABILITY.md) — webhook backlog runbook.
- [`../security/THREAT-MODEL.md`](../security/THREAT-MODEL.md) — payment-specific threats.
