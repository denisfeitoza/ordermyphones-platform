import type { ReactNode } from 'react';
import { TierProvider } from './tier';
import { SyncProvider } from './sync';
import { AuthProvider } from './auth';
import { AccountProvider } from './account';
import { CartProvider } from './cart';

export * from './tier';
export * from './sync';
export * from './auth';
export * from './account';
export * from './cart';

/** Composes the storefront client stores. Order matters: cart reads tier. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <TierProvider>
      <SyncProvider>
        <AuthProvider>
          <AccountProvider>
            <CartProvider>{children}</CartProvider>
          </AccountProvider>
        </AuthProvider>
      </SyncProvider>
    </TierProvider>
  );
}
