import { describe, expect, it } from 'vitest';
import { csvCell } from './export';

describe('csvCell', () => {
  it('quotes and escapes double quotes', () => {
    expect(csvCell('a "b" c')).toBe('"a ""b"" c"');
  });
  it('defuses text a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1+1')).toBe(`"'+1+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('-cmd')).toBe(`"'-cmd"`);
    expect(csvCell('\tx')).toBe(`"'\tx"`);
  });
  it('leaves plain numbers alone, negative ones too', () => {
    expect(csvCell(12)).toBe('"12"');
    expect(csvCell('-12.50')).toBe('"-12.50"');
    expect(csvCell('PO-1042')).toBe('"PO-1042"');
  });
});
