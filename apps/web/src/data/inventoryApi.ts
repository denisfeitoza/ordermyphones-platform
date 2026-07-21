import { CATALOG, unitPriceCents } from './catalog';
import type { PricingTierCode } from '@shared/pricing';

/**
 * Mock data for the customer-facing Inventory API demo (portal → API).
 * Contract: docs/architecture/PARTNER-INVENTORY-API.md.
 *
 * Everything here is what a PARTNER may observe. Supplier identity and our unit
 * cost are deliberately absent — the demo is built from the same allow-list as
 * the real serializer, so a leak here would be a leak in production.
 */

/** Masked OMP inventory locations. Upstream suppliers/warehouses are never named. */
export interface FeedLocation {
  code: string;
  label: string;
}

export const FEED_LOCATIONS: readonly FeedLocation[] = [
  { code: 'us-tx', label: 'Texas Inventory' },
  { code: 'us-tn', label: 'Tennessee Inventory' },
] as const;

/** Tiers that get programmatic feed access. */
export const API_TIERS: readonly PricingTierCode[] = ['tier_3', 'tier_4'] as const;

export function hasApiAccess(code: PricingTierCode): boolean {
  return API_TIERS.includes(code);
}

export interface FeedRow {
  sku: string;
  brand: string;
  model: string;
  color: string;
  storageGb: number;
  condition: string;
  availableQty: number;
  priceCents: number;
  location: FeedLocation;
  status: 'available' | 'out_of_stock';
}

const slug = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');

/**
 * Build the partner-visible feed from the catalog at the account's tier.
 * `priceCents` is OUR sell price to this partner — never a supplier cost.
 */
export function buildFeed(tier: PricingTierCode): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const item of CATALOG.slice(0, 8)) {
    const color = item.colors[0];
    const storageGb = item.storage[0];
    // One row per location — quantities are never summed across locations.
    item.stock.forEach((s, i) => {
      const location = FEED_LOCATIONS[i % FEED_LOCATIONS.length];
      rows.push({
        sku: `${slug(item.brand)}-${slug(item.model)}-${storageGb}-${slug(color.name)}`,
        brand: item.brand,
        model: item.model,
        color: color.name,
        storageGb,
        condition: item.condition,
        availableQty: s.availableQty,
        priceCents: unitPriceCents(item, tier),
        location,
        status: s.availableQty > 0 ? 'available' : 'out_of_stock',
      });
    });
  }
  return rows;
}

export interface FeedEvent {
  id: string;
  sequence: number;
  emittedAt: Date;
  row: FeedRow;
  /** Signed delta on availableQty that produced this event. */
  delta: number;
  cause: 'order' | 'restock' | 'price';
}

const CAUSE_LABEL: Record<FeedEvent['cause'], string> = {
  order: 'Order confirmed',
  restock: 'Inventory updated',
  price: 'Price updated',
};

export function causeLabel(c: FeedEvent['cause']): string {
  return CAUSE_LABEL[c];
}

/**
 * Produce the next event from the current feed state.
 *
 * Mirrors the real emitter: the feed is STATE-based, so an event only exists
 * when the partner-visible projection actually changed. A no-op returns null and
 * nothing is emitted — that is the content-hash suppression rule, in miniature.
 */
