import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
};
const steps = [
  [process.env.npm_execpath, 'run', 'build:pages'],
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    'playwright.pages.config.ts',
  ],
];
for (const args of steps) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
