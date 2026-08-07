/**
 * PostgREST caps an unbounded `select()` at a project-configured page size
 * (1000 rows by default) — a single unbounded query silently truncates once
 * a table crosses that line. Anything that needs to see the FULL table (the
 * canonical export, the real catalog once it grows past a handful of SKUs —
 * the reference HYLA feed alone is 2,675 rows, PRODUCT-CATALOG-STANDARD.md
 * §9) must page through `.range()` explicitly instead of trusting one call.
 *
 * Callers supply a `fetchPage` closure so this stays agnostic of the exact
 * PostgREST query shape (select columns, filters, joins differ per caller);
 * this only owns the range-advance/stop loop.
 */
export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllPages<T>(
  // supabase-js query builders are PromiseLike (thenable via `.then`), not
  // full Promise instances (no `.catch`/`.finally`) until awaited — typing
  // this as PromiseLike lets callers pass `.range(from, to)` directly
  // instead of wrapping every call site in `await` first.
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
