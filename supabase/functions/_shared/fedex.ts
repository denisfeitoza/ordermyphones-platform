// supabase/functions/_shared/fedex.ts
// Shared FedEx client for the shipping edge functions (rate + track).
// Contract: docs/integrations/SHIPMENT-TRACKING.md.
//
// The client id/secret NEVER reach the browser: both callers are edge
// functions. Sandbox is the default base URL, so an unconfigured or
// half-configured environment can only ever talk to FedEx's test host.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno globals are not in this TS server config; resolved at deploy time.

const BASE = (Deno.env.get('FEDEX_API_BASE') ?? 'https://apis-sandbox.fedex.com').replace(/\/$/, '');
const CLIENT_ID = Deno.env.get('FEDEX_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('FEDEX_CLIENT_SECRET') ?? '';
const ACCOUNT_NUMBER = Deno.env.get('FEDEX_ACCOUNT_NUMBER') ?? '';

export const FEDEX_BASE = BASE;
export const FEDEX_ACCOUNT = ACCOUNT_NUMBER;
export const fedexIsSandbox = () => BASE.includes('sandbox');

/** Every route answers 503 fedex_not_configured rather than guessing. */
export function fedexConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && ACCOUNT_NUMBER);
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// OAuth2 client-credentials token, cached in the isolate. FedEx tokens last
// 3600s; refresh 60s early so an in-flight call never races the expiry.
let cached: { token: string; expiresAt: number } | null = null;

export async function fedexToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) {
    throw new FedexError(`oauth_failed:${res.status}`, body);
  }
  cached = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000,
  };
  return cached.token;
}

export class FedexError extends Error {
  detail: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.detail = detail;
  }
}

export async function fedexPost(path: string, payload: unknown): Promise<any> {
  const token = await fedexToken();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-locale': 'en_US',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FedEx errors come back as { errors: [{ code, message }] }.
    const first = body?.errors?.[0];
    throw new FedexError(first?.code ? `fedex:${first.code}` : `fedex_http_${res.status}`, body?.errors ?? body);
  }
  return body;
}

/** Normalized status vocabulary — matches shipment_tracking.status. */
export type TrackingStatus =
  | 'queued'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned'
  | 'unknown';

/** FedEx derivedCode → our vocabulary. Unmapped/absent codes stay 'unknown'
 * rather than being guessed into a state that drives UI and notifications. */
export function mapTrackingStatus(code: string | null | undefined): TrackingStatus {
  switch ((code ?? '').toUpperCase()) {
    case 'DL':
      return 'delivered';
    case 'OD':
      return 'out_for_delivery';
    case 'PU':
    case 'IT':
    case 'AR':
    case 'DP':
    case 'AF':
    case 'AP':
    case 'HL':
      return 'in_transit';
    case 'OC':
    case 'IN':
      return 'queued';
    case 'DE':
    case 'SE':
    case 'CA':
    case 'CD':
      return 'exception';
    case 'RS':
    case 'RT':
      return 'returned';
    default:
      return 'unknown';
  }
}
