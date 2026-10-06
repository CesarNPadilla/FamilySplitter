import { messages } from '../i18n';
import { loadLedger } from '../lib/expenses';
import { shareStatus } from '../lib/balances';
import { useResource } from '../lib/use-resource';
import { AppLink } from '../components/AppLink';
import { ResourceNotice } from '../components/ResourceNotice';
import { BalanceSummary } from '../components/BalanceSummary';
import { PaymentShare } from '../components/PaymentShare';

export function Settle({ actorId }: { actorId: string }) {
  const resource = useResource(loadLedger);
  if (resource.status !== 'ready')
    return <ResourceNotice status={resource.status} retry={resource.retry} />;
  const { expenses, members } = resource.data;
  const name = (id: string) =>
    members.find((member) => member.id === id)?.name ??
    messages.expenses.unknownMember;
  const pending = expenses.flatMap((expense) =>
    expense.shares
      .filter(
        (share) =>
          share.memberId !== expense.paidBy &&
          shareStatus(share) !== 'settled' &&
          (share.memberId === actorId || expense.paidBy === actorId),
      )
      .map((share) => ({ expense, share })),
  );
  return (
    <div className="flex flex-col gap-5">
      <AppLink to="/dashboard">{messages.expenses.backToTabs}</AppLink>
      <h2 className="text-3xl font-semibold">{messages.payments.title}</h2>
      <BalanceSummary expenses={expenses} actorId={actorId} />
      <button lang="es" className="secondary-button" onClick={resource.retry}>
        {messages.payments.refresh}
      </button>
      {pending.length === 0 ? (
        <p className="panel">{messages.payments.empty}</p>
      ) : (
        pending.map(({ expense, share }) => (
          <article
            className="panel"
            key={share.id}
            aria-label={`${expense.description}: ${name(share.memberId)}`}
          >
            <h3 className="break-words text-xl font-semibold">
              {expense.description}
            </h3>
            <p className="mt-2">
              {messages.payments.from}: {name(share.memberId)} ·{' '}
              {messages.payments.to}: {name(expense.paidBy)}
            </p>
            <ul>
              <PaymentShare
                share={share}
                expense={expense}
                actorId={actorId}
                name={name(share.memberId)}
                onChanged={resource.retry}
              />
            </ul>
            <AppLink to={`/tabs/${expense.tabId}`}>
              {messages.expenses.backToTab}
            </AppLink>
          </article>
        ))
      )}
    </div>
  );
}
