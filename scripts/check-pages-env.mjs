// Values are public build configuration; never print them in workflow logs.
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = process.env;
try {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    !key?.trim()
  )
    throw new Error();
  if (key.startsWith('sb_secret_')) throw new Error();
  const payload = key.split('.')[1];
  if (
    !key.startsWith('sb_publishable_') &&
    (!payload ||
      JSON.parse(Buffer.from(payload, 'base64url').toString()).role !== 'anon')
  )
    throw new Error();
} catch {
  console.error(
    'Configure VITE_SUPABASE_URL and a public anon/publishable key in GitHub repository variables before deploying.',
  );
  process.exitCode = 1;
}
