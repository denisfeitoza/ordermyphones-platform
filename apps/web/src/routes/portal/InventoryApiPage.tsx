import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Copy, Eye, EyeOff, Lock, Pause, Play, RefreshCw, Webhook } from 'lucide-react';
import type { PricingTierCode } from '@shared/pricing';
import { useAccount, useTier } from '@/store';
import { PageHeading, Panel } from '@/components/portal/parts';
import { TierBadge } from '@/components/store/TierBadge';
import { Button, buttonVariants } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatInt, formatUsd } from '@/lib/format';
import { tierSoft } from '@/lib/tierStyles';
import { cn } from '@/lib/utils';
import {
  API_BASE,
  CODE_SAMPLES,
  buildFeed,
  causeLabel,
  hasApiAccess,
  nextEvent,
  pullResponse,
  webhookPayload,
  type FeedEvent,
  type FeedRow,
} from '@/data/inventoryApi';

const KEY_ID = 'omp_live_k1d8Fq2P';
// Demo placeholder. Deliberately NOT shaped like any vendor's real key format
// (`sk_live_…` is Stripe's and trips secret scanners even when the value is fake).
const SECRET = 'omp_sec_demo_4f8c2ae91b7d6053e1a9';
const ENDPOINT = 'https://api.downtownmobile.example/hooks/omp';
const MAX_EVENTS = 7;

/* ------------------------------------------------------------------ */
/* Small parts                                                         */
/* ------------------------------------------------------------------ */

/**
 * Copy control. The label swaps behind a blur so the two states blend into one
 * transformation instead of reading as two words trading places.
 */
function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function copy() {
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className="relative inline-flex h-9 min-w-[92px] items-center justify-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium transition-transform duration-150 ease-spring active:scale-[0.97] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 transition-[opacity,filter] duration-200 ease-out',
          copied && 'opacity-0 blur-[3px]',
        )}
      >
        <Copy className="h-3.5 w-3.5" strokeWidth={2} />
        {label}
      </span>
      <span
        className={cn(
          'absolute inset-0 inline-flex items-center justify-center gap-1.5 text-success transition-[opacity,filter] duration-200 ease-out',
          copied ? 'opacity-100 blur-0' : 'opacity-0 blur-[3px]',
        )}
        aria-hidden={!copied}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        Copied
      </span>
    </button>
  );
}

/** Credential row. The secret is masked with a real blur, not asterisks. */
function Credential({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);

  return (
    <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-1 truncate font-mono text-sm transition-[filter] duration-200 ease-out',
            !shown && 'select-none blur-[5px]',
          )}
        >
          {value}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {secret && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? 'Hide secret' : 'Reveal secret'}
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background transition-transform duration-150 ease-spring active:scale-[0.97] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {shown ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
          </button>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}

/**
 * One streamed event. Enters from a small offset — never from scale(0).
 *
 * The entrance is a CSS animation, not a JS-triggered transition: a row arriving
 * while the tab is backgrounded would never get its rAF callback and would stay
 * invisible forever. `animate-feed-in` carries `fill-mode: both`, so the row is
 * always left in its final state whether or not the animation ever got to run.
 */
function EventRow({ event, isNewest }: { event: FeedEvent; isNewest: boolean }) {
  const up = event.delta > 0;
  const isPrice = event.cause === 'price';

  return (
    <li
      className={cn(
        'flex animate-feed-in items-center gap-3 px-4 py-3',
        isNewest && 'bg-brand/[0.04]',
      )}
    >
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-[0.7rem] font-semibold tabular-nums',
          isPrice ? 'bg-secondary text-secondary-foreground' : up ? 'bg-success/12 text-success' : 'bg-warning/15 text-warning',
        )}
      >
        {isPrice ? '$' : up ? `+${event.delta}` : event.delta}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{event.row.model}</p>
        <p className="truncate text-xs text-muted-foreground">
          {causeLabel(event.cause)} · {event.row.location.label}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums">{formatInt(event.row.availableQty)}</p>
        <p className="font-mono text-[0.7rem] text-muted-foreground tabular-nums">{formatUsd(event.row.priceCents)}</p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Locked state (Tier 1–2)                                             */
/* ------------------------------------------------------------------ */

