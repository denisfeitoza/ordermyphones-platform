export default function CatalogPage() {
  return (
    <section className="space-y-4">
      <h1 className="font-display text-2xl tracking-tight">Catalog</h1>
      <p className="text-muted-foreground max-w-xl">
        Filtered catalog with smart search by brand, model, color, condition, and price range.
        Live stock is aggregated from two supplier integrations (US dropship × 2 + Dubai wholesale,
        consolidated). Detailed UX in <code>docs/ux/INFORMATION-ARCHITECTURE.md</code>.
      </p>
      <p className="text-xs text-muted-foreground">
        This scaffold renders an empty grid; the catalog ships in Phase 3.
      </p>
    </section>
  );
}
