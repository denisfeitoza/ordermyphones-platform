# Agents Roster (v1)

> Every agent declared with: role, when it fires, which tools it can call, what it must never do, and what it produces.

## 1. `pricing-agent`

**Role.** Propose tier-aware quotes and time-bound promotions that respect business invariants. Useful for B2B RFQs where a customer is close to a tier boundary or for win-back offers.

**When it fires.**
- Admin clicks "Suggest a quote" on an account.
- Admin replies to an RFQ ticket and asks for an AI-assisted draft.

**Tools (MCP scoped, read-only on the Platform unless noted).**
- `read_account(account_id)` → stored tier, cumulative units, recent order list.
- `read_variant(variant_id)` → variant + parent product + current materialized prices per tier.
- `read_inventory(variant_id)` → latest snapshot per supplier.
- `read_pricing_floors(variant_id)` → admin-defined margin floor per product (returns `false` if missing).
- `propose_action(kind='price_rule' | 'promo_quote', args, rationale, rollback_metadata)` → writes to `ai_actions`.

**Forbidden.**
- Proposing a price below the configured margin floor.
- Setting `effective_to` more than 60 days in the future on a `price_rule` proposal.
- Touching prices for variants outside the request scope.

**Output.**
- A structured proposal with `action.kind`, `action.args` (variant_id, tier_id, value), the predicted impact on the cart (`before/after`), and a one-paragraph rationale.

## 2. `inventory-triage-agent`

**Role.** Consolidate supplier discrepancies and flag SKUs at risk (low stock, price inconsistency across feeds, recurring sync failures).

**When it fires.**
- Nightly sweep over `supplier_sync_runs` and `inventory_snapshots`.
- Admin manually triggers from the Inventory dashboard.

**Tools.**
- `read_supplier_runs(window)` → last 24h sync results.
- `read_inventory_diff(variant_id)` → per-supplier snapshot diff with current `prices`.
- `read_order_velocity(variant_id, window)` → unit count over the window.
- `propose_action(kind='inventory_adjustment' | 'admin_note', args, rationale, rollback_metadata)`.

**Forbidden.**
- Editing `inventory_snapshots` directly.
- Recommending a supplier-switch decision; it can propose data, but the **routing** decision still belongs to the routing layer.

**Output.**
- A ranked list of SKUs (top N) with a recommended next step per SKU (re-order, re-price, pause, contact supplier).

## 3. `tier-classifier-agent`

**Role.** Explain tier transitions to the admin and the customer; propose **manual** tier overrides in unusual cases (long-standing client whose volume momentarily dipped; net-new VIP onboarding).

**When it fires.**
- After every paid order (informational; rarely produces a proposal).
- Admin "Recommend a tier review" on an account.
- Nightly sweep on accounts flagged by `inventory-triage-agent` (e.g. a customer who has been buying the same SKU for months but is one unit short of promotion).

**Tools.**
- `read_account_full(account_id)` → account + tier history + 12-month order set.
- `read_tier_thresholds()` → current `tiers` table.
- `propose_action(kind='tier_override', args, rationale, rollback_metadata)`.

**Forbidden.**
- Overriding a tier downward without explicit Client-rule justification.
- Touching the tier of an account flagged for fraud review.

**Output.**
- An explanation paragraph + optional override proposal with an expiry date.

## 4. `customer-support-agent`

**Role.** Draft replies on tickets, never send them. Helps the admin clear the inbox faster while keeping the human in the loop.

**When it fires.**
- A new `tickets` row is created.
- An existing ticket receives a new customer message.
- Admin clicks "Draft a reply".

**Tools.**
- `read_ticket(ticket_id)` → ticket + last N messages (PII-redacted).
- `read_account(account_id)` → account snapshot (PII-redacted for the model).
- `read_order(order_id)` → if the ticket references one.
- `draft_message(ticket_id, body)` → inserts a `ticket_messages` row with `author_kind='ai_draft'`; **does not** send.

**Forbidden.**
- Sending messages directly (`author_kind` must be `'ai_draft'`).
- Promising refunds, exchanges, or discounts that the Platform has not yet been authorized to issue. Drafts that contain a financial commitment are tagged for admin review.

**Output.**
- A draft reply + a "tone" tag (apologetic, informational, escalation) + a list of internal facts the draft relies on, so the admin can verify before sending.

## 5. Cross-cutting prompt scaffolding

All agents share the same scaffolding (per [`ORCHESTRATOR.md` §5](ORCHESTRATOR.md)):

```
[ system — cached ]
  - You are <agent_code>. Your goal is <one-sentence role>.
  - You MUST propose actions via `propose_action`. You MUST NOT mutate any state directly.
  - You MUST validate inputs against the supplied invariants before proposing.
  - You MUST cite the tool call IDs you used to reach your proposal in your rationale.
  - You MUST refuse any request that exceeds your scope.

[ context — request-specific ]
  - Account snapshot (redacted)
  - Tier thresholds
  - Pricing floors
  - Recent sync state (for inventory)
  - Ticket history (for support)

[ tools ]
  ...
```

## 6. Per-agent budgets (v1 defaults)

| Agent | Max tool calls per request | Daily cap | Cost cap per request |
|---|---|---|---|
| `pricing-agent` | 8 | 1,000 invocations | USD 0.20 |
| `inventory-triage-agent` | 12 | 200 invocations | USD 0.50 |
| `tier-classifier-agent` | 6 | 500 invocations | USD 0.15 |
| `customer-support-agent` | 8 | 2,000 invocations | USD 0.10 |

Hardcoded caps are env-driven; production values are tuned in Phase 4.

## 7. References

- [`AGENT-SWARM-OVERVIEW.md`](AGENT-SWARM-OVERVIEW.md)
- [`ORCHESTRATOR.md`](ORCHESTRATOR.md)
- [`EVAL-AND-GUARDRAILS.md`](EVAL-AND-GUARDRAILS.md)
- Source: [`services/ai-api/src/agents/`](../../services/ai-api/src/agents/)
