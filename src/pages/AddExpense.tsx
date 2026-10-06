import { useCallback } from 'react';
import { messages } from '../i18n';
import { loadTab, canManageExpense } from '../lib/expenses';
import { useResource } from '../lib/use-resource';
import { AppLink } from '../components/AppLink';
import { ResourceNotice } from '../components/ResourceNotice';
import { ExpenseForm } from '../components/ExpenseForm';

export function AddExpense({
  tabId,
  actorId,
  expenseId,
}: {
  tabId: string;
  actorId: string;
  expenseId?: string;
}) {
  const resource = useResource(useCallback(() => loadTab(tabId), [tabId]));
  const expense =
    resource.status === 'ready' && expenseId
      ? resource.data.expenses.find((item) => item.id === expenseId)
      : undefined;
  return (
    <div className="flex flex-col gap-5">
      <AppLink to={`/tabs/${tabId}`}>{messages.expenses.backToTab}</AppLink>
      <h2 className="text-3xl font-semibold">
        {expenseId ? messages.expenses.editTitle : messages.expenses.add}
      </h2>
      {resource.status !== 'ready' ? (
        <ResourceNotice status={resource.status} retry={resource.retry} />
      ) : expenseId && (!expense || !canManageExpense(expense, actorId)) ? (
        <p className="panel" role="alert">
          {messages.expenses.writeDenied}
        </p>
      ) : (
        <>
          <p className="break-words font-medium">{resource.data.tab.name}</p>
          <ExpenseForm
            tabId={tabId}
            actorId={actorId}
            members={resource.data.members}
            expense={expense}
          />
        </>
      )}
    </div>
  );
}
