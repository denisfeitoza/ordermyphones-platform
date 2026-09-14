import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { PageHeading } from '@/components/portal/parts';
import { buttonVariants } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Shown in place of a mock-era portal page when the store runs on real data
 * (audit 2026-09-13 P0-5). Payment methods (Stripe), the Partner Inventory
 * API and the wishlist are v1.1 scope (DECISIONS-LOCKED.md "OUT of v1.0");
 * a real customer must never see fabricated cards, keys or products.
 */
export function RealModeUnavailable({ title, note }: { title: string; note: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <PageHeading title={title} />
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
          <Clock className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div className="max-w-md">
          <p className="font-medium">{t('Coming soon')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(note)}</p>
        </div>
        <Link to="/portal/orders" className={cn(buttonVariants({ variant: 'outline' }))}>
          {t('Back to orders')}
        </Link>
      </div>
    </div>
  );
}
