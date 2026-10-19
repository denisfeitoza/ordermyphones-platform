import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Gavel, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AdminHeading, Panel } from '@/components/admin/parts';
import { Button } from '@/components/ui/Button';
import { AUCTION_SOURCES, isOpen, mapLotRows, useAuctionEvents, useAuctionLots, useAuctionResults, type AuctionEvent, type AuctionResult } from '@/data/auctions';
import { csvCell } from '@/lib/export';
import { adminErrorMessage } from '@/lib/adminErrors';
import { formatDateTime, formatInt, formatUsd } from '@/lib/format';
import { useAuth } from '@/store';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

const inputCls = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand';

/**
 * Admin → Auctions: one event per supplier list (Verizon, B-Stock, Sumitomo,
 * Rexi). Upload the lots from the supplier's spreadsheet, open it, watch the
 * highest bid per lot, then export the winners to submit to the auction house.
 */
export default function AuctionsPage() {
  const { t, lang } = useI18n();
  const events = useAuctionEvents();
  const [selected, setSelected] = useState<string | null>(null);
  const current = events.data?.find((e) => e.id === selected) ?? null;

  return (
    <div className="space-y-6">
      <AdminHeading title="Auctions" subtitle="Collect binding bids from wholesale and distributor buyers, then export the highest bid per lot." />
      <div className={cn('grid gap-6', current && 'lg:grid-cols-[22rem_1fr]', '[&>*]:min-w-0')}>
        <div className={cn('space-y-4', current && 'hidden lg:block')}>
          <NewEventPanel onCreated={setSelected} />
          <Panel title={t('Events')}>
            {events.data?.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {events.data.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => setSelected(e.id)} className={cn('flex min-h-11 w-full flex-col items-start px-3 py-2.5 text-left text-sm hover:bg-muted/40', selected === e.id && 'bg-muted/60')}>
                      <span className="font-medium">{e.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {AUCTION_SOURCES.find((s) => s.id === e.source)?.label} · {t(isOpen(e) ? 'Open now' : e.status === 'open' ? 'Closed' : e.status === 'draft' ? 'Draft' : e.status === 'submitted' ? 'Submitted' : 'Cancelled')} · {t('closes')} {formatDateTime(e.closes_at, lang)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('No auctions yet.')}</p>
            )}
          </Panel>
        </div>
        {current && <EventPanel event={current} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

function NewEventPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [source, setSource] = useState<AuctionEvent['source']>('verizon');
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [minutes, setMinutes] = useState('20');
  const [basis, setBasis] = useState<'unit' | 'lot'>('unit');
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('auction_events')
        .insert({ source, title: title.trim(), supplier_deadline: new Date(deadline).toISOString(), close_minutes_before: Number(minutes) || 0, price_basis: basis, created_by: user?.id ?? null })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      setTitle('');
      void qc.invalidateQueries({ queryKey: ['auction-events'] });
      onCreated(id);
    },
  });
  return (
    <Panel title={t('New auction')}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Source')}</span>
          <select value={source} onChange={(e) => setSource(e.target.value as AuctionEvent['source'])} className={inputCls}>
            {AUCTION_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Title')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Verizon 2026-10-20" maxLength={200} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Supplier deadline (your local time)')}</span>
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Close minutes before')}</span>
            <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('Bids are')}</span>
            <select value={basis} onChange={(e) => setBasis(e.target.value as 'unit' | 'lot')} className={inputCls}>
              <option value="unit">{t('per unit')}</option>
              <option value="lot">{t('per lot')}</option>
            </select>
          </label>
        </div>
        {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
        <Button variant="brand" className="w-full" disabled={create.isPending || !title.trim() || !deadline} onClick={() => create.mutate()}>
          <Gavel className="h-4 w-4" strokeWidth={2} />
          {t('Create auction')}
        </Button>
      </div>
    </Panel>
  );
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function winnersTable(event: AuctionEvent, rows: AuctionResult[]): (string | number)[][] {
  return [
    ['Lot', 'Description', 'Qty', 'Grade', event.price_basis === 'unit' ? 'Bid per unit (USD)' : 'Bid per lot (USD)', 'Lot total (USD)', 'Bidder', 'Bidder e-mail', 'Bid time (UTC)', 'Bids'],
    ...rows
      .filter((r) => r.amount_cents !== null)
      .map((r) => {
        const amt = (r.amount_cents ?? 0) / 100;
        const total = event.price_basis === 'unit' && r.qty ? amt * r.qty : amt;
        return [r.lot_ref, r.title, r.qty ?? '', r.grade ?? '', amt.toFixed(2), total.toFixed(2), r.account_name ?? '', r.account_email ?? '', r.bid_at ?? '', r.bid_count];
      }),
  ];
}

