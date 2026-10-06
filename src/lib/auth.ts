import type { SupabaseClient } from '@supabase/supabase-js';

export interface Member {
  id: string;
  name: string;
  email: string;
  authUserId: string;
}
export class MembershipDenied extends Error {}

/** Uniform completion prevents Auth errors revealing whether an email exists. */
export async function requestMagicLink(
  client: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<void> {
  try {
    await client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
    });
  } catch {
    // Do not display transport/Auth errors or query the private member allowlist.
  }
}

/** Persisted session data is not proof of membership: verify on the server. */
export async function resolveMember(client: SupabaseClient): Promise<Member> {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) {
    if (
      userError.status === 401 ||
      userError.status === 403 ||
      userError.name === 'AuthSessionMissingError'
    )
      throw new MembershipDenied();
    throw new Error('Session verification unavailable');
  }
  if (!userData.user) throw new MembershipDenied();
  const { data: memberId, error: linkError } = await client.rpc(
    'link_current_member',
  );
  if (linkError) {
    if (linkError.code === '42501') throw new MembershipDenied();
    throw new Error('Member linking unavailable');
  }
  if (typeof memberId !== 'string') throw new Error('Invalid member response');
  const { data: member, error } = await client
    .from('members')
    .select('id,name,email,auth_user_id')
    .eq('id', memberId)
    .eq('auth_user_id', userData.user.id)
    .single();
  if (error || !member || member.auth_user_id !== userData.user.id)
    throw new Error('Member lookup unavailable');
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    authUserId: member.auth_user_id,
  };
}
