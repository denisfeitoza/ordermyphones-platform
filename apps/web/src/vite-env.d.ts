/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // Canonical public URL for customer-facing links (invite + reset). Set on the
  // host to the real domain; falls back to the production domain otherwise.
  readonly VITE_PUBLIC_SITE_URL?: string;
  // All OPTIONAL — the app runs unchanged when unset (no-op observability).
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
