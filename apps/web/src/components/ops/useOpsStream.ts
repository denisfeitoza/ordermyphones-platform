import { useEffect, useRef, useState } from 'react';
import type { SupplierCode } from '@shared/supplier';
import { CATALOG, SUPPLIER_NAMES, totalAvailable } from '@/data/catalog';
import { resolveTierByUnits } from '@/data/tiers';

export type LogKind = 'sync' | 'cross' | 'reserve' | 'dispatch' | 'price';

export interface LogEvent {
  id: number;
  time: string;
  kind: LogKind;
  supplier: SupplierCode | null;
  text: string;
  status: 'ok' | 'held' | 'warn';
  ms: number | null;
}

export interface LiveOrder {
  id: string;
  model: string;
  qty: number;
  stage: number; // 0..4 → ORDER_STAGES
  tierLabel: string;
}

export const ORDER_STAGES = ['Querying stock', 'Cross-checking', 'Reserving', 'Reserved', 'Dispatched'];

const TICK_MS = 900;

const nowTime = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const rand = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const jitter = (base: number, span: number) => base + Math.floor(Math.random() * span);
const genOrderId = () => 'OMP-' + Math.random().toString(16).slice(2, 7).toUpperCase();

function newOrder(): LiveOrder {
  const item = rand(CATALOG);
  const qty = rand([1, 2, 3, 5, 8, 12, 24, 50, 120, 220]);
  return { id: genOrderId(), model: item.model, qty, stage: 0, tierLabel: resolveTierByUnits(qty).label };
}

function makeEvent(idRef: { current: number }): LogEvent {
  const item = rand(CATALOG);
  const supplier: SupplierCode = rand(item.stock).supplier;
  const name = SUPPLIER_NAMES[supplier];
  const kind = rand<LogKind>(['sync', 'cross', 'reserve', 'dispatch', 'price']);
  const id = idRef.current++;
  const time = nowTime();
  switch (kind) {
    case 'cross':
      return { id, time, kind, supplier: null, status: 'ok', ms: jitter(18, 26), text: `cross-check ${item.model} vs open orders — no conflict` };
    case 'reserve':
      return { id, time, kind, supplier, status: 'held', ms: jitter(110, 90), text: `RESERVE ${name} ${item.model} ×${rand([1, 2, 5, 12, 50])} — held` };
    case 'dispatch':
      return { id, time, kind, supplier, status: 'ok', ms: jitter(190, 140), text: `dispatch ${item.model} → tracking opened` };
    case 'price':
      return { id, time, kind, supplier: null, status: 'ok', ms: jitter(8, 14), text: `re-priced ${item.model} — 4 tiers refreshed` };
    case 'sync':
    default:
      return { id, time, kind: 'sync', supplier, status: 'ok', ms: jitter(170, 120), text: `GET ${name} /inventory — ${totalAvailable(item)} units · ${item.model}` };
  }
}

/** Simulated operations stream: a rolling API log + an order pipeline that advances. */
export function useOpsStream() {
  const idRef = useRef(1000);
  const [events, setEvents] = useState<LogEvent[]>(() =>
    Array.from({ length: 9 }, () => makeEvent(idRef)),
  );
  const [orders, setOrders] = useState<LiveOrder[]>(() => {
    const list = Array.from({ length: 6 }, newOrder);
    list.forEach((o, i) => {
      o.stage = i % 5;
    });
    return list;
  });
  const [held, setHeld] = useState(312);

  useEffect(() => {
    const t = setInterval(() => {
      setEvents((prev) => [makeEvent(idRef), ...prev].slice(0, 24));
      setOrders((prev) =>
        prev.map((o) => {
          if (Math.random() < 0.55) return o.stage >= 4 ? newOrder() : { ...o, stage: o.stage + 1 };
          return o;
        }),
      );
      setHeld((h) => h + (Math.random() < 0.5 ? 1 : 0));
    }, TICK_MS);
    return () => clearInterval(t);
  }, []);

  return { events, orders, held };
}
