import posthog from 'posthog-js';

let initialized = false;

export function initAnalytics(): void {
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com';
  if (!key) return;

  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    capture_pageview: true,
    autocapture: false,
    persistence: 'localStorage+cookie',
    respect_dnt: true,
  });
  initialized = true;
}

export function identifyUser(accountId: string, traits?: Record<string, unknown>): void {
  if (!initialized) return;
  // Identify by account_id only (per docs/security/DATA-CLASSIFICATION.md).
  posthog.identify(accountId, traits);
}

export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}