function LockedState() {
  const { tier } = useTier();

  return (
    <div className="space-y-6">
      <PageHeading title="Inventory API" subtitle="Stream our live stock straight into your own system." />

      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary">
          <Lock className="h-5 w-5 text-muted-foreground" strokeWidth={2} />
        </span>
        <h2 className="mt-4 font-display text-lg font-semibold tracking-tight">Available on Multi-Store and Wholesale</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Your account is on <TierBadge tier={tier} />. API access is included from Multi-Store upward — you get a live feed
          of every device we hold, priced at your account rate, pushed to your system on every stock movement.
        </p>

        <ul className="mt-5 space-y-2.5 text-sm">
          {[
            'Webhook push on every confirmed order and inventory change',
            'Pull endpoint for daily reconciliation',
            'Your account pricing, per SKU, per inventory location',
          ].map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-foreground text-background">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              {b}
            </li>
          ))}
        </ul>

        <Link to="/contact" className={cn(buttonVariants({ variant: 'primary', size: 'md' }), 'mt-6')}>
          Talk to your account manager
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

interface FeedState {
  rows: FeedRow[];
  events: FeedEvent[];
  sequence: number;
  /** Movements that changed nothing partner-visible and were therefore not sent. */
  suppressed: number;
}

function initialFeed(code: PricingTierCode): FeedState {
  return { rows: buildFeed(code), events: [], sequence: 918_270, suppressed: 0 };
}

