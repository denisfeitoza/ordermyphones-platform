import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <section className="space-y-4 max-w-md">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="font-display text-2xl tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist on OrderMyPhones — yet.
      </p>
      <Link to="/" className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm">
        Back to home
      </Link>
    </section>
  );
}
