import { NavLink, Outlet } from 'react-router-dom';
import { useAccount } from '@/store';
import { TierBadge } from '@/components/store/TierBadge';
import { cn } from '@/lib/utils';

const portalNav = [
  { to: '/portal', label: 'Overview', end: true },
  { to: '/portal/orders', label: 'Orders' },
  { to: '/portal/tier', label: 'Tier' },
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
  const { businessName, accountTier } = useAccount();

  return (
    <div className="container py-8 md:py-10">
      <div className="grid gap-8 lg:grid-cols-[248px_1fr]">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground font-mono text-sm font-semibold text-background">
              {initials(businessName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{businessName}</p>
              <p className="text-xs text-muted-foreground">Business account</p>
            </div>
          </div>

          <div className="mt-3 px-1">
            <TierBadge tier={accountTier} showRange />
          </div>

          <nav className="scrollbar-hide mt-5 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {portalNav.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end ?? false}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors',
                    isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
