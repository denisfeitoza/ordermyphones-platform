import { Outlet } from 'react-router-dom';
import { Header } from '@/components/store/Header';
import { Footer } from '@/components/store/Footer';
import { CartDrawer } from '@/components/store/CartDrawer';
import { SyncHeartbeat } from '@/components/store/SyncHeartbeat';

export default function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-b border-border bg-muted/40">
        <div className="container">
          <div className="scrollbar-hide flex h-9 items-center overflow-x-auto">
            <SyncHeartbeat variant="full" />
          </div>
        </div>
      </div>

      <Header />

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
      <CartDrawer />
    </div>
  );
}
