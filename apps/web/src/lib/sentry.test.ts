import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { scrubString, scrubEvent } from './sentry';

/** Deliverable 1 guard: Sentry events must never carry PII
 *  (docs/security/DATA-CLASSIFICATION.md §4). These assert the beforeSend hook
 *  strips emails, tokens, sensitive keys, and reduces the user to its UUID. */

describe('scrubString', () => {
  it('redacts email addresses', () => {
    expect(scrubString('contact jane.doe@example.com now')).toBe('contact [redacted-email] now');
  });
  it('redacts bearer / JWT-ish tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123def456';
    expect(scrubString(`Authorization: Bearer ${jwt}`)).toContain('[redacted-token]');
    expect(scrubString(`Authorization: Bearer ${jwt}`)).not.toContain(jwt);
  });
  it('leaves clean strings untouched', () => {
    expect(scrubString('order 4F2A approved')).toBe('order 4F2A approved');
  });
});

describe('scrubEvent', () => {
  it('reduces the user record to its opaque id only', () => {
    const ev = { user: { id: 'uuid-123', email: 'jane@example.com', username: 'jane', ip_address: '1.2.3.4' } } as unknown as ErrorEvent;
    const out = scrubEvent(ev);
    expect(out.user).toEqual({ id: 'uuid-123' });
    expect(JSON.stringify(out)).not.toContain('jane@example.com');
    expect(JSON.stringify(out)).not.toContain('1.2.3.4');
  });

  it('drops request headers/cookies and redacts the url', () => {
    const ev = {
      request: {
        url: 'https://app/checkout?email=jane@example.com',
        headers: { Authorization: 'Bearer secret', Cookie: 'sb-access-token=abc' },
        cookies: { 'sb-access-token': 'abc' },
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev);
    expect(out.request?.headers).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.url).not.toContain('jane@example.com');
  });

  it('redacts sensitive keys nested in extra/contexts', () => {
    const ev = {
      extra: { shipping_address: '1 Main St', phone: '+15551234', order_ref: 'ABCD1234' },
    } as unknown as ErrorEvent;
    const out = scrubEvent(ev);
    expect(out.extra?.shipping_address).toBe('[redacted]');
    expect(out.extra?.phone).toBe('[redacted]');
    expect(out.extra?.order_ref).toBe('ABCD1234'); // non-sensitive keys survive
  });

  it('scrubs breadcrumb messages', () => {
    const ev = { breadcrumbs: [{ message: 'signed in as jane@example.com' }] } as unknown as ErrorEvent;
    const out = scrubEvent(ev);
    expect(out.breadcrumbs?.[0].message).toBe('signed in as [redacted-email]');
  });
});
