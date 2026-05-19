import { useParams } from 'react-router-dom';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <section className="space-y-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Product</p>
      <h1 className="font-display text-2xl tracking-tight">{slug ?? 'unknown'}</h1>
      <p className="text-muted-foreground max-w-xl">
        Variant matrix (model × storage × color × condition), live cross-supplier stock,
        tier-aware price overlay, and a 3D viewer slot with graceful 2D fallback. Ships in Phase 3.
      </p>
    </section>
  );
}
