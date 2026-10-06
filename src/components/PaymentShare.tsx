import { useState } from 'react';
import { messages } from '../i18n';
import { shareStatus } from '../lib/balances';
import { formatCents } from '../lib/money';
import {
  updatePayment,
  ExpenseWriteDenied,
  type SavedExpense,
  type SavedShare,
} from '../lib/expenses';

export function PaymentShare({
  share,
  expense,
  actorId,
  name,
  onChanged,
}: {
  share: SavedShare;
  expense: SavedExpense;
  actorId: string;
  name: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = shareStatus(share);
  const action =
    share.memberId === expense.paidBy
      ? null
      : actorId === share.memberId && status === 'to-be-paid'
        ? 'mark'
        : actorId === expense.paidBy && status === 'awaiting-confirmation'
          ? 'confirm'
          : null;
  const submit = async () => {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updatePayment(share.id, action);
      onChanged();
    } catch (failure) {
      setError(
        failure instanceof ExpenseWriteDenied
          ? messages.payments.denied
          : messages.payments.failed,
      );
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-col gap-3 py-3" aria-label={name}>
      <div className="flex flex-wrap justify-between gap-2">
        <span className="break-words">{name}</span>
        <span className="tabular-nums">
          {formatCents(share.amountCents, expense.currency)}
        </span>
      </div>
      <span
        className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${status === 'settled' ? 'bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100' : status === 'awaiting-confirmation' ? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100' : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100'}`}
      >
        {messages.payments.statuses[status]}
      </span>
      {action && (
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? messages.payments.saving : messages.payments[action]}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </li>
  );
}
