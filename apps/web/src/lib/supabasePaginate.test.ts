import { describe, expect, it } from 'vitest';
import { fetchAllPagesParallel } from './supabasePaginate';

describe('fetchAllPagesParallel', () => {
  const rows = Array.from({ length: 2345 }, (_, i) => i);
  const page = (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  it('returns every row once, in order', async () => {
    expect(await fetchAllPagesParallel(page, 500, 4)).toEqual(rows);
  });
  it('stops on an exact multiple of the page size', async () => {
    const exact = Array.from({ length: 1000 }, (_, i) => i);
    expect(await fetchAllPagesParallel((f, t) => Promise.resolve({ data: exact.slice(f, t + 1), error: null }), 500, 4)).toEqual(exact);
  });
});
