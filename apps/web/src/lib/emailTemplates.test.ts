import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATES, renderEmail } from './emailTemplates';

describe('renderEmail', () => {
  const p = { order_id: 'o1', ref: 'SO-ABC', due_at: '2026-11-01T00:00:00Z', token: 'tok', tier: 'wholesale', expires_at: '2026-11-01T00:00:00Z' };
  it('renders every template in every locale', () => {
    for (const name of Object.keys(EMAIL_TEMPLATES)) {
      for (const loc of ['en', 'pt', 'es']) {
        const r = renderEmail(name, loc, p, 'https://omp.test');
        expect(r?.subject.length).toBeGreaterThan(3);
        expect(r?.text.length).toBeGreaterThan(10);
      }
    }
  });
  it('builds the invite link from the token and falls back to English', () => {
    expect(renderEmail('invite', 'fr', p, 'https://omp.test')?.text).toContain('https://omp.test/auth/invite?token=tok');
    expect(renderEmail('nope', 'en', p, 'x')).toBeNull();
  });
});
