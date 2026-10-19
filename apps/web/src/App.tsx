import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppProviders } from '@/store';
import TestEnvBadge from '@/components/layout/TestEnvBadge';
import RootLayout from '@/components/layout/RootLayout';
import HomePage from '@/routes/HomePage';
import CatalogPage from '@/routes/CatalogPage';
import ModelPage from '@/routes/ModelPage';
import NotFoundPage from '@/routes/NotFoundPage';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { SectionTabs, type SectionTab } from '@/components/admin/SectionTabs';

// Everything but the storefront entry pages loads on demand: admin, portal,
// auth and the manual are their own chunks, so a buyer never downloads them.
const PortalLayout = lazy(() => import('@/components/layout/PortalLayout'));
const AdminLayout = lazy(() => import('@/components/layout/AdminLayout'));
const ProductPage = lazy(() => import('@/routes/ProductPage'));
const CartPage = lazy(() => import('@/routes/CartPage'));
const CheckoutPage = lazy(() => import('@/routes/CheckoutPage'));
const ContactPage = lazy(() => import('@/routes/ContactPage'));
const RequestAccessPage = lazy(() => import('@/routes/RequestAccessPage'));
const HelpPage = lazy(() => import('@/routes/HelpPage'));
const OpsPage = lazy(() => import('@/routes/OpsPage'));
const SignInPage = lazy(() => import('@/routes/auth/SignInPage'));
const SignUpPage = lazy(() => import('@/routes/auth/SignUpPage'));
const ResetPage = lazy(() => import('@/routes/auth/ResetPage'));
const CallbackPage = lazy(() => import('@/routes/auth/CallbackPage'));
const InvitePage = lazy(() => import('@/routes/auth/InvitePage'));
const OverviewPage = lazy(() => import('@/routes/portal/OverviewPage'));
const OrdersPage = lazy(() => import('@/routes/portal/OrdersPage'));
const OrderDetailPage = lazy(() => import('@/routes/portal/OrderDetailPage'));
const WishlistPage = lazy(() => import('@/routes/portal/WishlistPage'));
const TierPage = lazy(() => import('@/routes/portal/TierPage'));
const InventoryApiPage = lazy(() => import('@/routes/portal/InventoryApiPage'));
const AddressesPage = lazy(() => import('@/routes/portal/AddressesPage'));
const TeamPage = lazy(() => import('@/routes/portal/TeamPage'));
const PaymentMethodsPage = lazy(() => import('@/routes/portal/PaymentMethodsPage'));
const SettingsPage = lazy(() => import('@/routes/portal/SettingsPage'));
const BusinessPage = lazy(() => import('@/routes/portal/BusinessPage'));
const AgreementTab = lazy(() => import('@/routes/admin/config/AgreementTab'));
const DashboardPage = lazy(() => import('@/routes/admin/DashboardPage'));
const AdminCustomersPage = lazy(() => import('@/routes/admin/CustomersPage'));
const AdminOrdersPage = lazy(() => import('@/routes/admin/OrdersPage'));
const ReconciliationPage = lazy(() => import('@/routes/admin/ReconciliationPage'));
const InventoryPage = lazy(() => import('@/routes/admin/InventoryPage'));
const ImportPage = lazy(() => import('@/routes/admin/ImportPage'));
const PricingWorkbenchPage = lazy(() => import('@/routes/admin/PricingWorkbenchPage'));
const ManualOrderPage = lazy(() => import('@/routes/admin/ManualOrderPage'));
const ManualPage = lazy(() => import('@/routes/admin/ManualPage'));
const PricingFlagsPage = lazy(() => import('@/routes/admin/PricingFlagsPage'));
const ApiLogsPage = lazy(() => import('@/routes/admin/ApiLogsPage'));
const AiBotsPage = lazy(() => import('@/routes/admin/AiBotsPage'));
const ReportsPage = lazy(() => import('@/routes/admin/ReportsPage'));
const CatalogTab = lazy(() => import('@/routes/admin/config/CatalogTab'));
const ProductsTab = lazy(() => import('@/routes/admin/config/ProductsTab'));
const CustomerAccountPage = lazy(() => import('@/routes/admin/CustomerAccountPage'));
const AttentionTab = lazy(() => import('@/routes/admin/config/AttentionTab'));
const TiersTab = lazy(() => import('@/routes/admin/config/TiersTab'));
const PricingTab = lazy(() => import('@/routes/admin/config/PricingTab'));
const QuantityRulesTab = lazy(() => import('@/routes/admin/config/QuantityRulesTab'));
const LocationsTab = lazy(() => import('@/routes/admin/config/LocationsTab'));
const GradesTab = lazy(() => import('@/routes/admin/config/GradesTab'));
const ImportDictTab = lazy(() => import('@/routes/admin/config/ImportDictTab'));
const UsersTab = lazy(() => import('@/routes/admin/config/UsersTab'));
const EnforcementTab = lazy(() => import('@/routes/admin/config/EnforcementTab'));
const HomeContentTab = lazy(() => import('@/routes/admin/config/HomeContentTab'));
const CompanyTab = lazy(() => import('@/routes/admin/config/CompanyTab'));
const AuditTab = lazy(() => import('@/routes/admin/config/AuditTab'));
const ViewAsPage = lazy(() => import('@/routes/admin/ViewAsPage'));

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
  { to: '/admin/inventory/attention', label: 'Needs attention', title: 'Needs attention', subtitle: 'Products still missing an image, a price, stock or the publish switch — fix them here, one by one or all at once.' },
  { to: '/admin/inventory/products', label: 'Products', title: 'Products', subtitle: 'Photos, descriptions and the publish switch for every model the import brought in.' },
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
  { to: '/admin/config/company', label: 'Company & Sales Order', title: 'Company & Sales Order', subtitle: 'Your company and bank details, and the agreement terms every Sales Order prints.' },
  { to: '/admin/config/agreement', label: 'Master Agreement', title: 'Master Agreement', subtitle: 'The agreement buyers sign in the portal — publish a version, see who signed.' },
  { to: '/admin/config/enforcement', label: 'Enforcement', title: 'Enforcement', subtitle: 'Guardrails that block risky pricing and stock actions before they happen.' },
  { to: '/admin/config/audit', label: 'Audit log', title: 'Audit log', subtitle: 'A trail of every sensitive change — who changed what, and when.' },
];

export default function App() {
  return (
    <AppProviders>
      <TestEnvBadge />
      <Suspense fallback={<RouteFallback />}>
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
          <Route path="customers/account/:id" element={<CustomerAccountPage />} />

          <Route path="orders" element={<SectionTabs tabs={ORDERS_TABS} />}>
            <Route index element={<AdminOrdersPage />} />
            <Route path="limits" element={<QuantityRulesTab />} />
          </Route>

          <Route path="manual-order" element={<ManualOrderPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />

          <Route path="inventory" element={<SectionTabs tabs={INVENTORY_TABS} />}>
            <Route index element={<InventoryPage />} />
            <Route path="attention" element={<AttentionTab />} />
            <Route path="products" element={<ProductsTab />} />
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
            <Route path="company" element={<CompanyTab />} />
            <Route path="agreement" element={<AgreementTab />} />
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
          <Route path="m/:slug" element={<ModelPage />} />
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
            <Route path="team" element={<TeamPage />} />
            <Route path="payment-methods" element={<PaymentMethodsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="business" element={<BusinessPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      </Suspense>
    </AppProviders>
  );
}

/** Shown for the instant a lazy page chunk is loading. */
function RouteFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status" aria-live="polite">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}
