import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from '@/components/store/Header';
import { Footer } from '@/components/store/Footer';
import { CartDrawer } from '@/components/store/CartDrawer';
import { RealCartDrawer } from '@/components/store/RealCartDrawer';
import { CartToast } from '@/components/store/CartToast';
import { TierPreviewPill } from '@/components/store/TierPreviewPill';
import { ScrollToHash } from './ScrollToHash';

export default function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToHash />
      <Header />

      {/* Its own boundary: a lazy page loading (first visit to /checkout)
          suspends only the main area. The App-level boundary would hide the
          header and the cart drawer mid-animation instead. */}
      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />
      <CartDrawer />
      <RealCartDrawer />
      <CartToast />
      <TierPreviewPill />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}
