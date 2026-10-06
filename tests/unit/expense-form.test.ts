import { describe, expect, it } from 'vitest';
import {
  centsInput,
  prepareExpense,
  type ExpenseDraft,
} from '../../src/lib/expense-form';
import { canManageExpense, expensePayload } from '../../src/lib/expenses';
import { parseRoute } from '../../src/lib/navigation';

const draft = (changes: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  description: 'Disney universal',
  amount: '2000.00',
  currency: 'USD',
  paidBy: 'a',
  splitMode: 'equal',
  memberIds: ['b', 'a'],
  customAmounts: {},
  percentages: {},
  ...changes,
});

describe('expense form and persistence boundaries', () => {
  it('prepares both spreadsheet examples in cents', () => {
    expect(
      prepareExpense(draft(), ['a', 'b']).shares.map(
        (share) => share.amountCents,
      ),
    ).toEqual([100000, 100000]);
    expect(
      prepareExpense(
        draft({
          description: 'House title',
          amount: '3000.00',
          currency: 'MXN',
          memberIds: ['a', 'b', 'c'],
        }),
        ['a', 'b', 'c'],
      ).shares.map((share) => share.amountCents),
    ).toEqual([100000, 100000, 100000]);
  });
  it('uses stable remainder distribution without adding the person who paid', () => {
    expect(
      prepareExpense(draft({ amount: '100.00', memberIds: ['d', 'c', 'b'] }), [
        'a',
        'b',
        'c',
        'd',
      ]).shares.map((share) => [share.memberId, share.amountCents]),
    ).toEqual([
      ['b', 3334],
      ['c', 3333],
      ['d', 3333],
    ]);
  });
  it('constructs RPC input without client payment flags or equal-mode amounts', () => {
    expect(expensePayload('tab', draft(), ['a', 'b'])).toEqual({
      p_tab_id: 'tab',
      p_description: 'Disney universal',
      p_total_cents: 200000,
      p_currency: 'USD',
      p_paid_by: 'a',
      p_split_mode: 'equal',
      p_shares: [{ member_id: 'a' }, { member_id: 'b' }],
      p_expense_id: null,
    });
  });
  it('rejects custom sums before any RPC request and preserves exact percentage strings', () => {
    expect(() =>
      expensePayload(
        'tab',
        draft({
          splitMode: 'custom',
          customAmounts: { a: '1000', b: '999.99' },
        }),
        ['a', 'b'],
      ),
    ).toThrow('customInvalid');
    const value = expensePayload(
      'tab',
      draft({
        splitMode: 'percentage',
        percentages: { a: '99.999999999999999999', b: '0.000000000000000001' },
      }),
      ['a', 'b'],
      'expense',
    );
    expect(value.p_shares[0].percentage).toBe('99.999999999999999999');
    expect(value.p_expense_id).toBe('expense');
  });
  it.each([
    [{ description: ' ' }, 'descriptionRequired'],
    [{ amount: '1,000' }, 'amountInvalid'],
    [{ paidBy: 'outsider' }, 'payeeRequired'],
    [{ memberIds: [] }, 'participantsRequired'],
    [{ memberIds: ['a', 'a'] }, 'duplicateMember'],
    [{ memberIds: ['outsider'] }, 'unknownMember'],
    [
      { splitMode: 'percentage', percentages: { a: '50', b: '49' } },
      'percentageInvalid',
    ],
  ] as [Partial<ExpenseDraft>, string][])(
    'returns a dictionary error code for invalid input',
    (changes, code) => {
      expect(() => prepareExpense(draft(changes), ['a', 'b'])).toThrow(code);
    },
  );
  it('allows only the creator or person who paid to manage', () => {
    expect(canManageExpense({ createdBy: 'a', paidBy: 'b' }, 'a')).toBe(true);
    expect(canManageExpense({ createdBy: 'a', paidBy: 'b' }, 'b')).toBe(true);
    expect(canManageExpense({ createdBy: 'a', paidBy: 'b' }, 'c')).toBe(false);
  });
  it('prefills the largest safe cent amount without rounding', () => {
    expect(centsInput(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91');
  });
  it('parses protected nested routes and rejects malformed IDs', () => {
    const tab = '00000000-0000-0000-0000-000000000101';
    const expense = '00000000-0000-0000-0000-000000000201';
    expect(parseRoute(`/tabs/${tab}/new`)).toEqual({ page: 'add', tabId: tab });
    expect(parseRoute(`/tabs/${tab}/expenses/${expense}/edit`)).toEqual({
      page: 'edit',
      tabId: tab,
      expenseId: expense,
    });
    expect(parseRoute('/tabs/not-a-uuid')).toEqual({ page: 'unknown' });
  });
});
