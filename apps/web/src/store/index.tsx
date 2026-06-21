import type { ReactNode } from 'react';
import { TierProvider } from './tier';
import { SyncProvider } from './sync';
import { AccountProvider } from './account';
import { CartProvider } from './cart';

export * from './tier';
export * from './sync';
export * from './account';
export * from './cart';

/** Composes the storefront client stores. Order matters: cart reads tier. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TierProvider>
      <SyncProvider>
        <AccountProvider>
          <CartProvider>{children}</CartProvider>
        </AccountProvider>
      </SyncProvider>
    </TierProvider>
  );
}
