import { Link } from 'react-router-dom';

const tierHighlights = [
  { code: 'tier_1', label: 'Consumer', range: '1–10 units', color: 'bg-tier-1' },
  { code: 'tier_2', label: 'Retailer', range: '10–50 units', color: 'bg-tier-2' },
  { code: 'tier_3', label: 'Multi-Store', range: '50–400 units', color: 'bg-tier-3' },
  { code: 'tier_4', label: 'Wholesale', range: '401+ units', color: 'bg-tier-4' },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">U.S. mobile devices · Tier-based pricing</p>
        <h1 className="font-display text-3xl md:text-5xl tracking-tight leading-tight max-w-2xl">
          Order phones the way your business actually buys them.
        </h1>
        <p className="text-muted-foreground max-w-xl">
          From a single iPhone to a 500-unit wholesale shipment, OrderMyPhones aggregates real-time supplier
          inventory and applies the right tier price automatically. No spreadsheets, no back-and-forth.
        </p>
        <div className="flex gap-3 pt-2">
          <Link
            to="/catalog"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            Shop the catalog
          </Link>
          <Link
            to="/portal"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
          >
            Reseller? Apply for tier pricing
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-tight">Four tiers, automatic promotion</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tierHighlights.map((t) => (
            <li key={t.code} className="rounded-lg border p-4 space-y-2">
              <span className={`inline-block h-2 w-10 rounded-full ${t.color}`} />
              <p className="font-medium">{t.label}</p>
              <p className="text-sm text-muted-foreground">{t.range}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Tiers are computed automatically as your cumulative purchase volume grows. See{' '}
          <code>docs/architecture/PRICING-ENGINE.md</code>.
        </p>
      </section>
    </div>
  );
}
