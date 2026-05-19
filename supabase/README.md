# supabase/

The database & edge-function layer of the Platform. Single Supabase project per environment (`local`, `staging`, `production`).

## Layout

```
supabase/
├── config.toml                    Supabase CLI config (project ref, edge function flags)
├── migrations/
│   ├── 0001_initial_schema.sql    Enums, identity, accounts, tiers, catalog, suppliers, sales skeleton
│   ├── 0002_rls_policies.sql      RLS enabled on every table; policies per role
│   ├── 0003_pricing_tiers.sql     price_rules, prices, materialization function
│   ├── 0004_supplier_sync.sql     inventory_snapshots, supplier_sync_runs, advisory-lock helpers
│   └── 0005_audit_log.sql         audit_log, ai_actions, BRIN index
├── functions/
│   ├── pricing-engine/            Tier-aware cart pricing (deterministic)
│   ├── tier-upgrade/              Cumulative-units lifecycle
│   └── stripe-webhook/            Idempotent webhook handler
├── seed.sql                       Tier definitions + supplier rows
└── README.md
```

## Local dev

```bash
supabase start                # boots local Postgres + Auth + Storage + Studio
supabase db reset             # applies migrations + seed
supabase functions serve      # serves edge functions locally
```

## Applying to remote

> **Non-destructive by default.** Any migration containing `DROP`, `TRUNCATE`, or a destructive `ALTER` requires explicit Client confirmation per developer standard §2.

```bash
supabase link --project-ref <ref>
supabase db push                            # apply migrations
supabase functions deploy pricing-engine    # one function
supabase functions deploy --all             # all
```

## Cross-reference

- [`../docs/architecture/DATA-MODEL.md`](../docs/architecture/DATA-MODEL.md) — entity reference.
- [`../docs/architecture/AUTH-AND-RLS.md`](../docs/architecture/AUTH-AND-RLS.md) — policy outline per table.
- [`../docs/architecture/PRICING-ENGINE.md`](../docs/architecture/PRICING-ENGINE.md) — the contract for `pricing-engine/`.
