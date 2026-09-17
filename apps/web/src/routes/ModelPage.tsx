import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRealCatalog } from '@/data/realCatalog';
import { groupByModel } from '@/lib/modelGroups';
import { RealModelDetail } from '@/components/store/RealModelDetail';
import { useI18n } from '@/i18n';

/** /m/:slug — one model with every real-catalog SKU that belongs to it. Not
 * gated on useCatalogSource(): that hook answers 'mock' until the setting
 * loads, which would bounce every deep link. Only the real grid links here. */
export default function ModelPage() {
  const { t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const real = useRealCatalog();
  const group = useMemo(() => groupByModel(real.items).find((g) => g.slug === slug), [real.items, slug]);

  if (real.isLoading) {
    return <div className="container py-24 text-center text-sm text-muted-foreground">{t('Loading…')}</div>;
  }

  if (!group) {
    return (
      <div className="container flex flex-col items-center gap-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">{t('Phone not found')}</h1>
        <p className="text-muted-foreground">{t('That model isn’t in the catalog.')}</p>
        <Link to="/catalog" className="text-sm font-medium text-brand hover:underline">
          {t('Back to catalog')}
        </Link>
      </div>
    );
  }

  // key: a new model resets the option picker instead of carrying selections over.
  return <RealModelDetail key={group.slug} group={group} />;
}
