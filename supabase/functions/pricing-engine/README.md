# pricing-engine

Tier-aware cart pricing. Deterministic. Integer cents end-to-end. See [`docs/architecture/PRICING-ENGINE.md`](../../../docs/architecture/PRICING-ENGINE.md) for the contract.

Invoked from the storefront via Supabase RPC (`supabase.functions.invoke('pricing-engine', { body })`).

```bash
# Local
supabase functions serve pricing-engine --no-verify-jwt
# Deploy
supabase functions deploy pricing-engine
```
