import { NavLink, Outlet } from 'react-router-dom';
import { Boxes, FileSpreadsheet, Layers, ListChecks, Radio, ScrollText, ShieldCheck, Store, Tag, Users } from 'lucide-react';
import { AdminHeading } from '@/components/admin/parts';
import { useAuth } from '@/store';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/admin/config', label: 'Catalog & go-live', icon: Store, end: true },
  { to: '/admin/config/tiers', label: 'Tiers & floors', icon: Layers },
  { to: '/admin/config/pricing', label: 'Pricing params', icon: Tag },
  { to: '/admin/config/quantity', label: 'Quantity rules', icon: ListChecks },
  { to: '/admin/config/locations', label: 'Stock locations', icon: Boxes },
  { to: '/admin/config/grades', label: 'Grade maps', icon: ShieldCheck },
  { to: '/admin/config/import', label: 'Import dictionary', icon: FileSpreadsheet },
  { to: '/admin/config/users', label: 'Users & invites', icon: Users },
  { to: '/admin/config/enforcement', label: 'Enforcement', icon: Radio },
  { to: '/admin/config/audit', label: 'Audit log', icon: ScrollText },
];

export default function ConfigLayout() {
  const { role } = useAuth();

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Settings & configuration"
        subtitle={
          role === 'admin'
            ? 'Run the whole business without code changes — pricing, tiers, catalog, users, and every lens.'
            : 'Operate config you have access to. Sensitive settings (marked admin-only) are read-only for staff.'
        }
      />

      <nav className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end ?? false}
            className={({ isActive }) =>
              cn(
                'inline-flex min-h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )
            }
          >
            <t.icon className="h-4 w-4" strokeWidth={2} />
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
