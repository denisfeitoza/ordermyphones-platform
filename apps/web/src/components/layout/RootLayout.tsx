import { Outlet } from 'react-router-dom';
import { Header } from '@/components/store/Header';
import { Footer } from '@/components/store/Footer';
import { CartDrawer } from '@/components/store/CartDrawer';
import { TierPreviewPill } from '@/components/store/TierPreviewPill';
import { ScrollToHash } from './ScrollToHash';

export default function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToHash />
      <Header />

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
      <CartDrawer />
      <TierPreviewPill />
    </div>
  );
}
