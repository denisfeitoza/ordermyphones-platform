import { PackageSearch } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/Button';

/** Shared empty state for real-mode catalog surfaces (CatalogPage, HomePage)
 * when app_settings.catalog_source = 'real' but public.catalog_listing has
 * no published, in-stock rows yet — e.g. right after the flag is flipped
 * and before any stock has been imported/priced. `onClear`, when given,
 * renders a "Clear filters" action (used when the empty state is the result
 * of an over-narrow facet selection rather than an empty catalog). */
export function RealCatalogEmpty({
  title,
  subtitle,
  onClear,
}: {
  title?: string | undefined;
  subtitle?: string | undefined;
  onClear?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border py-20 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted">
        <PackageSearch className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <p className="font-medium">{title ?? t('No phones in the live catalog yet')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {subtitle ?? t('Stock is imported and priced from the admin console — check back soon.')}
        </p>
      </div>
      {onClear && (
        <Button variant="outline" size="sm" onClick={onClear}>
          {t('Clear filters')}
        </Button>
      )}
    </div>
  );
}
