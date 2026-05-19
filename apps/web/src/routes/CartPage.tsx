export default function CartPage() {
  return (
    <section className="space-y-4">
      <h1 className="font-display text-2xl tracking-tight">Cart</h1>
      <p className="text-muted-foreground max-w-xl">
        Live tier recompute: a 49-unit cart shows Tier-2 pricing; bump to 50 and Tier-3 kicks in
        automatically (the customer is never priced worse than their stored tier). See{' '}
        <code>docs/architecture/PRICING-ENGINE.md</code>.
      </p>
      <p className="text-xs text-muted-foreground">Ships in Phase 3.</p>
    </section>
  );
}
