import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProviders } from '@/store';
import TestEnvBadge from '@/components/layout/TestEnvBadge';
import RootLayout from '@/components/layout/RootLayout';
import PortalLayout from '@/components/layout/PortalLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import HomePage from '@/routes/HomePage';
import CatalogPage from '@/routes/CatalogPage';
import ProductPage from '@/routes/ProductPage';
import CartPage from '@/routes/CartPage';
import CheckoutPage from '@/routes/CheckoutPage';
import ContactPage from '@/routes/ContactPage';
import RequestAccessPage from '@/routes/RequestAccessPage';
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
import PricingWorkbenchPage from '@/routes/admin/PricingWorkbenchPage';
import ManualOrderPage from '@/routes/admin/ManualOrderPage';
import ManualPage from '@/routes/admin/ManualPage';
import PricingFlagsPage from '@/routes/admin/PricingFlagsPage';
import ApiLogsPage from '@/routes/admin/ApiLogsPage';
import AiBotsPage from '@/routes/admin/AiBotsPage';
import ReportsPage from '@/routes/admin/ReportsPage';
import { SectionTabs, type SectionTab } from '@/components/admin/SectionTabs';
import CatalogTab from '@/routes/admin/config/CatalogTab';
import TiersTab from '@/routes/admin/config/TiersTab';
import PricingTab from '@/routes/admin/config/PricingTab';
import QuantityRulesTab from '@/routes/admin/config/QuantityRulesTab';
import LocationsTab from '@/routes/admin/config/LocationsTab';
import GradesTab from '@/routes/admin/config/GradesTab';
import ImportDictTab from '@/routes/admin/config/ImportDictTab';
import UsersTab from '@/routes/admin/config/UsersTab';
import EnforcementTab from '@/routes/admin/config/EnforcementTab';
import HomeContentTab from '@/routes/admin/config/HomeContentTab';
import AuditTab from '@/routes/admin/config/AuditTab';
import ViewAsPage from '@/routes/admin/ViewAsPage';

// Co-located admin sub-tabs (IA rethink): each area owns its configuration.
// Index tabs (end:true) map to a page that already renders its own AdminHeading,
// so they omit title; config sub-tabs carry a title/subtitle SectionTabs renders.
const PRICES_TABS: SectionTab[] = [
  { to: '/admin/prices', label: 'Workbench', end: true },
  { to: '/admin/prices/tiers', label: 'Tiers & floors', title: 'Tiers & floors', subtitle: 'Define each customer tier — who qualifies and the lowest price you’ll ever sell at.' },
  { to: '/admin/prices/params', label: 'Pricing rules', title: 'Pricing rules', subtitle: 'The dials the auto-pricing engine uses — benchmark markups and rounding.' },
];
const IMPORT_TABS: SectionTab[] = [
  { to: '/admin/import', label: 'Upload', end: true },
  { to: '/admin/import/dictionary', label: 'Column & model dictionary', title: 'Import dictionary', subtitle: 'Teach the importer how suppliers name columns, carriers and models, and unify model names.' },
  { to: '/admin/import/grades', label: 'Grade maps', title: 'Grade maps', subtitle: 'Map each supplier’s condition wording (A/B, Grade A…) to your own grades.' },
];
const INVENTORY_TABS: SectionTab[] = [
  { to: '/admin/inventory', label: 'Stock', end: true },
  { to: '/admin/inventory/locations', label: 'Locations', title: 'Stock locations', subtitle: 'Your warehouses and storages — create, rename, deactivate, merge, and choose which ones customers see.' },
];
const CUSTOMERS_TABS: SectionTab[] = [
  { to: '/admin/customers', label: 'Customers', end: true },
  { to: '/admin/customers/users', label: 'Users & roles', title: 'Users & roles', subtitle: 'Every account — change tiers and roles (password-confirmed).' },
];
const ORDERS_TABS: SectionTab[] = [
  { to: '/admin/orders', label: 'Orders', end: true },
  { to: '/admin/orders/limits', label: 'Order limits', title: 'Order limits', subtitle: 'Minimum and maximum quantities a customer can order, per tier.' },
];
const SETTINGS_TABS: SectionTab[] = [
  { to: '/admin/config', label: 'Go-live & storefront', end: true, title: 'Go-live & storefront', subtitle: 'Switch the storefront to real inventory, control quantity display, and pin featured products.' },
  { to: '/admin/config/home', label: 'Home & promos', title: 'Home & promos', subtitle: 'Manage the storefront home page — benefits bar, promotions, and trending products.' },
  { to: '/admin/config/enforcement', label: 'Enforcement', title: 'Enforcement', subtitle: 'Guardrails that block risky pricing and stock actions before they happen.' },
  { to: '/admin/config/audit', label: 'Audit log', title: 'Audit log', subtitle: 'A trail of every sensitive change — who changed what, and when.' },
];

