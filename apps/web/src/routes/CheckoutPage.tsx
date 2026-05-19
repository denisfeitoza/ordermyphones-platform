export default function CheckoutPage() {
  return (
    <section className="space-y-4">
      <h1 className="font-display text-2xl tracking-tight">Checkout</h1>
      <p className="text-muted-foreground max-w-xl">
        Stripe Checkout / Elements (account opened in the Client&apos;s legal name per Agreement §2.7).
        The Platform never sees raw card data; PCI scope stays SAQ-A. See{' '}
        <code>docs/integrations/STRIPE.md</code>.
      </p>
      <p className="text-xs text-muted-foreground">Ships in Phase 3.</p>
    </section>
  );
}
