import * as Sentry from '@sentry/react';
import type { ErrorEvent, EventHint } from '@sentry/react';

/**
 * Sentry wiring — initialized ONLY when VITE_SENTRY_DSN is set, so the
 * deployed app is completely unaffected until Denis adds a DSN (no-op when
 * unset). Per docs/security/DATA-CLASSIFICATION.md §4, events are PII-scrubbed
 * before transmission: email/phone/address fields, auth headers, and tokens
 * never reach Sentry — only opaque UUID correlation IDs do.
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Bearer/JWT-ish and obvious secret query params.
const TOKEN_RE = /(bearer\s+[a-z0-9._-]+|eyj[a-z0-9._-]{10,}|(access|refresh|api|secret|token|password|apikey)[_-]?(key|token)?["'\s:=]+[a-z0-9._-]{6,})/gi;

/** Keys whose VALUE is dropped entirely wherever they appear in the event. */
const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'phone_number',
  'address',
  'shipping_address',
  'ship_to',
  'tax_id',
  'password',
  'authorization',
  'cookie',
  'access_token',
  'refresh_token',
  'apikey',
  'api_key',
  'token',
]);

/** Redacts free-text that may embed an email or a token. Exported for tests. */
export function scrubString(value: string): string {
  return value.replace(EMAIL_RE, '[redacted-email]').replace(TOKEN_RE, '[redacted-token]');
}

/** Deep-scrub an arbitrary value: drop sensitive keys, redact strings. */
function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return value; // bound recursion on pathological payloads
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[redacted]' : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * beforeSend hook. Pure and exported so it is unit-tested without a live
 * Sentry client. Strips PII from the user record (keeps only the opaque id),
 * request headers/cookies/query, breadcrumb messages, and any string data on
 * the event.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  // User: keep only the opaque id; drop email/username/ip/anything else.
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
  }

  // Request: drop headers (auth/cookie) and cookies; redact url + query.
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    if (typeof event.request.url === 'string') event.request.url = scrubString(event.request.url);
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubString(event.request.query_string);
    }
    if (event.request.data) event.request.data = scrubValue(event.request.data);
  }

  // Exception messages + breadcrumbs can echo user input.
  if (event.message) event.message = scrubString(event.message);
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (typeof b.message === 'string') b.message = scrubString(b.message);
      if (b.data) b.data = scrubValue(b.data) as Record<string, unknown>;
    }
  }
  if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;

  return event;
}

let started = false;

/** Idempotent init. No-op unless VITE_SENTRY_DSN is set. */
export function initSentry(): void {
  if (started) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_ENV ?? import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0, // no session replay — it can capture PII/DOM
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
  started = true;
}

/** Tag the current user by opaque UUID only (never email). */
export function setSentryUser(id: string | null): void {
  if (!started) return;
  Sentry.setUser(id ? { id } : null);
}
