import { describe, expect, it } from 'vitest';
import { formatCents, parseCents, type Currency } from '../../src/lib/money';

describe('money', () => {
  it.each([
    ['2000.00', 200000],
    ['3000', 300000],
    ['0.01', 1],
    [' 12.3 ', 1230],
    ['000.00', 0],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('parses %s exactly', (input, expected) => {
    expect(parseCents(input)).toBe(expected);
  });
  it.each([
    '',
    '-1',
    '1.001',
    '1e2',
    'NaN',
    '1,000.00',
    '$1',
    '.50',
    '1.',
    '90071992547409.92',
  ])('rejects invalid input %s', (input) => {
    expect(() => parseCents(input)).toThrow();
  });
  it('formats both currencies explicitly and preserves cents at the safe limit', () => {
    expect(formatCents(200000, 'USD')).toBe('USD 2,000.00');
    expect(formatCents(300000, 'MXN')).toBe('MXN 3,000.00');
    expect(formatCents(1, 'USD')).toBe('USD 0.01');
    expect(formatCents(Number.MAX_SAFE_INTEGER, 'MXN')).toBe(
      'MXN 90,071,992,547,409.91',
    );
    expect(formatCents(0, 'MXN')).toBe('MXN 0.00');
  });
  it('rejects unsafe money and unsupported currencies', () => {
    expect(() => formatCents(1.5, 'USD')).toThrow();
    expect(() => formatCents(-1, 'USD')).toThrow();
    expect(() => formatCents(1, 'EUR' as Currency)).toThrow();
  });
});
