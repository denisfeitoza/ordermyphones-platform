import { FilePlus2 } from 'lucide-react';
import { PreviewNotice } from '@/components/admin/PreviewNotice';
import { useI18n } from '@/i18n';

/**
 * Manual order (v1.1 — on the roadmap). Placeholder that states plainly what the
 * feature will do: an admin builds an order on a customer's behalf (phone/
 * WhatsApp orders, quotes) and can export it as a spreadsheet. Title/subtitle
 * localize via AdminHeading; blurb/bullets are t()-wrapped here.
 */
export default function ManualOrderPage() {
  const { t } = useI18n();
  return (
    <PreviewNotice
      title="Manual order"
      subtitle="Place an order for a customer, and export it as a spreadsheet."
      icon={<FilePlus2 className="h-6 w-6" strokeWidth={1.75} />}
      blurb={t('Build an order on a customer’s behalf — pick the account, add models and quantities at their tier price, then place it or hand them a spreadsheet to confirm. Handy for phone/WhatsApp orders and quotes.')}
      bullets={[
        t('Search a customer and price the order at their tier'),
        t('Add models and quantities like a cart'),
        t('Place the order for them, or export it as an Excel/CSV sheet'),
        t('The order flows into the same approval and reconciliation as online orders'),
      ]}
    />
  );
}
