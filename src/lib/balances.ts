import { assertCents, assertCurrency, safeCents, type Currency } from './money';
import type { SplitShare } from './split';

export interface BalanceExpense {
  id: string;
  paidBy: string;
  currency: Currency;
}
export interface ExpenseShare extends SplitShare {
  expenseId: string;
}
export type ShareStatus = 'to-be-paid' | 'awaiting-confirmation' | 'settled';
export interface CurrencyBalance {
  amountOwedCents: number;
  amountOwedToThemCents: number;
}
export type MemberBalances = Record<string, Record<Currency, CurrencyBalance>>;

export function shareStatus(
  share: Pick<SplitShare, 'payorMarkedPaid' | 'payeeConfirmed'>,
): ShareStatus {
  if (!share.payorMarkedPaid) return 'to-be-paid';
  return share.payeeConfirmed ? 'settled' : 'awaiting-confirmation';
}

/** Outstanding gross obligations, separated by currency; no cross-currency netting. */
export function computeBalances(
  expenses: readonly BalanceExpense[],
  shares: readonly ExpenseShare[],
): MemberBalances {
  const result: MemberBalances = Object.create(null) as MemberBalances;
  const ensureMember = (id: string) => {
    if (!id.trim()) throw new Error('Member IDs cannot be empty');
    result[id] ??= {
      USD: { amountOwedCents: 0, amountOwedToThemCents: 0 },
      MXN: { amountOwedCents: 0, amountOwedToThemCents: 0 },
    };
  };
  const byId = new Map<string, BalanceExpense>();
  for (const expense of expenses) {
    if (byId.has(expense.id)) throw new Error('Duplicate expense');
    assertCurrency(expense.currency);
    ensureMember(expense.paidBy);
    byId.set(expense.id, expense);
  }
  const seen = new Map<string, Set<string>>();
  for (const item of shares) {
    const expense = byId.get(item.expenseId);
    if (!expense) throw new Error('Share references an unknown expense');
    const members = seen.get(item.expenseId) ?? new Set<string>();
    if (members.has(item.memberId))
      throw new Error('Duplicate member per expense');
    members.add(item.memberId);
    seen.set(item.expenseId, members);
    assertCents(item.amountCents);
    ensureMember(item.memberId);
    if (shareStatus(item) === 'settled' || item.memberId === expense.paidBy)
      continue;
    const payor = result[item.memberId][expense.currency];
    const payee = result[expense.paidBy][expense.currency];
    payor.amountOwedCents = safeCents(
      BigInt(payor.amountOwedCents) + BigInt(item.amountCents),
    );
    payee.amountOwedToThemCents = safeCents(
      BigInt(payee.amountOwedToThemCents) + BigInt(item.amountCents),
    );
  }
  return result;
}
