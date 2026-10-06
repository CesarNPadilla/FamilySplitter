import { describe, expect, it } from 'vitest';
import { splitCustom, splitEqual, splitPercentages } from '../../src/lib/split';

const amounts = (shares: ReturnType<typeof splitEqual>) =>
  shares.map((item) => item.amountCents);

describe('equal splits (primary mode)', () => {
  it.each([
    [200000, ['b', 'a'], 'a', [100000, 100000]],
    [300000, ['c', 'a', 'b'], 'a', [100000, 100000, 100000]],
    [10000, ['c', 'a', 'b'], 'b', [3333, 3334, 3333]],
    [1, ['c', 'a', 'b'], 'b', [0, 1, 0]],
    [10000, ['c', 'a', 'b'], 'payee', [3334, 3333, 3333]],
    [2, ['c', 'a', 'b'], 'payee', [1, 1, 0]],
    [1, ['c', 'a', 'b'], 'payee', [1, 0, 0]],
    [101, ['c'], 'payee', [101]],
    [101, ['c'], 'c', [101]],
    [0, ['b', 'a'], 'a', [0, 0]],
  ])('allocates %i cents exactly', (total, ids, payee, expected) => {
    const result = splitEqual(total, ids, payee);
    expect(amounts(result)).toEqual(expected);
    expect(result.reduce((sum, item) => sum + item.amountCents, 0)).toBe(total);
  });

  it('puts the whole remainder on a participating payee', () => {
    expect(amounts(splitEqual(2, ['a', 'b', 'c'], 'c'))).toEqual([0, 0, 2]);
  });

  it('is reproducible and does not mutate participant selection', () => {
    const ids = ['c', 'a', 'b'];
    expect(splitEqual(10001, ids, 'payee')).toEqual(
      splitEqual(10001, ['b', 'c', 'a'], 'payee'),
    );
    expect(ids).toEqual(['c', 'a', 'b']);
  });

  it('settles only the payee own share at creation', () => {
    expect(splitEqual(200000, ['a', 'b'], 'a')).toEqual([
      {
        memberId: 'a',
        amountCents: 100000,
        payorMarkedPaid: true,
        payeeConfirmed: true,
      },
      {
        memberId: 'b',
        amountCents: 100000,
        payorMarkedPaid: false,
        payeeConfirmed: false,
      },
    ]);
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid money %s',
    (total) => {
      expect(() => splitEqual(total, ['a'], 'a')).toThrow();
    },
  );

  it('rejects empty selection, duplicate members, and missing IDs', () => {
    expect(() => splitEqual(1, [], 'a')).toThrow();
    expect(() => splitEqual(1, ['a', 'a'], 'a')).toThrow(/Duplicate/);
    expect(() => splitEqual(1, [' '], 'a')).toThrow();
    expect(() => splitEqual(1, ['a'], '')).toThrow();
  });

  it('conserves money for small totals and all participant/payee combinations', () => {
    for (let count = 1; count <= 5; count++) {
      const ids = Array.from({ length: count }, (_, index) => String(index));
      for (let total = 0; total <= 101; total++) {
        for (const payee of [...ids, 'outside']) {
          const result = splitEqual(total, ids, payee);
          expect(result.reduce((sum, item) => sum + item.amountCents, 0)).toBe(
            total,
          );
          expect(
            result.every(
              (item) =>
                Number.isSafeInteger(item.amountCents) && item.amountCents >= 0,
            ),
          ).toBe(true);
          if (payee === 'outside')
            expect(
              Math.max(...amounts(result)) - Math.min(...amounts(result)),
            ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('handles the maximum safe total exactly', () => {
    const result = splitEqual(
      Number.MAX_SAFE_INTEGER,
      ['a', 'b', 'c'],
      'outside',
    );
    expect(
      result.reduce((sum, item) => sum + BigInt(item.amountCents), 0n),
    ).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });
});

describe('custom splits', () => {
  it('preserves supplied amounts and settles a participating payee', () => {
    const result = splitCustom(
      100,
      [
        { memberId: 'b', amountCents: 25 },
        { memberId: 'a', amountCents: 75 },
      ],
      'a',
    );
    expect(amounts(result)).toEqual([75, 25]);
    expect(result[0].payeeConfirmed).toBe(true);
  });
  it('rejects amounts that do not sum to the total', () => {
    expect(() =>
      splitCustom(100, [{ memberId: 'a', amountCents: 99 }], 'a'),
    ).toThrow(/sum/);
  });
  it('rejects duplicate members and fractional amounts', () => {
    expect(() =>
      splitCustom(
        2,
        [
          { memberId: 'a', amountCents: 1 },
          { memberId: 'a', amountCents: 1 },
        ],
        'a',
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      splitCustom(1, [{ memberId: 'a', amountCents: 0.5 }], 'a'),
    ).toThrow();
  });
});

describe('percentage splits', () => {
  it('uses largest remainders and member ID ties regardless of payee', () => {
    const input = [
      { memberId: 'c', percentage: '33.33' },
      { memberId: 'b', percentage: '33.33' },
      { memberId: 'a', percentage: '33.34' },
    ];
    expect(amounts(splitPercentages(1, input, 'c'))).toEqual([1, 0, 0]);
    expect(
      amounts(
        splitPercentages(
          2,
          [
            { memberId: 'b', percentage: '50' },
            { memberId: 'a', percentage: '50' },
          ],
          'outside',
        ),
      ),
    ).toEqual([1, 1]);
    expect(
      amounts(
        splitPercentages(
          1,
          [
            { memberId: 'b', percentage: '50' },
            { memberId: 'a', percentage: '50' },
          ],
          'b',
        ),
      ),
    ).toEqual([1, 0]);
    expect(splitPercentages(101, input, 'c')).toEqual(
      splitPercentages(101, [...input].reverse(), 'c'),
    );
  });
  it('accepts decimal percentages exactly, including mixed precision and zero', () => {
    expect(
      amounts(
        splitPercentages(
          10000,
          [
            { memberId: 'a', percentage: '12.500' },
            { memberId: 'b', percentage: '87.5' },
            { memberId: 'c', percentage: '0' },
          ],
          'a',
        ),
      ),
    ).toEqual([1250, 8750, 0]);
  });
  it('uses exact arithmetic for large products', () => {
    const shares = splitPercentages(
      Number.MAX_SAFE_INTEGER,
      [
        { memberId: 'a', percentage: '99.999999999999999999' },
        { memberId: 'b', percentage: '0.000000000000000001' },
      ],
      'a',
    );
    expect(amounts(shares)).toEqual([Number.MAX_SAFE_INTEGER, 0]);
  });
  it.each(['99.99', '100.01', '-1', 'NaN', '1e2'])(
    'rejects invalid percentage %s',
    (percentage) => {
      expect(() =>
        splitPercentages(100, [{ memberId: 'a', percentage }], 'a'),
      ).toThrow();
    },
  );
  it('rejects duplicate members and empty selections', () => {
    expect(() =>
      splitPercentages(
        1,
        [
          { memberId: 'a', percentage: '50' },
          { memberId: 'a', percentage: '50' },
        ],
        'a',
      ),
    ).toThrow(/Duplicate/);
    expect(() => splitPercentages(1, [], 'a')).toThrow();
  });
});
