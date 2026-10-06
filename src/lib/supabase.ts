import { createClient } from '@supabase/supabase-js';

export function createBrowserClient(
  url: string | undefined,
  anonKey: string | undefined,
) {
  if (!url?.trim() || !anonKey?.trim()) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return createClient(url, anonKey, {
      auth: {
        storageKey: 'family-splitter-auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch {
    return null;
  }
}

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
