import { describe, expect, it } from 'vitest';
import {
  computeBalances,
  shareStatus,
  type ExpenseShare,
} from '../../src/lib/balances';
import { splitEqual } from '../../src/lib/split';

const expenses = [
  { id: 'travel', paidBy: 'a', currency: 'USD' as const },
  { id: 'property', paidBy: 'a', currency: 'MXN' as const },
];
const sampleShares = (): ExpenseShare[] => [
  ...splitEqual(200000, ['a', 'b'], 'a').map((item) => ({
    ...item,
    expenseId: 'travel',
  })),
  ...splitEqual(300000, ['a', 'b', 'c'], 'a').map((item) => ({
    ...item,
    expenseId: 'property',
  })),
];

describe('balances', () => {
  it('reproduces travel and property examples without mixing currencies', () => {
    const balances = computeBalances(expenses, sampleShares());
    expect(balances.a).toEqual({
      USD: { amountOwedCents: 0, amountOwedToThemCents: 100000 },
      MXN: { amountOwedCents: 0, amountOwedToThemCents: 200000 },
    });
    expect(balances.b).toEqual({
      USD: { amountOwedCents: 100000, amountOwedToThemCents: 0 },
      MXN: { amountOwedCents: 100000, amountOwedToThemCents: 0 },
    });
    expect(balances.c.USD.amountOwedCents).toBe(0);
    expect(balances.c.MXN.amountOwedCents).toBe(100000);
  });
  it.each([
    [false, false, 'to-be-paid', 100000],
    [true, false, 'awaiting-confirmation', 100000],
    [false, true, 'to-be-paid', 100000],
    [true, true, 'settled', 0],
  ] as const)(
    'requires both flags (%s, %s) to settle',
    (paid, confirmed, status, owed) => {
      const shares = sampleShares();
      shares[1] = {
        ...shares[1],
        payorMarkedPaid: paid,
        payeeConfirmed: confirmed,
      };
      expect(shareStatus(shares[1])).toBe(status);
      const balances = computeBalances(expenses, shares);
      expect(balances.b.USD.amountOwedCents).toBe(owed);
      expect(balances.a.USD.amountOwedToThemCents).toBe(owed);
    },
  );
  it('retains both directions rather than cancelling outstanding obligations', () => {
    const balances = computeBalances(
      [...expenses, { id: 'return', paidBy: 'b', currency: 'USD' }],
      [
        ...sampleShares(),
        {
          expenseId: 'return',
          memberId: 'a',
          amountCents: 40000,
          payorMarkedPaid: false,
          payeeConfirmed: false,
        },
      ],
    );
    expect(balances.a.USD).toEqual({
      amountOwedCents: 40000,
      amountOwedToThemCents: 100000,
    });
    expect(balances.b.USD).toEqual({
      amountOwedCents: 100000,
      amountOwedToThemCents: 40000,
    });
  });
  it('ignores self obligations even if imported flags are unset', () => {
    expect(
      computeBalances(
        [expenses[0]],
        [
          {
            expenseId: 'travel',
            memberId: 'a',
            amountCents: 100000,
            payorMarkedPaid: false,
            payeeConfirmed: false,
          },
        ],
      ).a.USD,
    ).toEqual({ amountOwedCents: 0, amountOwedToThemCents: 0 });
  });
  it('returns empty results for empty input and zero balances for known members', () => {
    expect(computeBalances([], [])).toEqual({});
    expect(computeBalances(expenses, []).a.USD.amountOwedCents).toBe(0);
  });
  it('rejects orphan shares, duplicate records, and overflowing totals', () => {
    const shares = sampleShares();
    expect(() => computeBalances([], shares)).toThrow(/unknown/);
    expect(() => computeBalances([expenses[0], expenses[0]], [])).toThrow(
      /Duplicate/,
    );
    expect(() => computeBalances(expenses, [...shares, shares[1]])).toThrow(
      /Duplicate/,
    );
    const large = { ...shares[1], amountCents: Number.MAX_SAFE_INTEGER };
    expect(() =>
      computeBalances(
        [...expenses, { id: 'other', paidBy: 'a', currency: 'USD' }],
        [large, { ...large, expenseId: 'other', amountCents: 1 }],
      ),
    ).toThrow(/safe/);
  });
  it('supports arbitrary member ID keys safely', () => {
    const balances = computeBalances(
      [{ id: 'x', paidBy: '__proto__', currency: 'USD' }],
      [
        {
          expenseId: 'x',
          memberId: 'constructor',
          amountCents: 1,
          payorMarkedPaid: false,
          payeeConfirmed: false,
        },
      ],
    );
    expect(balances['__proto__'].USD.amountOwedToThemCents).toBe(1);
    expect(balances['constructor'].USD.amountOwedCents).toBe(1);
  });
});
