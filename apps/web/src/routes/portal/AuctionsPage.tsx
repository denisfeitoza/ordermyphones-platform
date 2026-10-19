import { useEffect, useMemo, useState } from 'react';
import { Gavel } from 'lucide-react';
import { useAuth } from '@/store';
import { PageHeading } from '@/components/portal/parts';
import { Button } from '@/components/ui/Button';
import { isOpen, useAuctionEvents, useAuctionLots, useMyStanding, usePlaceBid, type AuctionEvent, type AuctionLot } from '@/data/auctions';
import { useMyAccountSummary } from '@/data/accounts';
import { parseMoneyToCents } from '@/lib/money';
import { formatDateTime, formatInt, formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const BID_ERRORS: [string, string][] = [
  ['bid_must_increase', 'A new bid must be higher than your current bid — bids are binding.'],
  ['auction_closed', 'This auction is closed.'],
  ['deposit_required', 'A $2,500 deposit is needed before bidding.'],
  ['auction_tier_only', 'Auctions are for wholesale and distributor accounts.'],
  ['bad_bid', 'Enter an amount above zero.'],
];

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function timeLeft(iso: string, now: number, t: (s: string) => string): string {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return t('closed');
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 48 ? `${Math.floor(h / 24)} ${t('days left')}` : `${h}h ${m}m ${t('left')}`;
}

/**
 * Portal → Auctions (wholesale and distributor): open supplier auctions,
 * lot by lot. Bids are binding and sealed — you see your own bid and whether
 * it leads, never other buyers' amounts.
 */
export default function AuctionsPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const now = useNow();
  const events = useAuctionEvents();
  const account = useMyAccountSummary();
  const [selected, setSelected] = useState<string | null>(null);
  const eligible = profile?.tier === 'wholesale' || profile?.tier === 'distributor';
  const list = (events.data ?? []).filter((e) => e.status === 'open' || e.status === 'submitted');
  const current = list.find((e) => e.id === selected) ?? list.find((e) => isOpen(e, now)) ?? null;
  const needsDeposit = !!account.data && account.data.auctionDepositRequired && account.data.auctionDepositReceivedCents < 250_000;

  if (!eligible) {
    return (
      <div className="space-y-6">
        <PageHeading title="Auctions" subtitle="Bid on supplier lots before they close." />
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{t('Auctions are for wholesale and distributor accounts.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading title="Auctions" subtitle="Bid on supplier lots before they close." />
      <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        {t('Bids are binding: you can raise a bid, never withdraw it. You see your own bid and whether it leads.')}
      </p>
      {needsDeposit && (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
          {t('A $2,500 deposit by wire is needed before you can bid. Once our team records it, bidding opens.')}
        </p>
      )}
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{t('No auctions are open right now.')}</p>
      ) : (
        <>
          <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {list.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelected(e.id)}
                className={cn('min-h-11 shrink-0 rounded-2xl border px-4 py-2 text-left text-sm', current?.id === e.id ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted/50')}
              >
                <span className="block font-medium">{e.title}</span>
                <span className={cn('block text-xs', isOpen(e, now) ? 'text-success' : 'text-muted-foreground')}>{isOpen(e, now) ? timeLeft(e.closes_at, now, t) : t('closed')}</span>
              </button>
            ))}
          </div>
          {current && <EventLots event={current} now={now} canBid={!needsDeposit} lang={lang} />}
        </>
      )}
    </div>
  );
}

function EventLots({ event, now, canBid, lang }: { event: AuctionEvent; now: number; canBid: boolean; lang: 'en' | 'pt' | 'es' }) {
  const { t } = useI18n();
  const lots = useAuctionLots(event.id);
  const standing = useMyStanding(event.id);
  const [q, setQ] = useState('');
  const open = isOpen(event, now);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (lots.data ?? []).filter((l) => words.every((w) => `${l.lot_ref} ${l.title} ${l.grade ?? ''}`.toLowerCase().includes(w)));
  }, [lots.data, q]);

  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('Closes')} {formatDateTime(event.closes_at, lang)} · {formatInt(lots.data?.length ?? 0)} {t('lots')} · {event.price_basis === 'unit' ? t('bid per unit') : t('bid per lot')}
      </p>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search lots')} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-brand sm:text-sm" />
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {shown.slice(0, 300).map((l) => (
          <LotRow key={l.id} lot={l} eventId={event.id} open={open && canBid} mine={standing.data?.get(l.id)} unit={event.price_basis === 'unit'} />
        ))}
        {shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('No lots match.')}</li>}
      </ul>
    </section>
  );
}

function LotRow({ lot, eventId, open, mine, unit }: { lot: AuctionLot; eventId: string; open: boolean; mine: { myBidCents: number; leading: boolean } | undefined; unit: boolean }) {
  const { t } = useI18n();
  const bid = usePlaceBid(eventId);
  const [amount, setAmount] = useState('');
  const cents = parseMoneyToCents(amount);
  const err = bid.isError ? BID_ERRORS.find(([k]) => bid.error.message.includes(k))?.[1] ?? bid.error.message : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate text-sm font-medium">{lot.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{lot.lot_ref}</span>
          {lot.qty !== null ? ` · ${formatInt(lot.qty)} ${t('units')}` : ''}
          {lot.grade ? ` · ${lot.grade}` : ''}
        </p>
        {mine && (
          <p className={cn('mt-0.5 text-xs font-medium', mine.leading ? 'text-success' : 'text-warning')}>
            {t('Your bid')} {formatUsd(mine.myBidCents)}
            {unit ? ` ${t('per unit')}` : ''} · {mine.leading ? t('leading') : t('outbid')}
          </p>
        )}
        {err && <p className="mt-0.5 text-xs text-destructive">{t(err)}</p>}
      </div>
      {open && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (cents && cents > 0) bid.mutate({ lotId: lot.id, amountCents: cents }, { onSuccess: () => setAmount('') });
          }}
        >
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={unit ? t('$ per unit') : t('$ per lot')} aria-label={`${t('Bid for')} ${lot.lot_ref}`} className="h-11 w-28 rounded-xl border border-border bg-background px-3 text-right font-mono text-sm tabular-nums outline-none focus:border-brand" />
          <Button type="submit" size="sm" variant="brand" className="min-h-11 sm:min-h-0" disabled={bid.isPending || !cents || cents <= (mine?.myBidCents ?? 0)}>
            <Gavel className="h-4 w-4" strokeWidth={2} />
            {mine ? t('Raise') : t('Bid')}
          </Button>
        </form>
      )}
    </li>
  );
}
