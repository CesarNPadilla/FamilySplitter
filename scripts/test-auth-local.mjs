import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Admin keys stay in Node; never pass them to the browser, output, or files.
const runId = randomUUID();
const created = [];
let admin;
try {
  const result = spawnSync(
    process.execPath,
    ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
    { encoding: 'utf8', timeout: 30000 },
  );
  if (result.status !== 0)
    throw new Error('Start local Supabase before this check.');
  const status = JSON.parse(result.stdout);
  const url = new URL(status.API_URL);
  const inboxUrl = new URL(status.MAILPIT_URL ?? status.INBUCKET_URL);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !['127.0.0.1', 'localhost'].includes(inboxUrl.hostname)
  )
    throw new Error('Tests require loopback services.');
  admin = async (path, method = 'GET', body) => {
    const response = await fetch(`${status.API_URL}${path}`, {
      method,
      headers: {
        apikey: status.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok)
      throw new Error(`Local admin request failed (${response.status}).`);
    return method === 'DELETE' ? null : response.json();
  };
  const members = await admin('/rest/v1/members?select=email');
  if (
    !['member1@example.invalid', 'member2@example.invalid'].every((email) =>
      members.some((member) => member.email === email),
    )
  )
    throw new Error('Tests require demo seed member emails.');
  const users = (await admin('/auth/v1/admin/users?per_page=1000')).users;
  const outsiders = [
    `phase3-${runId}-desktop@example.invalid`,
    `phase3-${runId}-mobile@example.invalid`,
  ];
  for (const email of [
    'member1@example.invalid',
    'member2@example.invalid',
    ...outsiders,
  ]) {
    if (users.some((user) => user.email === email)) continue;
    const user = await admin('/auth/v1/admin/users', 'POST', {
      email,
      email_confirm: true,
    });
    created.push(user.id);
  }
  const signup = await fetch(`${status.API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: status.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `phase3-${runId}-signup@example.invalid`,
      password: randomUUID(),
    }),
  });
  const signupError = await signup.json();
  if (signup.ok || signupError.error_code !== 'signup_disabled')
    throw new Error('Public signup rejection was not verified.');
  console.log('Running real magic-link checks; mail stays in the local inbox.');
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'playwright.auth.config.ts',
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          VITE_SUPABASE_URL: status.API_URL,
          VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
          TEST_MAIL_URL: inboxUrl.href,
          TEST_RUN_ID: runId,
          TEST_OUTSIDER_DESKTOP: outsiders[0],
          TEST_OUTSIDER_MOBILE: outsiders[1],
        },
      },
    );
    child.on('error', reject);
    child.on('exit', resolve);
  });
  const after = (await admin('/auth/v1/admin/users?per_page=1000')).users;
  const unexpected = after.filter(
    (user) =>
      user.email?.startsWith(`phase3-${runId}-unknown`) ||
      user.email === `phase3-${runId}-signup@example.invalid`,
  );
  created.push(...unexpected.map((user) => user.id));
  if (unexpected.length)
    throw new Error('An unknown email created an Auth account.');
  if (exitCode !== 0) throw new Error('Local auth browser checks failed.');
  console.log('Unknown emails create no account; public sign-ups fail.');
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Local auth check failed.',
  );
  process.exitCode = 1;
} finally {
  if (admin) {
    // Remove only this run's expense/tab fixtures, even after a failed assertion.
    try {
      const rows = await admin(
        `/rest/v1/expenses?select=id&description=like.phase4-${runId}-%`,
      );
      for (const row of rows)
        await admin(`/rest/v1/expenses?id=eq.${row.id}`, 'DELETE');
      const tabs = await admin(
        `/rest/v1/expense_tabs?select=id&name=like.phase4-${runId}-%`,
      );
      for (const tab of tabs)
        await admin(`/rest/v1/expense_tabs?id=eq.${tab.id}`, 'DELETE');
    } catch {
      console.error('Could not clean up local expense fixtures.');
      process.exitCode = 1;
    }
  }
  if (admin)
    for (const id of new Set(created)) {
      try {
        await admin(`/auth/v1/admin/users/${id}`, 'DELETE');
      } catch {
        console.error('Could not clean up a local test account.');
        process.exitCode = 1;
      }
    }
}
