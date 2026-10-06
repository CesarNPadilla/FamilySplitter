import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext, type AuthState } from '../lib/auth-context';
import { MembershipDenied, resolveMember } from '../lib/auth';
import { supabase } from '../lib/supabase';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: supabase ? 'loading' : 'unconfigured',
    member: null,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let version = 0;
    let lastToken: string | null | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const accept = (session: Session | null) => {
      if (!active) return;
      const token = session?.access_token ?? null;
      if (token === lastToken) return;
      lastToken = token;
      const current = ++version;
      clearTimeout(timer);
      if (!session) {
        setState({ status: 'anonymous', member: null });
        return;
      }
      setState({ status: 'loading', member: null });
      // Auth callbacks hold the SDK lock. Start requests in a later task.
      timer = setTimeout(() => {
        void resolveMember(client)
          .then((member) => {
            if (active && version === current)
              setState({ status: 'ready', member });
          })
          .catch((error: unknown) => {
            if (active && version === current)
              setState({
                status: error instanceof MembershipDenied ? 'denied' : 'error',
                member: null,
              });
          });
      }, 0);
    };
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => accept(session));
    const startingVersion = version;
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || version !== startingVersion) return;
        if (error) setState({ status: 'error', member: null });
        else accept(data.session);
      })
      .catch(() => {
        if (active && version === startingVersion)
          setState({ status: 'error', member: null });
      });
    return () => {
      active = false;
      ++version;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [attempt]);
  const signOut = async () => {
    if (!supabase) return true;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) return false;
      setState({ status: 'anonymous', member: null });
      return true;
    } catch {
      return false;
    }
  };
  return (
    <AuthContext.Provider
      value={{ state, signOut, retry: () => setAttempt((value) => value + 1) }}
    >
      {children}
    </AuthContext.Provider>
  );
}
