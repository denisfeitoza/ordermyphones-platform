import { ShieldCheck, CreditCard, Building2 } from 'lucide-react';
import { PageHeading, Panel } from '@/components/portal/parts';

export default function PaymentMethodsPage() {
  return (
    <div className="space-y-6">
      <PageHeading title="Payment methods" subtitle="Cards are tokenized by Stripe — raw card data never reaches this app." />

      <Panel title="Card on file">
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-16 place-items-center rounded-lg bg-foreground text-background">
            <CreditCard className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="flex-1">
            <p className="font-mono text-sm font-medium">Visa ···· 7731</p>
            <p className="text-xs text-muted-foreground">Expires 09 / 28 · added by accounts payable</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Default
          </span>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-medium">Billed by Order My Phones LLC</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every charge settles under the merchant of record — your statement shows a single line per order.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-medium">Charged after reservation</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We authorize only once units are confirmed and held at source — no charge for stock we can&apos;t reserve.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