export function nextEvent(rows: FeedRow[], sequence: number, rand = Math.random): { event: FeedEvent; rows: FeedRow[] } | null {
  if (rows.length === 0) return null;
  const idx = Math.floor(rand() * rows.length);
  const target = rows[idx];

  const roll = rand();
  let delta = 0;
  let cause: FeedEvent['cause'] = 'order';
  let priceCents = target.priceCents;

  if (roll < 0.62) {
    // An order consumed units at this location.
    cause = 'order';
    delta = -Math.min(target.availableQty, 1 + Math.floor(rand() * 4));
  } else if (roll < 0.9) {
    cause = 'restock';
    delta = 1 + Math.floor(rand() * 12);
  } else {
    cause = 'price';
    // ±2% move, integer cents, never below 1 cent.
    const move = Math.round(target.priceCents * (rand() < 0.5 ? -0.02 : 0.02));
    priceCents = Math.max(1, target.priceCents + move);
  }

  const availableQty = Math.max(0, target.availableQty + delta);

  // No-op suppression: nothing partner-visible changed → no event.
  if (availableQty === target.availableQty && priceCents === target.priceCents) return null;

  const updated: FeedRow = {
    ...target,
    availableQty,
    priceCents,
    status: availableQty > 0 ? 'available' : 'out_of_stock',
  };

  const next = rows.slice();
  next[idx] = updated;

  return {
    event: {
      id: `evt_${(sequence + 1).toString(36).padStart(8, '0')}`,
      sequence: sequence + 1,
      emittedAt: new Date(),
      row: updated,
      delta: availableQty - target.availableQty,
      cause,
    },
    rows: next,
  };
}

/** The webhook body we POST to the partner. Exactly the allow-listed fields. */
export function webhookPayload(e: FeedEvent): string {
  return JSON.stringify(
    {
      event: 'inventory.updated',
      event_id: e.id,
      sequence: e.sequence,
      emitted_at: e.emittedAt.toISOString(),
      data: {
        sku: e.row.sku,
        brand: e.row.brand,
        model: e.row.model,
        color: e.row.color,
        storage_gb: e.row.storageGb,
        condition: e.row.condition,
        available_qty: e.row.availableQty,
        price_cents: e.row.priceCents,
        currency: 'USD',
        location: { code: e.row.location.code, label: e.row.location.label },
        status: e.row.status,
        as_of: e.emittedAt.toISOString(),
      },
    },
    null,
    2,
  );
}

export function pullResponse(rows: FeedRow[]): string {
  return JSON.stringify(
    {
      object: 'list',
      has_more: true,
      next_cursor: 'cur_8fJ2kQ',
      data: rows.slice(0, 2).map((r) => ({
        sku: r.sku,
        brand: r.brand,
        model: r.model,
        color: r.color,
        storage_gb: r.storageGb,
        condition: r.condition,
        available_qty: r.availableQty,
        price_cents: r.priceCents,
        currency: 'USD',
        location: { code: r.location.code, label: r.location.label },
        status: r.status,
      })),
    },
    null,
    2,
  );
}

export const API_BASE = 'https://api.ordermyphones.com/v1';

export const CODE_SAMPLES: Record<'curl' | 'node' | 'verify', { label: string; lang: string; code: string }> = {
  curl: {
    label: 'Pull',
    lang: 'bash',
    code: `curl -s "${API_BASE}/inventory?updated_since=2026-07-21T00:00:00Z&limit=500" \\
  -H "Authorization: Bearer $OMP_KEY_ID.$OMP_SECRET"`,
  },
  node: {
    label: 'Sync loop',
    lang: 'javascript',
    code: `// Reconcile daily — webhooks can be missed, a pull never drifts.
const res = await fetch(
  \`${API_BASE}/inventory?updated_since=\${lastSync.toISOString()}\`,
  { headers: { Authorization: \`Bearer \${process.env.OMP_KEY}\` } },
);
const { data } = await res.json();

for (const row of data) {
  // Key on (sku, location) — the same SKU lives in several inventories.
  await db.stock.upsert({
    where: { sku_location: { sku: row.sku, location: row.location.code } },
    update: { qty: row.available_qty, priceCents: row.price_cents },
    create: { sku: row.sku, location: row.location.code, qty: row.available_qty, priceCents: row.price_cents },
  });
}`,
  },
  verify: {
    label: 'Verify webhook',
    lang: 'javascript',
    code: `import { createHmac, timingSafeEqual } from 'node:crypto';

// Verify BEFORE parsing. Reject anything older than 5 minutes.
export function verify(rawBody, header, secret) {
  const [t, v1] = header.split(',').map((p) => p.split('=')[1]);
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

// Then: dedupe on event_id, and drop any event whose sequence is
// lower than the highest already applied for that (sku, location).`,
  },
};
