import type { ReactNode } from 'react';
import { TierProvider } from './tier';
import { SyncProvider } from './sync';
import { CartProvider } from './cart';

export * from './tier';
export * from './sync';
export * from './cart';

/** Composes the storefront client stores. Order matters: cart reads tier. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TierProvider>
      <SyncProvider>
        <CartProvider>{children}</CartProvider>
      </SyncProvider>
    </TierProvider>
  );
}
