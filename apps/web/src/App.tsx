import { Route, Routes } from 'react-router-dom';
import { AppProviders } from '@/store';
import RootLayout from '@/components/layout/RootLayout';
import PortalLayout from '@/components/layout/PortalLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import HomePage from '@/routes/HomePage';
import CatalogPage from '@/routes/CatalogPage';
import ProductPage from '@/routes/ProductPage';
import CartPage from '@/routes/CartPage';
import CheckoutPage from '@/routes/CheckoutPage';
import ContactPage from '@/routes/ContactPage';
import HelpPage from '@/routes/HelpPage';
import NotFoundPage from '@/routes/NotFoundPage';
import OpsPage from '@/routes/OpsPage';
import OverviewPage from '@/routes/portal/OverviewPage';
import OrdersPage from '@/routes/portal/OrdersPage';
import TierPage from '@/routes/portal/TierPage';
import AddressesPage from '@/routes/portal/AddressesPage';
import PaymentMethodsPage from '@/routes/portal/PaymentMethodsPage';
import SettingsPage from '@/routes/portal/SettingsPage';

export default function App() {
  return (
    <AppProviders>
      <Routes>
        <Route path="ops" element={<OpsPage />} />
        <Route element={<RootLayout />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="p/:slug" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="help" element={<HelpPage />} />

          <Route path="portal" element={<PortalLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="tier" element={<TierPage />} />
            <Route path="addresses" element={<AddressesPage />} />
            <Route path="payment-methods" element={<PaymentMethodsPage />} />
            <Route path="settings" element={<SettingsPage />} />
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
    </AppProviders>
  );
}

function AdminPlaceholder({ section }: { section: string }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl tracking-tight">Admin · {section}</h2>
      <p className="text-sm text-muted-foreground">
        The operator console is out of scope for this storefront demo. The live bot view is the public{' '}
        <code>/ops</code> dashboard.
      </p>
    </section>
  );
}
