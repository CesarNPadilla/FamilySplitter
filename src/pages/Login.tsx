import { useState, type FormEvent } from 'react';
import { messages } from '../i18n';
import { requestMagicLink } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { siteHref } from '../lib/site-path';

export function Login({ invalidLink = false }: { invalidLink?: boolean }) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || sending) return;
    setSending(true);
    await requestMagicLink(
      supabase,
      email,
      new URL(siteHref('/'), window.location.origin).href,
    );
    setSending(false);
    setSent(true);
  };
  return (
    <section aria-labelledby="login-title" className="panel">
      <h2 id="login-title" className="text-2xl font-semibold">
        {messages.auth.loginTitle}
      </h2>
      <p className="mt-3 text-slate-600 dark:text-slate-300">
        {messages.auth.loginDescription}
      </p>
      {invalidLink && (
        <p role="alert" className="mt-4">
          {messages.auth.invalidLink}
        </p>
      )}
      <form
        onSubmit={(event) => void submit(event)}
        className="mt-6 flex flex-col gap-4"
      >
        <label htmlFor="email" className="font-medium">
          {messages.auth.emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          disabled={sending}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setSent(false);
          }}
          className="field"
        />
        <button
          lang="es"
          type="submit"
          disabled={sending}
          className="primary-button"
        >
          {sending ? messages.auth.sending : messages.auth.sendLink}
        </button>
        {sent && <p role="status">{messages.auth.genericResponse}</p>}
      </form>
    </section>
  );
}
