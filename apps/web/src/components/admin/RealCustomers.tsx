import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { listProfiles } from '@/data/adminConfig';
import { DB_TIER_LABELS } from '@/lib/invites';
import { InvitePanel } from '@/components/admin/InvitePanel';
import { AdminHeading, Table, Td } from '@/components/admin/parts';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Real-mode Customers (go-live). Lists the actual registered accounts from
 * public.profiles (RLS admin/staff) instead of the mock's invented businesses,
 * plus the real invite panel. Tier/role changes live in Settings → Users (the
 * sensitive, re-auth-gated surface) — this is the read + invite view.
 */
export function RealCustomers() {
  const q = useQuery({ queryKey: ['config-profiles'], queryFn: listProfiles });
  const customers = (q.data ?? []).filter((p) => p.role === 'customer');

  return (
    <div className="space-y-6">
      <AdminHeading
        title="Customers"
        subtitle={`${customers.length} registered account${customers.length === 1 ? '' : 's'} · manage tiers & roles in Settings → Users`}
      />

      <InvitePanel />

      {q.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading customers…</div>
      ) : customers.length > 0 ? (
        <Table
          minWidth={720}
          columns={[
            { key: 'name', label: 'Account' },
            { key: 'tier', label: 'Tier' },
            { key: 'joined', label: 'Joined' },
            { key: 'manage', label: '', align: 'right' },
          ]}
        >
          {customers.map((c) => (
            <tr key={c.id} className="transition-colors hover:bg-muted/40">
              <Td>
                <span className="flex items-center gap-2 font-medium">
                  {c.display_name ?? c.email}
                  {c.is_test && <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">test</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
              </Td>
              <Td>
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium capitalize">
                  {c.tier ? DB_TIER_LABELS[c.tier] : 'No tier'}
                </span>
              </Td>
              <Td className="text-muted-foreground">{fmtDate(c.created_at)}</Td>
              <Td align="right">
                <Link to="/admin/config/users" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  Manage <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No customers registered yet. Send an invite above — the buyer signs up with the tier you choose already attached.
        </div>
      )}
    </div>
  );
}
