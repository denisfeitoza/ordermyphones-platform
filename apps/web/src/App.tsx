import { Route, Routes } from 'react-router-dom';
import RootLayout from '@/components/layout/RootLayout';
import PortalLayout from '@/components/layout/PortalLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import HomePage from '@/routes/HomePage';
import CatalogPage from '@/routes/CatalogPage';
import ProductPage from '@/routes/ProductPage';
import CartPage from '@/routes/CartPage';
import CheckoutPage from '@/routes/CheckoutPage';
import NotFoundPage from '@/routes/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<HomePage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="p/:slug" element={<ProductPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />

        <Route path="portal" element={<PortalLayout />}>
          <Route index element={<PortalPlaceholder section="Home" />} />
          <Route path="orders" element={<PortalPlaceholder section="Orders" />} />
          <Route path="tier" element={<PortalPlaceholder section="Tier" />} />
          <Route path="addresses" element={<PortalPlaceholder section="Addresses" />} />
          <Route path="payment-methods" element={<PortalPlaceholder section="Payment methods" />} />
          <Route path="settings" element={<PortalPlaceholder section="Settings" />} />
        </Route>

        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminPlaceholder section="Home" />} />
          <Route path="customers" element={<AdminPlaceholder section="Customers" />} />
          <Route path="orders" element={<AdminPlaceholder section="Orders" />} />
          <Route path="inventory" element={<AdminPlaceholder section="Inventory" />} />
          <Route path="prices" element={<AdminPlaceholder section="Prices" />} />
          <Route path="api-logs" element={<AdminPlaceholder section="API logs" />} />
          <Route path="ai" element={<AdminPlaceholder section="AI inbox" />} />
          <Route path="reports" element={<AdminPlaceholder section="Reports" />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

function PortalPlaceholder({ section }: { section: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-display tracking-tight">Portal · {section}</h2>
      <p className="text-sm text-muted-foreground">
        This view ships in Phase 3 (Frontend & Portal). See <code>docs/ux/CUSTOMER-PORTAL.md</code>.
      </p>
    </section>
  );
}

function AdminPlaceholder({ section }: { section: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-display tracking-tight">Admin · {section}</h2>
      <p className="text-sm text-muted-foreground">
        This view ships in Phase 3 (Frontend & Portal). See <code>docs/ux/ADMIN-DASHBOARD.md</code>.
      </p>
    </section>
  );
}
