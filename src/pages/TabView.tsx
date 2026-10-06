import { useCallback } from 'react';
import { messages } from '../i18n';
import { loadTab } from '../lib/expenses';
import { useResource } from '../lib/use-resource';
import { AppLink } from '../components/AppLink';
import { ResourceNotice } from '../components/ResourceNotice';
import { BalanceSummary } from '../components/BalanceSummary';
import { ExpenseCard } from '../components/ExpenseCard';

export function TabView({
  tabId,
  actorId,
}: {
  tabId: string;
  actorId: string;
}) {
  const resource = useResource(useCallback(() => loadTab(tabId), [tabId]));
  return (
    <div className="flex flex-col gap-5">
      <AppLink to="/dashboard">{messages.expenses.backToTabs}</AppLink>
      {resource.status !== 'ready' ? (
        <ResourceNotice status={resource.status} retry={resource.retry} />
      ) : (
        <>
          <BalanceSummary expenses={resource.data.expenses} actorId={actorId} />
          <AppLink to="/settle">{messages.payments.title}</AppLink>
          <button className="secondary-button" onClick={resource.retry}>
            {messages.payments.refresh}
          </button>
          <header>
            <h2 className="break-words text-3xl font-semibold">
              {resource.data.tab.name}
            </h2>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              {messages.expenses.currencyNote}
            </p>
          </header>
          <AppLink
            to={`/tabs/${tabId}/new`}
            className="primary-button inline-flex items-center justify-center"
          >
            {messages.expenses.add}
          </AppLink>
          {resource.data.expenses.length === 0 ? (
            <p className="panel">{messages.expenses.empty}</p>
          ) : (
            resource.data.expenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                members={resource.data.members}
                actorId={actorId}
                onDeleted={resource.retry}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
