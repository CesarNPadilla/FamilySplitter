import { messages } from '../i18n';
import { computeBalances } from '../lib/balances';
import { formatCents } from '../lib/money';
import type { SavedExpense } from '../lib/expenses';

export function BalanceSummary({
  expenses,
  actorId,
}: {
  expenses: SavedExpense[];
  actorId: string;
}) {
  const balances = computeBalances(
    expenses,
    expenses.flatMap((expense) =>
      expense.shares.map((share) => ({ ...share, expenseId: expense.id })),
    ),
  )[actorId];
  return (
    <section className="panel" aria-label={messages.payments.balances}>
      <h3 className="text-xl font-semibold">{messages.payments.balances}</h3>
      <p className="mt-2 text-sm">{messages.payments.note}</p>
      {(['USD', 'MXN'] as const).map((currency) => (
        <div key={currency} className="mt-4" aria-label={currency}>
          <h4 className="font-semibold">
            {messages.expenses.currencies[currency]}
          </h4>
          <p>
            {messages.payments.owed}:{' '}
            <span className="tabular-nums">
              {formatCents(balances?.[currency].amountOwedCents ?? 0, currency)}
            </span>
          </p>
          <p>
            {messages.payments.owedTo}:{' '}
            <span className="tabular-nums">
              {formatCents(
                balances?.[currency].amountOwedToThemCents ?? 0,
                currency,
              )}
            </span>
          </p>
        </div>
      ))}
    </section>
  );
}
