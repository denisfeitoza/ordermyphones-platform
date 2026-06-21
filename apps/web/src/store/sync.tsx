import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SupplierCode } from '@shared/supplier';
import { SUPPLIER_NAMES } from '@/data/catalog';

export interface SupplierPulse {
  code: SupplierCode;
  name: string;
  status: 'online' | 'degraded';
  latencyMs: number;
}

interface SyncContextValue {
  /** Seconds since the last 2s sync tick (0 or 1). */
  secondsAgo: number;
  /** Increments on every sync tick — drive animations off this. */
  pulse: number;
  suppliers: SupplierPulse[];
  ordersReconciled: number;
  skusTracked: number;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const SYNC_INTERVAL_MS = 2000;
const BASE_RECONCILED = 4127;
const SKUS_TRACKED = 1284;

/**
 * Simulates the inventory bot: a heartbeat that "re-syncs" every 2 seconds,
 * cross-checking supplier stock against open orders. No backend — this is the
 * UI feel of the real Assurant/Mannapov adapters (which poll on a sane cadence).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [pulse, setPulse] = useState(0);
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo((prev) => {
        const next = prev + 1;
        if (next * 1000 >= SYNC_INTERVAL_MS) {
          setPulse((p) => p + 1);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<SyncContextValue>(() => {
    // Latency jitters deterministically off the pulse so it feels alive.
    const jitter = (seed: number, base: number, span: number) => base + ((seed * 37) % span);
    const suppliers: SupplierPulse[] = [
      {
        code: 'source-1',
        name: SUPPLIER_NAMES['source-1'],
        status: 'online',
        latencyMs: jitter(pulse + 1, 180, 70),
      },
      {
        code: 'source-2',
        name: SUPPLIER_NAMES['source-2'],
        status: pulse % 17 === 0 ? 'degraded' : 'online',
        latencyMs: jitter(pulse + 5, 240, 110),
      },
    ];
    return {
      secondsAgo,
      pulse,
      suppliers,
      ordersReconciled: BASE_RECONCILED + pulse,
      skusTracked: SKUS_TRACKED,
    };
  }, [pulse, secondsAgo]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within <SyncProvider>');
  return ctx;
}
