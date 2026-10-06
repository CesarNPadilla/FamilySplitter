import { useId, useState, type FormEvent } from 'react';
import { messages } from '../i18n';
import {
  prepareExpense,
  centsInput,
  ExpenseValidationError,
  type ExpenseDraft,
  type SplitMode,
} from '../lib/expense-form';
import { formatCents, type Currency } from '../lib/money';
import {
  saveExpense,
  ExpenseWriteDenied,
  type FamilyMember,
  type SavedExpense,
} from '../lib/expenses';
import { navigate } from '../lib/navigation';
import { AppLink } from './AppLink';

export function ExpenseForm({
  tabId,
  actorId,
  members,
  expense,
}: {
  tabId: string;
  actorId: string;
  members: FamilyMember[];
  expense?: SavedExpense;
}) {
  const prefix = useId();
  const [draft, setDraft] = useState<ExpenseDraft>(() => ({
    description: expense?.description ?? '',
    amount: expense ? centsInput(expense.totalCents) : '',
    currency: expense?.currency ?? 'USD',
    paidBy: expense?.paidBy ?? actorId,
    splitMode: expense?.splitMode ?? 'equal',
    memberIds: expense?.shares.map((share) => share.memberId) ?? [actorId],
    customAmounts: Object.fromEntries(
      expense?.shares.map((share) => [
        share.memberId,
        centsInput(share.amountCents),
      ]) ?? [],
    ),
    percentages: Object.fromEntries(
      expense?.shares.map((share) => [
        share.memberId,
        share.percentage ?? '',
      ]) ?? [],
    ),
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  let preview: ReturnType<typeof prepareExpense> | null = null;
  let validation: string | null = null;
  try {
    preview = prepareExpense(
      draft,
      members.map((member) => member.id),
    );
  } catch (error) {
    validation =
      error instanceof ExpenseValidationError
        ? messages.validation[error.code]
        : messages.expenses.saveFailed;
  }
  const update = <K extends keyof ExpenseDraft>(
    key: K,
    value: ExpenseDraft[K],
  ) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSaveError(null);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preview || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveExpense(
        tabId,
        draft,
        members.map((member) => member.id),
        expense?.id,
      );
      navigate(`/tabs/${tabId}`);
    } catch (error) {
      setSaveError(
        error instanceof ExpenseWriteDenied
          ? messages.expenses.writeDenied
          : messages.expenses.saveFailed,
      );
      setSaving(false);
    }
  };
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="panel flex flex-col gap-5"
    >
      {expense && (
        <p className="rounded-lg bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          {messages.expenses.resetWarning}
        </p>
      )}
      <fieldset disabled={saving} className="flex min-w-0 flex-col gap-5">
        <div>
          <label htmlFor={`${prefix}-description`} className="form-label">
            {messages.expenses.description}
          </label>
          <input
            className="field"
            id={`${prefix}-description`}
            required
            value={draft.description}
            onChange={(event) => update('description', event.target.value)}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${prefix}-amount`} className="form-label">
              {messages.expenses.amount}
            </label>
            <input
              className="field"
              id={`${prefix}-amount`}
              inputMode="decimal"
              autoComplete="off"
              required
              value={draft.amount}
              onChange={(event) => update('amount', event.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${prefix}-currency`} className="form-label">
              {messages.expenses.currency}
            </label>
            <select
              className="field"
              id={`${prefix}-currency`}
              value={draft.currency}
              onChange={(event) =>
                update('currency', event.target.value as Currency)
              }
            >
              {(['USD', 'MXN'] as const).map((currency) => (
                <option key={currency} value={currency}>
                  {messages.expenses.currencies[currency]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${prefix}-paid-by`} className="form-label">
            {messages.expenses.paidBy}
          </label>
          <select
            className="field"
            id={`${prefix}-paid-by`}
            value={draft.paidBy}
            onChange={(event) => update('paidBy', event.target.value)}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${prefix}-mode`} className="form-label">
            {messages.expenses.splitMode}
          </label>
          <select
            className="field"
            id={`${prefix}-mode`}
            value={draft.splitMode}
            onChange={(event) =>
              update('splitMode', event.target.value as SplitMode)
            }
          >
            {(['equal', 'custom', 'percentage'] as const).map((mode) => (
              <option key={mode} value={mode}>
                {messages.expenses.modes[mode]}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="min-w-0">
          <legend className="font-semibold">
            {messages.expenses.participants}
          </legend>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {messages.expenses.participantsHint}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {members.map((member) => {
              const selected = draft.memberIds.includes(member.id);
              return (
                <div
                  key={member.id}
                  className="rounded-lg border border-slate-200 px-3 dark:border-slate-700"
                >
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      className="size-5 shrink-0 accent-teal-700"
                      onChange={() =>
                        update(
                          'memberIds',
                          selected
                            ? draft.memberIds.filter((id) => id !== member.id)
                            : [...new Set([...draft.memberIds, member.id])],
                        )
                      }
                    />
                    <span className="break-words">{member.name}</span>
                  </label>
                  {selected && draft.splitMode !== 'equal' && (
                    <div className="pb-3">
                      <label
                        className="form-label"
                        htmlFor={`${prefix}-${member.id}`}
                      >
                        {member.name}{' '}
                        {draft.splitMode === 'custom'
                          ? messages.expenses.customAmount
                          : messages.expenses.percentage}
                      </label>
                      <input
                        className="field"
                        id={`${prefix}-${member.id}`}
                        inputMode="decimal"
                        autoComplete="off"
                        required
                        value={
                          (draft.splitMode === 'custom'
                            ? draft.customAmounts
                            : draft.percentages)[member.id] ?? ''
                        }
                        onChange={(event) => {
                          const key =
                            draft.splitMode === 'custom'
                              ? 'customAmounts'
                              : 'percentages';
                          update(key, {
                            ...draft[key],
                            [member.id]: event.target.value,
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      </fieldset>
      <section
        aria-labelledby={`${prefix}-preview`}
        aria-live="polite"
        className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950"
      >
        <h3 id={`${prefix}-preview`} className="font-semibold">
          {messages.expenses.preview}
        </h3>
        {preview ? (
          <>
            <ul
              aria-label={messages.expenses.preview}
              className="mt-3 flex flex-col gap-3"
            >
              {preview.shares.map((share) => (
                <li
                  key={share.memberId}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <span>
                    {
                      members.find((member) => member.id === share.memberId)
                        ?.name
                    }
                  </span>
                  <span className="tabular-nums">
                    {formatCents(share.amountCents, draft.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-semibold">
              {messages.expenses.total}:{' '}
              {formatCents(preview.totalCents, draft.currency)}
            </p>
          </>
        ) : (
          <p className="mt-3">{validation}</p>
        )}
      </section>
      {saveError && <p role="alert">{saveError}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button className="primary-button flex-1" disabled={!preview || saving}>
          {saving
            ? messages.expenses.saving
            : expense
              ? messages.expenses.saveChanges
              : messages.expenses.save}
        </button>
        {!saving && (
          <AppLink to={`/tabs/${tabId}`}>{messages.expenses.cancel}</AppLink>
        )}
      </div>
    </form>
  );
}
