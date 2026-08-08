import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Boxes, FileSpreadsheet, Layers, ListChecks, Radio, ScrollText, ShieldCheck, Store, Tag, Users } from 'lucide-react';
import { AdminHeading } from '@/components/admin/parts';
import { useAuth } from '@/store';
import { cn } from '@/lib/utils';

// `help` is a plain-language, one-line answer to "what do I do here?" — shown as
// a contextual banner under the nav so the owner is never guessing what a tab is.
const TABS = [
  { to: '/admin/config', label: 'Catalog & go-live', icon: Store, end: true, help: 'Switch the storefront between the demo and your real inventory, and control what goes live.' },
  { to: '/admin/config/tiers', label: 'Tiers & floors', icon: Layers, help: 'Define each customer tier — its name, the order size that qualifies, and the lowest price you’ll ever sell it for.' },
  { to: '/admin/config/pricing', label: 'Pricing params', icon: Tag, help: 'The dials the auto-pricing uses: benchmark markups, rounding, and how suggested prices are calculated.' },
  { to: '/admin/config/quantity', label: 'Quantity rules', icon: ListChecks, help: 'Minimum and maximum quantities a customer can order, per tier.' },
  { to: '/admin/config/locations', label: 'Stock locations', icon: Boxes, help: 'Your warehouses and storages — rename them, and choose which ones customers can see.' },
  { to: '/admin/config/grades', label: 'Grade maps', icon: ShieldCheck, help: 'Map each supplier’s condition wording (A/B, Grade A, etc.) to your own grades, and gate who sees lower grades.' },
  { to: '/admin/config/import', label: 'Import dictionary', icon: FileSpreadsheet, help: 'Teach the importer how different suppliers name columns, carriers, and models so uploads map cleanly.' },
  { to: '/admin/config/users', label: 'Users & invites', icon: Users, help: 'Invite customers with a tier attached, and change tiers or roles (password-confirmed).' },
  { to: '/admin/config/enforcement', label: 'Enforcement', icon: Radio, help: 'Guardrails that block risky actions — floor-price enforcement and related safety switches.' },
  { to: '/admin/config/audit', label: 'Audit log', icon: ScrollText, help: 'A trail of every sensitive change — who changed what, and when.' },
];

export default function ConfigLayout() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const active = TABS.find((t) => (t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`))) ?? TABS[0];

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

      <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground">
        <active.icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" strokeWidth={2} />
        <span>{active.help}</span>
      </p>

      <Outlet />
    </div>
  );
}
