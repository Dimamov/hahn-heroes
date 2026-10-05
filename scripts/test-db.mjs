// Runs the Supabase migrations and SQL tests against a throwaway local Postgres server.
// Needs Postgres 15+ binaries (initdb, pg_ctl, psql) on PATH or in /usr/lib/postgresql/*/bin.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function findBin(name) {
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    for (const v of readdirSync(base).sort().reverse()) {
      const p = join(base, v, 'bin', name);
      if (existsSync(p)) return p;
    }
  }
  return name;
}

// Postgres refuses to run as root; borrow the postgres user when we are root (containers, CI).
const asUser = process.getuid?.() === 0 ? ['runuser', '-u', 'postgres', '--'] : [];
const run = (bin, args, opts = {}) => {
  const [cmd, ...rest] = [...asUser, findBin(bin), ...args];
  return execFileSync(cmd, rest, { stdio: 'pipe', encoding: 'utf8', ...opts });
};

const dir = mkdtempSync(join(tmpdir(), 'hahn-db-'));
chmodSync(dir, 0o777);
const data = join(dir, 'data');
const port = String(54000 + Math.floor(Math.random() * 900));
let started = false;
try {
  run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-sync']);
  run('pg_ctl', ['-D', data, '-l', join(dir, 'server.log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-w', 'start']);
  started = true;
  const psql = (file) =>
    run('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-f', file]);

  const tests = join(root, 'supabase/tests');
  const migrations = join(root, 'supabase/migrations');
  psql(join(tests, '00_auth_stub.sql'));
  for (const f of readdirSync(migrations).sort()) psql(join(migrations, f));
  for (const f of readdirSync(tests).sort().filter((f) => f.endsWith('_test.sql'))) {
    process.stdout.write(psql(join(tests, f)));
    console.log(`ok ${f}`);
  }
} catch (err) {
  console.error(err.stderr || err.stdout || err.message);
  process.exitCode = 1;
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