export default function InventoryApiPage() {
  const { tier, code } = useTier();
  const { businessName } = useAccount();

  const [feed, setFeed] = useState<FeedState>(() => initialFeed(code));
  const [live, setLive] = useState(true);
  const [tab, setTab] = useState<keyof typeof CODE_SAMPLES>('curl');
  const { rows, events } = feed;

  // Rebuild the feed if the account tier changes — prices are tier-derived.
  useEffect(() => {
    setFeed(initialFeed(code));
  }, [code]);

  /**
   * One pure state transition per tick — rows, events and sequence move
   * together or not at all. Keeping this free of side effects is what makes it
   * safe under StrictMode's double-invocation and correct if React replays it.
   */
  const emit = useCallback(() => {
    setFeed((s) => {
      const result = nextEvent(s.rows, s.sequence);
      // No partner-visible change → nothing is emitted. Same rule as production.
      if (!result) return { ...s, suppressed: s.suppressed + 1 };
      return {
        rows: result.rows,
        events: [result.event, ...s.events].slice(0, MAX_EVENTS),
        sequence: result.event.sequence,
        suppressed: s.suppressed,
      };
    });
  }, []);

  // Seed a few events so the panel is never empty on first paint.
  useEffect(() => {
    emit();
    const t = window.setTimeout(emit, 90);
    return () => window.clearTimeout(t);
  }, [emit]);

  // Stream. Pauses when the tab is hidden — a background tab should not burn
  // frames or fill the log with events nobody watched arrive.
  useEffect(() => {
    if (!live) return;
    let id = window.setInterval(emit, 2600);
    function onVisibility() {
      window.clearInterval(id);
      if (!document.hidden) id = window.setInterval(emit, 2600);
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [live, emit]);

  const totals = useMemo(
    () => ({
      skus: new Set(rows.map((r) => r.sku)).size,
      units: rows.reduce((s, r) => s + r.availableQty, 0),
    }),
    [rows],
  );

  if (!hasApiAccess(code)) return <LockedState />;

  const sample = CODE_SAMPLES[tab];

  return (
    <div className="space-y-6">
      <PageHeading
        title="Inventory API"
        subtitle="Our live stock, at your pricing, pushed to your system on every movement."
        action={
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', tierSoft[tier.tone])}>
            {tier.label} access
          </span>
        }
      />

      {/* Status strip */}
      <div className="grid grid-cols-2 divide-x divide-border rounded-2xl border border-border bg-card sm:grid-cols-4">
        {[
          { label: 'Subscription', value: 'Active', mono: false },
          { label: 'SKUs in feed', value: formatInt(totals.skus), mono: true },
          { label: 'Units available', value: formatInt(totals.units), mono: true },
          { label: 'Last sequence', value: `#${formatInt(feed.sequence)}`, mono: true },
        ].map((s, i) => (
          <div key={s.label} className={cn('px-4 py-3', i >= 2 && 'border-t border-border sm:border-t-0')}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn('mt-1 text-sm font-semibold', s.mono && 'font-mono tabular-nums')}>
              {s.label === 'Subscription' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="relative grid h-2 w-2 place-items-center">
                    <span className="absolute h-2 w-2 rounded-full bg-success/40 motion-safe:animate-ring-pulse" />
                    <span className="h-2 w-2 rounded-full bg-success" />
                  </span>
                  {s.value}
                </span>
              ) : (
                s.value
              )}
            </p>
          </div>
        ))}
      </div>

      {/* Live feed */}
      <Panel
        title="Live feed"
        action={
          <button
            type="button"
            onClick={() => setLive((l) => !l)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium transition-transform duration-150 ease-spring active:scale-[0.97] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {live ? <Pause className="h-3.5 w-3.5" strokeWidth={2} /> : <Play className="h-3.5 w-3.5" strokeWidth={2} />}
            {live ? 'Pause' : 'Resume'}
          </button>
        }
        className="overflow-hidden"
      >
        <p className="-mt-1 mb-3 text-sm text-muted-foreground">
          Every row below is one <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">inventory.updated</code>{' '}
          webhook we POST to your endpoint. A movement that leaves your view unchanged is never sent.
        </p>

        <ul className="-mx-5 divide-y divide-border border-y border-border">
          {events.map((e, i) => (
            <EventRow key={e.id} event={e} isNewest={i === 0} />
          ))}
        </ul>

        <p className="mt-3 text-xs text-muted-foreground">
          Delivered at-least-once · deduplicate on{' '}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono">event_id</code> · order by{' '}
          <code className="rounded bg-secondary px-1 py-0.5 font-mono">sequence</code>
        </p>
      </Panel>

      {/* Latest payload */}
      {events[0] && (
        <Panel title="Latest payload" action={<CopyButton value={webhookPayload(events[0])} />}>
          <pre className="scrollbar-hide -mx-1 overflow-x-auto rounded-xl bg-foreground p-4 font-mono text-[0.72rem] leading-relaxed text-background/90">
            <code>{webhookPayload(events[0])}</code>
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            Signed with <code className="rounded bg-secondary px-1 py-0.5 font-mono">X-OMP-Signature</code> (HMAC-SHA256).
            Verify before parsing; reject anything older than 5 minutes.
          </p>
        </Panel>
      )}

      {/* Credentials */}
      <Panel
        title="Credentials"
        action={
          <Button variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            Rotate
          </Button>
        }
      >
        <div className="divide-y divide-border">
          <Credential label="Key ID" value={KEY_ID} />
          <Credential label="Secret" value={SECRET} secret />
        </div>
        <p className="mt-4 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          Rotation issues a new secret while the current one keeps working for 7 days, so you can roll without downtime.
          This key reads inventory only — it cannot place orders or read your account data.
        </p>
      </Panel>

      {/* Webhook endpoint */}
      <Panel title="Webhook endpoint">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary">
            <Webhook className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm">{ENDPOINT}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {businessName} · <Badge tone="success">Healthy</Badge> <span className="ml-1">last delivery 2xx · 340 ms</span>
            </p>
          </div>
          <Button variant="outline" size="sm" className="sm:shrink-0">
            Edit
          </Button>
        </div>
      </Panel>

      {/* Endpoints + code */}
      <Panel
        title="Integrate"
        action={
          <div className="flex gap-1 rounded-full bg-secondary p-1">
            {(Object.keys(CODE_SAMPLES) as (keyof typeof CODE_SAMPLES)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                  tab === k ? 'bg-background text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {CODE_SAMPLES[k].label}
              </button>
            ))}
          </div>
        }
      >
        <pre className="scrollbar-hide -mx-1 overflow-x-auto rounded-xl bg-foreground p-4 font-mono text-[0.72rem] leading-relaxed text-background/90">
          <code>{sample.code}</code>
        </pre>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CopyButton value={sample.code} label="Copy code" />
          <Link to="/help" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Full API reference
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
      </Panel>

      {/* Pull response */}
      <Panel title={`GET ${API_BASE}/inventory`} action={<CopyButton value={pullResponse(rows)} />}>
        <pre className="scrollbar-hide -mx-1 overflow-x-auto rounded-xl bg-foreground p-4 font-mono text-[0.72rem] leading-relaxed text-background/90">
          <code>{pullResponse(rows)}</code>
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">
          Cursor-paginated, one row per SKU <em>per location</em> — quantities are never summed across inventories. Run a
          full pull daily so a missed webhook can never drift you into overselling.
        </p>
      </Panel>
    </div>
  );
}
