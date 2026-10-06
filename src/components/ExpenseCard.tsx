import { useState } from 'react';
import { messages } from '../i18n';
import { formatCents } from '../lib/money';
import {
  canManageExpense,
  deleteExpense,
  ExpenseWriteDenied,
  type SavedExpense,
  type FamilyMember,
} from '../lib/expenses';
import { AppLink } from './AppLink';

export function ExpenseCard({
  expense,
  members,
  actorId,
  onDeleted,
}: {
  expense: SavedExpense;
  members: FamilyMember[];
  actorId: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) =>
    members.find((member) => member.id === id)?.name ??
    messages.expenses.unknownMember;
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteExpense(expense.id);
      onDeleted();
    } catch (failure) {
      setError(
        failure instanceof ExpenseWriteDenied
          ? messages.expenses.writeDenied
          : messages.expenses.deleteFailed,
      );
      setDeleting(false);
    }
  };
  return (
    <article className="panel" aria-label={expense.description}>
      <h3 className="break-words text-xl font-semibold">
        {expense.description}
      </h3>
      <p className="mt-2 text-xl font-semibold tabular-nums">
        {formatCents(expense.totalCents, expense.currency)}
      </p>
      <p className="mt-2">
        {messages.expenses.paidBy}: {name(expense.paidBy)}
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {messages.expenses.splitMode}:{' '}
        {messages.expenses.modes[expense.splitMode]}
      </p>
      <ul
        aria-label={messages.expenses.shares}
        className="mt-4 divide-y divide-slate-200 dark:divide-slate-700"
      >
        {expense.shares.map((share) => (
          <li
            key={share.id}
            className="flex flex-wrap justify-between gap-2 py-3"
          >
            <span className="break-words">{name(share.memberId)}</span>
            <span className="tabular-nums">
              {formatCents(share.amountCents, expense.currency)}
            </span>
          </li>
        ))}
      </ul>
      {canManageExpense(expense, actorId) && (
        <div className="mt-4 flex flex-wrap gap-3">
          <AppLink to={`/tabs/${expense.tabId}/expenses/${expense.id}/edit`}>
            {messages.expenses.edit}
          </AppLink>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setConfirming(true)}
            disabled={deleting}
          >
            {messages.expenses.delete}
          </button>
        </div>
      )}
      {confirming && (
        <div className="mt-4 rounded-lg border border-red-300 p-4 dark:border-red-800">
          <p>{messages.expenses.deleteConfirm}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="secondary-button"
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting
                ? messages.expenses.deleting
                : messages.expenses.confirmDelete}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={deleting}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
            >
              {messages.expenses.cancel}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4">
          {error}
        </p>
      )}
    </article>
  );
}
