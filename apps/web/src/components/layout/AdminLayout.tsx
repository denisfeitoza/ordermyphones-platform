import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const adminNav = [
  { to: '/admin', label: 'Home', end: true },
  { to: '/admin/customers', label: 'Customers' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/prices', label: 'Prices' },
  { to: '/admin/api-logs', label: 'API logs' },
  { to: '/admin/ai', label: 'AI inbox' },
  { to: '/admin/reports', label: 'Reports' },
];

export default function AdminLayout() {
  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Admin</h2>
        <nav className="flex flex-col gap-1 text-sm">
          {adminNav.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
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
