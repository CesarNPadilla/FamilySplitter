import { createContext, useContext } from 'react';
import type { Member } from './auth';

export type AuthState =
  | {
      status: 'loading' | 'anonymous' | 'unconfigured' | 'denied' | 'error';
      member: null;
    }
  | { status: 'ready'; member: Member };
export const AuthContext = createContext<{
  state: AuthState;
  signOut: () => Promise<boolean>;
  retry: () => void;
} | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider required');
  return value;
}
