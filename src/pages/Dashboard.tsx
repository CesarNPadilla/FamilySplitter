import { messages } from '../i18n';
import type { Member } from '../lib/auth';

export function Dashboard({ member }: { member: Member }) {
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
      <p className="mt-6 text-slate-600 dark:text-slate-300">
        {messages.dashboard.pending}
      </p>
    </section>
  );
}
