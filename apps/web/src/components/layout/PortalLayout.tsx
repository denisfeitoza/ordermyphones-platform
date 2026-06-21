import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const portalNav = [
  { to: '/portal', label: 'Home', end: true },
  { to: '/portal/orders', label: 'Orders' },
  { to: '/portal/tier', label: 'Tier' },
  { to: '/portal/addresses', label: 'Addresses' },
  { to: '/portal/payment-methods', label: 'Payment methods' },
  { to: '/portal/settings', label: 'Settings' },
];

export default function PortalLayout() {
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <aside>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Customer portal</h2>
        <nav className="flex flex-col gap-1 text-sm">
          {portalNav.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end ?? false}
              className={({ isActive }) =>
                cn(
                  'px-2 py-1 rounded-md',
                  isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