function EventPanel({ event, onClose }: { event: AuctionEvent; onClose: () => void }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const lots = useAuctionLots(event.id);
  const results = useAuctionResults(event.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      const mapped = mapLotRows(rows);
      if (mapped.length === 0) throw new Error('The sheet has no rows.');
      for (let i = 0; i < mapped.length; i += 500) {
        const { error } = await supabase.from('auction_lots').upsert(mapped.slice(i, i + 500).map((l) => ({ ...l, event_id: event.id })), { onConflict: 'event_id,lot_ref' });
        if (error) throw new Error(error.message);
      }
      return mapped.length;
    },
    onSuccess: (n) => {
      setNote(`${formatInt(n)} ${t('lots loaded')}`);
      void qc.invalidateQueries({ queryKey: ['auction-lots', event.id] });
      void qc.invalidateQueries({ queryKey: ['auction-results', event.id] });
    },
  });
  const setStatus = useMutation({
    mutationFn: async (status: AuctionEvent['status']) => {
      const { error } = await supabase.from('auction_events').update({ status }).eq('id', event.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['auction-events'] }),
  });

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(winnersTable(event, results.data ?? []));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Highest bids');
    download(`${event.title}-highest-bids.xlsx`, new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  function exportCsv() {
    download(`${event.title}-highest-bids.csv`, new Blob([winnersTable(event, results.data ?? []).map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
  }

  const open = isOpen(event);
  const withBids = (results.data ?? []).filter((r) => r.amount_cents !== null).length;

  return (
    <Panel
      title={event.title}
      action={
        <button type="button" onClick={onClose} className="min-h-11 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted lg:hidden">
          {t('Back')}
        </button>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-muted-foreground">{t('Supplier deadline')}</dt>
          <dd>{formatDateTime(event.supplier_deadline, lang)}</dd>
          <dt className="text-muted-foreground">{t('Portal closes')}</dt>
          <dd className={open ? 'text-success' : ''}>{formatDateTime(event.closes_at, lang)}</dd>
          <dt className="text-muted-foreground">{t('Lots')}</dt>
          <dd>{formatInt(lots.data?.length ?? 0)}</dd>
          <dt className="text-muted-foreground">{t('Lots with bids')}</dt>
          <dd>{formatInt(withBids)}</dd>
        </dl>

        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f); }} />
          <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" strokeWidth={2} />
            {upload.isPending ? t('Loading…') : t('Upload lots (Excel/CSV)')}
          </Button>
          {event.status === 'draft' && (
            <Button size="sm" variant="brand" disabled={setStatus.isPending || !(lots.data?.length)} onClick={() => setStatus.mutate('open')}>
              {t('Open for bids')}
            </Button>
          )}
          {event.status === 'open' && (
            <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate('submitted')}>
              {t('Mark submitted to supplier')}
            </Button>
          )}
          {event.status !== 'cancelled' && event.status !== 'submitted' && (
            <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate('cancelled')}>
              {t('Cancel auction')}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!withBids} onClick={exportCsv}>
            <Download className="h-4 w-4" strokeWidth={2} />
            CSV
          </Button>
          <Button size="sm" variant="outline" disabled={!withBids} onClick={() => void exportXlsx()}>
            <Download className="h-4 w-4" strokeWidth={2} />
            Excel
          </Button>
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        {(upload.isError || setStatus.isError) && <p className="text-sm text-destructive">{adminErrorMessage(t, (upload.error ?? setStatus.error)?.message)}</p>}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('Lot')}</th>
                <th className="px-3 py-2 font-medium">{t('Description')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Highest bid')}</th>
                <th className="px-3 py-2 font-medium">{t('Bidder')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(results.data ?? []).slice(0, 500).map((r) => (
                <tr key={r.lot_id}>
                  <td className="px-3 py-2 font-mono text-xs">{r.lot_ref}</td>
                  <td className="max-w-[18rem] truncate px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{r.qty ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{r.amount_cents === null ? '—' : formatUsd(r.amount_cents)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.account_name ?? r.account_email ?? '—'}{r.bid_count > 1 ? ` · ${r.bid_count} ${t('bids')}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
