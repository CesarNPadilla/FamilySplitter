import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

const token = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
it.each([
  ['https://demo.supabase.co', token('anon'), 0],
  ['https://demo.supabase.co', 'sb_publishable_demo', 0],
  ['', '', 1],
  ['http://demo.supabase.co', token('anon'), 1],
  ['https://localhost', token('anon'), 1],
  ['https://demo.supabase.co', token('service_role'), 1],
  ['https://demo.supabase.co', 'sb_secret_demo', 1],
  ['https://demo.supabase.co', 'not-a-public-key', 1],
])(
  'validates Pages configuration without exposing keys: %s',
  (url, key, status) => {
    const result = spawnSync(
      process.execPath,
      ['scripts/check-pages-env.mjs'],
      {
        env: {
          ...process.env,
          VITE_SUPABASE_URL: url as string,
          VITE_SUPABASE_ANON_KEY: key as string,
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(status);
    expect(result.stdout).toBe('');
    if (key) expect(result.stderr).not.toContain(key);
  },
);
