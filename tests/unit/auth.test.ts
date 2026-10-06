import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MembershipDenied,
  requestMagicLink,
  resolveMember,
} from '../../src/lib/auth';

function fixture() {
  const single = vi.fn().mockResolvedValue({
    data: {
      id: 'member',
      name: 'Member 1',
      email: 'member1@example.invalid',
      auth_user_id: 'auth-user',
    },
    error: null,
  });
  const query = { select: vi.fn(), eq: vi.fn(), single };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const client = {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'auth-user' } },
        error: null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: 'member', error: null }),
    from: vi.fn().mockReturnValue(query),
  };
  return { client, query, sdk: client as unknown as SupabaseClient };
}

describe('magic links and membership', () => {
  it('uses only email OTP, forbids account creation, and normalizes input', async () => {
    const { client, sdk } = fixture();
    await requestMagicLink(
      sdk,
      ' Member1@Example.Invalid ',
      'https://family.example/auth/callback',
    );
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'member1@example.invalid',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://family.example/auth/callback',
      },
    });
    expect(client.from).not.toHaveBeenCalled();
  });
  it('has the same completion for known, unknown, and transport failures', async () => {
    const { client, sdk } = fixture();
    await expect(
      requestMagicLink(sdk, 'known@example.invalid', 'https://example.invalid'),
    ).resolves.toBeUndefined();
    client.auth.signInWithOtp.mockResolvedValueOnce({
      error: { message: 'Not registered' },
    });
    await expect(
      requestMagicLink(
        sdk,
        'unknown@example.invalid',
        'https://example.invalid',
      ),
    ).resolves.toBeUndefined();
    client.auth.signInWithOtp.mockRejectedValueOnce(new Error('Network'));
    await expect(
      requestMagicLink(
        sdk,
        'unknown@example.invalid',
        'https://example.invalid',
      ),
    ).resolves.toBeUndefined();
  });
  it('verifies the user, links first login, and reads only the linked identity', async () => {
    const { client, query, sdk } = fixture();
    expect(await resolveMember(sdk)).toEqual({
      id: 'member',
      name: 'Member 1',
      email: 'member1@example.invalid',
      authUserId: 'auth-user',
    });
    expect(client.rpc).toHaveBeenCalledWith('link_current_member');
    expect(query.eq).toHaveBeenCalledWith('id', 'member');
    expect(query.eq).toHaveBeenCalledWith('auth_user_id', 'auth-user');
  });
  it('does not link or read member data for an invalid session', async () => {
    const { client, sdk } = fixture();
    client.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 401 },
    });
    await expect(resolveMember(sdk)).rejects.toBeInstanceOf(MembershipDenied);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });
  it('blocks non-members before any table reads', async () => {
    const { client, sdk } = fixture();
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(resolveMember(sdk)).rejects.toBeInstanceOf(MembershipDenied);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('offers retry on session verification network errors', async () => {
    const { client, sdk } = fixture();
    client.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 0 },
    });
    await expect(resolveMember(sdk)).rejects.not.toBeInstanceOf(
      MembershipDenied,
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it('treats transient linking failures as retryable, and never trusts a mismatched row', async () => {
    const { client, query, sdk } = fixture();
    client.rpc.mockResolvedValueOnce({ data: null, error: { code: '503' } });
    await expect(resolveMember(sdk)).rejects.not.toBeInstanceOf(
      MembershipDenied,
    );
    query.single.mockResolvedValueOnce({
      data: { id: 'member', auth_user_id: 'other-user' },
      error: null,
    });
    await expect(resolveMember(sdk)).rejects.toThrow();
  });
});
