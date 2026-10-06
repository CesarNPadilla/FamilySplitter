import { parseCents, assertCurrency, type Currency } from './money';
import {
  splitEqual,
  splitCustom,
  splitPercentages,
  type SplitShare,
} from './split';

export type SplitMode = 'equal' | 'custom' | 'percentage';
export interface ExpenseDraft {
  description: string;
  amount: string;
  currency: Currency;
  paidBy: string;
  splitMode: SplitMode;
  memberIds: string[];
  customAmounts: Record<string, string>;
  percentages: Record<string, string>;
}
export type ValidationCode =
  | 'descriptionRequired'
  | 'amountInvalid'
  | 'currencyInvalid'
  | 'payeeRequired'
  | 'participantsRequired'
  | 'duplicateMember'
  | 'unknownMember'
  | 'customInvalid'
  | 'percentageInvalid';
export class ExpenseValidationError extends Error {
  constructor(public code: ValidationCode) {
    super(code);
  }
}
export function prepareExpense(
  draft: ExpenseDraft,
  knownIds: readonly string[],
): { totalCents: number; shares: SplitShare[] } {
  if (!draft.description.trim())
    throw new ExpenseValidationError('descriptionRequired');
  let totalCents: number;
  try {
    totalCents = parseCents(draft.amount);
  } catch {
    throw new ExpenseValidationError('amountInvalid');
  }
  try {
    assertCurrency(draft.currency);
  } catch {
    throw new ExpenseValidationError('currencyInvalid');
  }
  if (!knownIds.includes(draft.paidBy))
    throw new ExpenseValidationError('payeeRequired');
  if (!draft.memberIds.length)
    throw new ExpenseValidationError('participantsRequired');
  if (new Set(draft.memberIds).size !== draft.memberIds.length)
    throw new ExpenseValidationError('duplicateMember');
  if (draft.memberIds.some((id) => !knownIds.includes(id)))
    throw new ExpenseValidationError('unknownMember');
  if (draft.splitMode === 'equal')
    return {
      totalCents,
      shares: splitEqual(totalCents, draft.memberIds, draft.paidBy),
    };
  try {
    return {
      totalCents,
      shares:
        draft.splitMode === 'custom'
          ? splitCustom(
              totalCents,
              draft.memberIds.map((memberId) => ({
                memberId,
                amountCents: parseCents(draft.customAmounts[memberId] ?? ''),
              })),
              draft.paidBy,
            )
          : splitPercentages(
              totalCents,
              draft.memberIds.map((memberId) => ({
                memberId,
                percentage: draft.percentages[memberId] ?? '',
              })),
              draft.paidBy,
            ),
    };
  } catch {
    throw new ExpenseValidationError(
      draft.splitMode === 'custom' ? 'customInvalid' : 'percentageInvalid',
    );
  }
}
export function centsInput(cents: number): string {
  const amount = BigInt(cents);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
}
