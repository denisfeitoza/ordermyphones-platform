import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Lock, LogOut } from 'lucide-react';
import { useAccount, useAuth } from '@/store';
import { useCatalogSource } from '@/lib/catalogSource';
import { useEffectiveTier } from '@/lib/effectiveTier';
import { TierBadge } from '@/components/store/TierBadge';
import { hasApiAccess } from '@/data/inventoryApi';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

const portalNav = [
  { to: '/portal', label: 'Overview', end: true },
  { to: '/portal/orders', label: 'Orders' },
  { to: '/portal/wishlist', label: 'Wishlist' },
  { to: '/portal/tier', label: 'Tier' },
  { to: '/portal/inventory-api', label: 'Inventory API', gated: true },
  { to: '/portal/addresses', label: 'Addresses' },
  { to: '/portal/payment-methods', label: 'Payment' },
  { to: '/portal/settings', label: 'Settings' },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w[0] ?? ''))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export default function PortalLayout() {
  const source = useCatalogSource();
  const { businessName: mockName } = useAccount();
  const { user, profile, role, signOut } = useAuth();
  const { tierDef, code } = useEffectiveTier();
  const isStaff = role === 'admin' || role === 'staff';
  const apiUnlocked = hasApiAccess(code);
  const { t } = useI18n();
  const navigate = useNavigate();

  // Real mode: the actual account identity; mock mode: the demo business.
  const displayName = source === 'real' ? (profile?.display_name ?? profile?.email ?? 'Account') : mockName;

  function handleSignOut() {
    signOut();
    navigate('/');
  }

  return (
    <div className="container py-8 md:py-10">
      <div className="lg:grid lg:gap-8 lg:grid-cols-[248px_1fr]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground font-mono text-sm font-semibold text-background">
              {initials(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="text-xs text-muted-foreground">{t('Business account')}</p>
            </div>
          </div>

          {tierDef && (
            <div className="mt-3 px-1">
              <TierBadge tier={tierDef} />
            </div>
          )}

          {isStaff && (
            <Link
              to="/admin"
              className="mt-4 inline-flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('Admin console')}
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          )}

          <nav className="scrollbar-hide mt-4 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {portalNav.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end ?? false}
                className={({ isActive }) =>
                  cn(
                    'inline-flex min-h-[42px] items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                {t(l.label)}
                {l.gated && !apiUnlocked && <Lock className="h-3 w-3 opacity-60" strokeWidth={2} aria-label={t('Wholesale and up')} />}
              </NavLink>
            ))}
          </nav>

          <div className="mt-5 border-t border-border pt-4">
            {user && <p className="truncate px-3 pb-1.5 text-xs text-muted-foreground">{t('Signed in as')} {user.email}</p>}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
              {t('Sign out')}
            </button>
          </div>
        </aside>

        <div className="min-w-0 pt-6 lg:pt-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
