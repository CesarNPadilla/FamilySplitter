import { useEffect, useState } from 'react';
import { AuthProvider } from './components/AuthProvider';
import { messages } from './i18n';
import { useAuth } from './lib/auth-context';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';

function AuthRoutes() {
  const { state, signOut, retry } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const [invalidLink] = useState(
    () =>
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.hash.slice(1)).has('error') ||
        new URLSearchParams(window.location.search).has('error')),
  );
  useEffect(() => {
    if (state.status === 'loading' || state.status === 'unconfigured') return;
    const path = state.status === 'ready' ? '/dashboard' : '/login';
    window.history.replaceState(null, '', path);
  }, [state.status]);
  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutFailed(false);
    const succeeded = await signOut();
    setSignOutFailed(!succeeded);
    setSigningOut(false);
  };
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
      {state.status === 'loading' && (
        <p role="status">{messages.auth.loading}</p>
      )}
      {state.status === 'unconfigured' && (
        <section className="panel">
          <h2 className="text-xl font-semibold">
            {messages.auth.unconfiguredTitle}
          </h2>
          <p className="mt-3">{messages.auth.unconfigured}</p>
        </section>
      )}
      {state.status === 'anonymous' && <Login invalidLink={invalidLink} />}
      {state.status === 'ready' && <Dashboard member={state.member} />}
      {(state.status === 'denied' || state.status === 'error') && (
        <section className="panel">
          <p role="alert">
            {state.status === 'denied'
              ? messages.auth.denied
              : messages.auth.unavailable}
          </p>
          <button
            type="button"
            onClick={retry}
            className="secondary-button mt-4"
          >
            {messages.auth.retry}
          </button>
        </section>
      )}
      {(state.status === 'ready' ||
        state.status === 'denied' ||
        state.status === 'error') && (
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="secondary-button"
        >
          {signingOut ? messages.auth.signingOut : messages.auth.signOut}
        </button>
      )}
      {signOutFailed && <p role="alert">{messages.auth.signOutFailed}</p>}
    </main>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AuthRoutes />
    </AuthProvider>
  );
}
