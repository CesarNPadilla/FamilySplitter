import { messages } from '../i18n';
import type { Member } from '../lib/auth';
import { useState, type FormEvent } from 'react';
import { listTabs, createTab } from '../lib/expenses';
import { useResource } from '../lib/use-resource';
import { navigate } from '../lib/navigation';
import { AppLink } from '../components/AppLink';
import { ResourceNotice } from '../components/ResourceNotice';

export function Dashboard({ member }: { member: Member }) {
  const resource = useResource(listTabs);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const id = await createTab(name);
      navigate(`/tabs/${id}`);
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };
  return (
    <section aria-labelledby="dashboard-title" className="panel">
      <h2 id="dashboard-title" className="text-2xl font-semibold">
        {messages.dashboard.title}
      </h2>
      <p className="mt-3 font-medium">
        {messages.auth.signedInAs} {member.name}
      </p>
      <p className="mt-1 break-all text-slate-600 dark:text-slate-300">
        {member.email}
      </p>
      <h3 className="mt-6 text-lg font-semibold">{messages.dashboard.tabs}</h3>
      {resource.status !== 'ready' ? (
        <ResourceNotice status={resource.status} retry={resource.retry} />
      ) : resource.data.length === 0 ? (
        <p className="mt-4">{messages.dashboard.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {resource.data.map((tab) => (
            <li key={tab.id}>
              <AppLink
                to={`/tabs/${tab.id}`}
                className="secondary-button flex w-full items-center break-words"
              >
                {tab.name}
              </AppLink>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-8 flex flex-col gap-3"
      >
        <label htmlFor="tab-name" className="font-semibold">
          {messages.dashboard.newTab}
        </label>
        <input
          className="field"
          id="tab-name"
          required
          value={name}
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="primary-button" disabled={!name.trim() || saving}>
          {saving ? messages.expenses.saving : messages.dashboard.createTab}
        </button>
        {failed && <p role="alert">{messages.dashboard.createFailed}</p>}
      </form>
    </section>
  );
}
