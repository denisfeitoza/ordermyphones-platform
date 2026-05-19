# @ordermyphones/shared-types

Single source of truth for the domain types crossing process boundaries: storefront ↔ Supabase functions ↔ AI service ↔ supplier adapters. All money is **integer cents**, all currency is `USD` at launch (Schedule A.3 of the Agreement).

## Modules

- [`pricing.ts`](src/pricing.ts) — `PricingTier`, `PricingEngineInput`, `PricingEngineOutput`. Mirrors the contract in [`docs/architecture/PRICING-ENGINE.md`](../../docs/architecture/PRICING-ENGINE.md).
- [`catalog.ts`](src/catalog.ts) — `Product`, `ProductVariant`, `Condition`.
- [`supplier.ts`](src/supplier.ts) — `SupplierCode`, `InventorySnapshot`, `SupplierSyncRun`.
- [`order.ts`](src/order.ts) — `OrderStatus`, `OrderItem`, `Order`.

## Usage

```ts
import type { PricingEngineInput, PricingEngineOutput } from '@shared/pricing';
```

The TS path alias `@shared/*` is configured in [`apps/web/tsconfig.json`](../../apps/web/tsconfig.json) and in the AI service's `tsconfig.json`.
