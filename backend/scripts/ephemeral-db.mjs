#!/usr/bin/env node
/**
 * ephemeral-db.mjs — operate on a THROWAWAY database only.
 *
 * Why this exists
 * ---------------
 * The database-backed integration suite (test/integration) needs a real
 * PostgreSQL with the schema applied. In CI that is a service container plus
 * `prisma db push`. On a developer machine the Prisma CLI is the normal way,
 * but in locked-down/offline environments the CLI cannot download its native
 * engines, so this script provides the two operations that need no engine:
 *
 *   * `reset` — drop and recreate the `public` schema
 *   * `sql <file>` — apply a .sql file (e.g. a reviewed migration.sql, or the
 *     schema DDL produced by CI's `prisma migrate diff`)
 *
 * SAFETY — read before running
 * ----------------------------
 *   * This tool REFUSES to run without `EPHEMERAL_DB=1`.
 *   * It REFUSES a database whose name does not end in `_test`, `_ci` or
 *     `_ephemeral`, and REFUSES a non-local host.
 *   * It reads `EPHEMERAL_DB_URL`, never `DATABASE_URL`, so a copied shell or
 *     a stray `.env` cannot silently point it at production.
 *   * `reset` is DESTRUCTIVE. It is only ever acceptable against a disposable
 *     database.
 *
 * It is a development and CI convenience, NOT a migration mechanism:
 * `prisma migrate deploy` remains the only way migrations reach a real
 * environment.
 *
 * Usage
 * -----
 *   EPHEMERAL_DB=1 EPHEMERAL_DB_URL=postgresql://... node scripts/ephemeral-db.mjs reset
 *   EPHEMERAL_DB=1 EPHEMERAL_DB_URL=postgresql://... node scripts/ephemeral-db.mjs sql path/to/file.sql
 *   EPHEMERAL_DB=1 EPHEMERAL_DB_URL=postgresql://... node scripts/ephemeral-db.mjs tables
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ALLOWED_DB_SUFFIXES = ['_test', '_ci', '_ephemeral', '_shadow'];

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/**
 * Parse and vet the target. Accepts the unix-socket form
 * (`postgresql://user@/dbname?host=/dir`), which `new URL()` rejects.
 */
function assertSafeTarget(url) {
  if (process.env.EPHEMERAL_DB !== '1') {
    fail(
      'Refusing to run: set EPHEMERAL_DB=1 to confirm you are targeting a THROWAWAY database.\n' +
        '  This tool can drop schema and data. It must never point at production.',
    );
  }
  if (!url) {
    fail('Refusing to run: EPHEMERAL_DB_URL is not set (this tool never reads DATABASE_URL).');
  }

  const m = /^postgres(?:ql)?:\/\/(?<userinfo>[^@]*)@?(?<hostport>[^/?]*)\/(?<db>[^?]*)(?:\?(?<query>.*))?$/.exec(
    url,
  );
  if (!m?.groups) fail('EPHEMERAL_DB_URL is not a valid postgres connection string.');

  const query = new URLSearchParams(m.groups.query ?? '');
  const dbName = decodeURIComponent(m.groups.db || '');
  const host = query.get('host') || m.groups.hostport || '';
  const isLocal =
    host === '' ||
    ['localhost', '127.0.0.1', '::1'].includes(host) ||
    host.startsWith('/') || // unix socket directory
    host.endsWith('.local');

  if (!ALLOWED_DB_SUFFIXES.some((s) => dbName.endsWith(s))) {
    fail(
      `Refusing to run against database "${dbName}": the name must end in one of ` +
        `${ALLOWED_DB_SUFFIXES.join(', ')} so it is unmistakably disposable.`,
    );
  }
  if (!isLocal) {
    fail(`Refusing to run against non-local host "${host}". Ephemeral databases are local.`);
  }

  console.log(`→ target database: ${dbName} @ ${host || 'unix socket'}`);
  return { dbName, host };
}

async function withPool(url, fn) {
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

const [command, ...rest] = process.argv.slice(2);
if (!['reset', 'sql', 'tables'].includes(command)) {
  fail(
    `Unknown command ${command ? `"${command}"` : '(none)'}. Use one of: reset | sql <file> | tables`,
  );
}

const url = process.env.EPHEMERAL_DB_URL;
assertSafeTarget(url);

if (command === 'reset') {
  await withPool(url, async (pool) => {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
    console.log('→ schema dropped and recreated (database is empty)');
  });
} else if (command === 'sql') {
  const file = rest[0];
  if (!file || !existsSync(file)) fail(`SQL file not found: ${file}`);
  await withPool(url, async (pool) => {
    await pool.query(readFileSync(file, 'utf8'));
    console.log(`→ applied ${path.relative(process.cwd(), file)}`);
  });
} else if (command === 'tables') {
  await withPool(url, async (pool) => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    console.log(`→ public tables: ${rows[0].tables}`);
  });
}
