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
import SignInPage from '@/routes/auth/SignInPage';
import SignUpPage from '@/routes/auth/SignUpPage';
import ResetPage from '@/routes/auth/ResetPage';
import CallbackPage from '@/routes/auth/CallbackPage';
import InvitePage from '@/routes/auth/InvitePage';
import { RequireAuth } from '@/components/auth/RequireAuth';
import OverviewPage from '@/routes/portal/OverviewPage';
import OrdersPage from '@/routes/portal/OrdersPage';
import OrderDetailPage from '@/routes/portal/OrderDetailPage';
import WishlistPage from '@/routes/portal/WishlistPage';
import TierPage from '@/routes/portal/TierPage';
import InventoryApiPage from '@/routes/portal/InventoryApiPage';
import AddressesPage from '@/routes/portal/AddressesPage';
import PaymentMethodsPage from '@/routes/portal/PaymentMethodsPage';
import SettingsPage from '@/routes/portal/SettingsPage';
import DashboardPage from '@/routes/admin/DashboardPage';
import AdminCustomersPage from '@/routes/admin/CustomersPage';
import AdminOrdersPage from '@/routes/admin/OrdersPage';
import ReconciliationPage from '@/routes/admin/ReconciliationPage';
import InventoryPage from '@/routes/admin/InventoryPage';
import ImportPage from '@/routes/admin/ImportPage';
import PricesPage from '@/routes/admin/PricesPage';
import PricingFlagsPage from '@/routes/admin/PricingFlagsPage';
import ApiLogsPage from '@/routes/admin/ApiLogsPage';
import AiBotsPage from '@/routes/admin/AiBotsPage';
import ReportsPage from '@/routes/admin/ReportsPage';

export default function App() {
  return (
    <AppProviders>
      <Routes>
        <Route path="ops" element={<OpsPage />} />

        <Route path="auth">
          <Route path="sign-in" element={<SignInPage />} />
          <Route path="sign-up" element={<SignUpPage />} />
          <Route path="reset" element={<ResetPage />} />
          <Route path="callback" element={<CallbackPage />} />
          <Route path="invite" element={<InvitePage />} />
        </Route>

        <Route
          path="admin"
          element={
            <RequireAuth roles={['admin', 'staff']}>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="customers" element={<AdminCustomersPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="prices" element={<PricesPage />} />
          <Route path="pricing-flags" element={<PricingFlagsPage />} />
          <Route path="api-logs" element={<ApiLogsPage />} />
          <Route path="ai" element={<AiBotsPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>

        <Route element={<RootLayout />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="p/:slug" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="help" element={<HelpPage />} />

          {/*
            Gated to 'customer' only — NOT any-authenticated. In v1, admin/staff
            do not get a live session inside the customer portal; the audited,
            read-only "view as customer" lens is ADMN-02 (Phase 7). If Phase 7
            wires that lens through this same route, change this gate
            deliberately then, not as a side effect of an unrelated edit.
          */}
          <Route
            path="portal"
            element={
              <RequireAuth roles={['customer']}>
                <PortalLayout />
              </RequireAuth>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="tier" element={<TierPage />} />
            <Route path="inventory-api" element={<InventoryApiPage />} />
            <Route path="addresses" element={<AddressesPage />} />
            <Route path="payment-methods" element={<PaymentMethodsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AppProviders>
  );
}
