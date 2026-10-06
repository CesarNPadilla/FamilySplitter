import { spawnSync } from 'node:child_process';

// Dev fixtures only. No passwords, real addresses, or hosted admin operations.
const result = spawnSync(
  process.execPath,
  ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
  { encoding: 'utf8', timeout: 30000 },
);
if (result.status !== 0) throw new Error('Start local Supabase first.');
const status = JSON.parse(result.stdout);
if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname))
  throw new Error('Local Supabase required.');
async function admin(path, body) {
  const response = await fetch(`${status.API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      apikey: status.SERVICE_ROLE_KEY,
      Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(`Local provisioning failed (${response.status}).`);
  return response.json();
}
const members = await admin('/rest/v1/members?select=email');
if (
  members.length !== 5 ||
  members.some((member) => !/^member[1-5]@example\.invalid$/.test(member.email))
)
  throw new Error('This script provisions only the five demo seed addresses.');
const users = (await admin('/auth/v1/admin/users?per_page=1000')).users;
for (const member of members) {
  if (users.some((user) => user.email === member.email)) continue;
  await admin('/auth/v1/admin/users', {
    email: member.email,
    email_confirm: true,
  });
}
console.log('Five local demo Auth accounts are ready for magic-link sign-in.');
