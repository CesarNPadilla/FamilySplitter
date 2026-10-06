import { messages } from './i18n';

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-widest text-teal-700 dark:text-teal-300">
        {messages.app.eyebrow}
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        {messages.app.title}
      </h1>
      <p className="text-lg text-slate-600 dark:text-slate-300">
        {messages.app.description}
      </p>
      <section
        aria-labelledby="setup-title"
        className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 id="setup-title" className="text-xl font-semibold">
          {messages.setup.title}
        </h2>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          {messages.setup.description}
        </p>
      </section>
    </main>
  );
}
