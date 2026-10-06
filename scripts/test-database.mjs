import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// PostgreSQL is a test runtime, not an application dependency. This container has
// no published port, uses no real credentials, and is always removed afterwards.
function run(args, input, quiet = false) {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!quiet) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr ?? 'Docker failed');
  }
  return result.stdout.trim();
}

let container;
try {
  container = run(
    [
      'run',
      '--detach',
      '--env',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      'postgres:17',
    ],
    undefined,
    true,
  );
  if (!/^[a-f0-9]{64}$/.test(container))
    throw new Error('Unexpected container ID');
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-U', 'postgres'],
      { timeout: 5000 },
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  if (!ready) throw new Error('Test PostgreSQL did not become ready');
  const files = [
    'tests/database/bootstrap.sql',
    ...readdirSync('supabase/migrations')
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => `supabase/migrations/${name}`),
    'supabase/seed.sql',
    'tests/database/security.sql',
  ];
  for (const file of files) {
    console.log(`\nDatabase check: ${file}`);
    run(
      [
        'exec',
        '-i',
        container,
        'psql',
        '-U',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
        '--output=/dev/null',
      ],
      readFileSync(file, 'utf8'),
    );
  }
  console.log('\nDatabase migration and security checks passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (container && /^[a-f0-9]{64}$/.test(container)) {
    const cleanup = spawnSync('docker', ['rm', '--force', container], {
      encoding: 'utf8',
      timeout: 30000,
    });
    if (cleanup.status !== 0) {
      console.error(
        `Could not remove test container ${container}: ${cleanup.stderr}`,
      );
      process.exitCode = 1;
    }
  }
}
