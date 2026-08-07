import { Link } from 'react-router-dom';
import { formatUsd } from '@/lib/format';
import { useI18n } from '@/i18n';
import { useAuth } from '@/store/auth';
import { cn } from '@/lib/utils';

/**
 * Renders the caller's own-tier price, or the correct "why not" state:
 * signed-out visitors get a sign-in prompt, signed-in customers whose tier
 * has no visible price for this SKU (grade-gated, unbenchmarked, etc.) get
 * an honest "not priced for your tier" — never a fabricated number and
 * never the same message for both cases.
 */
export function RealPriceTag({ priceCents, size = 'md', className }: { priceCents: number | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { t } = useI18n();
  const { signedIn } = useAuth();
  const priceCls = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl';

  if (priceCents !== null) {
    return <span className={cn('font-mono font-semibold tabular-nums', priceCls, className)}>{formatUsd(priceCents)}</span>;
  }
  if (!signedIn) {
    return (
      <Link to="/request-access" className={cn('text-sm font-medium text-brand hover:underline', className)}>
        {t('Request access for pricing')}
      </Link>
    );
  }
  return <span className={cn('text-sm text-muted-foreground', className)}>{t('Not priced for your tier')}</span>;
}
