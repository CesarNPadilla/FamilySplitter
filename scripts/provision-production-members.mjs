import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

// Trusted Node-only operation. Keys are captured in memory, never printed,
// written to files, placed in VITE_* variables, or passed to the browser.
const projectRef = 'sopiqxvciwjdjapilhec';
const url = `https://${projectRef}.supabase.co`;
try {
  const expected = JSON.parse(
    await readFile('supabase/production-members.local.json', 'utf8'),
  );
  if (
    !Array.isArray(expected) ||
    expected.length !== 3 ||
    new Set(expected.map((member) => member.email)).size !== 3 ||
    expected.some(
      (member) =>
        typeof member.name !== 'string' ||
        !member.name.trim() ||
        typeof member.email !== 'string' ||
        member.email !== member.email.trim().toLowerCase() ||
        !member.email.includes('@'),
    )
  )
    throw new Error('Check the private three-member provisioning file.');
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/supabase/dist/supabase.js',
      'projects',
      'api-keys',
      '--project-ref',
      projectRef,
      '-o',
      'json',
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
  if (result.status !== 0 || !result.stdout.trim())
    throw new Error('Sign in with npx supabase login before provisioning.');
  const keys = JSON.parse(result.stdout);
  const key = keys.find((item) => item.name === 'service_role')?.api_key;
  if (!key)
    throw new Error(
      'The CLI did not provide the existing service-role key. No accounts changed.',
    );
  const api = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: members, error: memberError } = await api
    .from('members')
    .select('name,email');
  if (
    memberError ||
    !members ||
    members.length !== expected.length ||
    expected.some(
      (item) =>
        !members.some(
          (member) => member.name === item.name && member.email === item.email,
        ),
    )
  )
    throw new Error(
      'Production allowlist does not exactly match the approved three members. No accounts changed.',
    );
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await api.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error('Could not read production Auth users.');
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  let created = 0;
  for (const member of expected) {
    if (users.some((user) => user.email?.toLowerCase() === member.email))
      continue;
    const { error } = await api.auth.admin.createUser({
      email: member.email,
      email_confirm: true,
      user_metadata: { name: member.name },
    });
    if (error)
      throw new Error(
        'Account provisioning failed. Rerun safely to create only missing accounts.',
      );
    created++;
  }
  console.log(
    `Three production member accounts are ready; ${created} created without passwords or invitation emails. Existing accounts were preserved. First magic-link sign-in links each member.`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Production provisioning failed.',
  );
  process.exitCode = 1;
}