export default function App() {
  return (
    <AppProviders>
      <TestEnvBadge />
      <Routes>
        {/* Internal ops console — admin/staff only (leak audit Finding 2). Not a
            customer-facing showcase; the footer link was removed to match. */}
        <Route
          path="ops"
          element={
            <RequireAuth roles={['admin', 'staff']}>
              <OpsPage />
            </RequireAuth>
          }
        />

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

          <Route path="customers" element={<SectionTabs tabs={CUSTOMERS_TABS} />}>
            <Route index element={<AdminCustomersPage />} />
            <Route path="users" element={<UsersTab />} />
          </Route>

          <Route path="orders" element={<SectionTabs tabs={ORDERS_TABS} />}>
            <Route index element={<AdminOrdersPage />} />
            <Route path="limits" element={<QuantityRulesTab />} />
          </Route>

          <Route path="manual-order" element={<ManualOrderPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />

          <Route path="inventory" element={<SectionTabs tabs={INVENTORY_TABS} />}>
            <Route index element={<InventoryPage />} />
            <Route path="locations" element={<LocationsTab />} />
          </Route>

          <Route path="import" element={<SectionTabs tabs={IMPORT_TABS} />}>
            <Route index element={<ImportPage />} />
            <Route path="dictionary" element={<ImportDictTab />} />
            <Route path="grades" element={<GradesTab />} />
          </Route>

          <Route path="prices" element={<SectionTabs tabs={PRICES_TABS} />}>
            <Route index element={<PricingWorkbenchPage />} />
            <Route path="tiers" element={<TiersTab />} />
            <Route path="params" element={<PricingTab />} />
          </Route>

          <Route path="pricing-flags" element={<PricingFlagsPage />} />
          <Route path="api-logs" element={<ApiLogsPage />} />
          <Route path="ai" element={<AiBotsPage />} />
          <Route path="reports" element={<ReportsPage />} />

          {/* Settings, slimmed to system-only. */}
          <Route path="config" element={<SectionTabs tabs={SETTINGS_TABS} />}>
            <Route index element={<CatalogTab />} />
            <Route path="home" element={<HomeContentTab />} />
            <Route path="enforcement" element={<EnforcementTab />} />
            <Route path="audit" element={<AuditTab />} />
          </Route>

          {/* Redirects: the old one-bucket Settings URLs now live with their area. */}
          <Route path="config/tiers" element={<Navigate to="/admin/prices/tiers" replace />} />
          <Route path="config/pricing" element={<Navigate to="/admin/prices/params" replace />} />
          <Route path="config/quantity" element={<Navigate to="/admin/orders/limits" replace />} />
          <Route path="config/locations" element={<Navigate to="/admin/inventory/locations" replace />} />
          <Route path="config/grades" element={<Navigate to="/admin/import/grades" replace />} />
          <Route path="config/import" element={<Navigate to="/admin/import/dictionary" replace />} />
          <Route path="config/users" element={<Navigate to="/admin/customers/users" replace />} />
        </Route>

        {/*
          The read-only "view as customer/staff" lens (ADMN-02). Admin-only —
          the admin's own rights fetch the data via SECURITY DEFINER read RPCs;
          there is NO session swap and NO impersonation token. It renders full
          screen (not inside AdminLayout) with a persistent read-only banner,
          and every entry is audited to admin_audit.
        */}
        <Route
          path="admin/view-as/:userId"
          element={
            <RequireAuth roles={['admin']}>
              <ViewAsPage />
            </RequireAuth>
          }
        />

        {/* Full-screen, admin-gated manual (not inside AdminLayout — no nested chrome). */}
        <Route
          path="admin/manual"
          element={
            <RequireAuth roles={['admin', 'staff']}>
              <ManualPage />
            </RequireAuth>
          }
        />

        <Route element={<RootLayout />}>
          <Route index element={<HomePage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="p/:slug" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="request-access" element={<RequestAccessPage />} />
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
