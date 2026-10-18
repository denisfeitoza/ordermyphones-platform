import { describe, expect, it } from 'vitest';
import { parseMoneyToCents } from './money';

describe('parseMoneyToCents', () => {
  it.each([
    ['1299', 129900],
    ['1299.5', 129950],
    ['1299,50', 129950],
    [' $ 309.00 ', 30900],
    ['0.99', 99],
    ['1,29', 129],
  ])('parses %s', (input, cents) => expect(parseMoneyToCents(input)).toBe(cents));

  it.each(['1,299.00', '1.299,00', '1,299', '12.345', '', '0', '0.00', '-5', 'abc', '10.999', '1000000.01'])(
    'refuses %s',
    (input) => expect(parseMoneyToCents(input)).toBeNull(),
  );
});
