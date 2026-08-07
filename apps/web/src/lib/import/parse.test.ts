import { describe, expect, it } from 'vitest';
import { detectImportFile } from './parse';
import { buildHylaLikeWorkbook, FIXTURE_ROWS } from './__fixtures__/hylaLikeWorkbook';

describe('detectImportFile', () => {
  it('skips the decorative cover sheet and finds the real data sheet + header row', () => {
    const bytes = buildHylaLikeWorkbook();
    const result = detectImportFile(bytes);

    expect(result.best).not.toBeNull();
    expect(result.best?.sheetName).toBe('New Availability');
    expect(result.best?.headerRowIndex).toBe(0);
  });

  it('returns every data row after the header, keyed by header text', () => {
    const bytes = buildHylaLikeWorkbook();
    const result = detectImportFile(bytes);

    expect(result.best?.rows).toHaveLength(FIXTURE_ROWS.length);
    expect(result.best?.headers).toContain('Make');
    expect(result.best?.headers).toContain('Quantity');
    expect(result.best?.rows[0]?.Make).toBe('Acme');
  });

  it('scores the cover sheet lower than the data sheet', () => {
    const bytes = buildHylaLikeWorkbook();
    const result = detectImportFile(bytes);

    const coverCandidates = result.candidates.filter((c) => c.sheetName === 'Cover Page');
    const dataCandidates = result.candidates.filter((c) => c.sheetName === 'New Availability');
    const bestCover = Math.max(...coverCandidates.map((c) => c.confidence));
    const bestData = Math.max(...dataCandidates.map((c) => c.confidence));
    expect(bestData).toBeGreaterThan(bestCover);
  });
});
