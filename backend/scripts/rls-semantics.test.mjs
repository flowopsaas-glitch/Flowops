/**
 * RLS semantics, executed against a real PostgreSQL (PGlite — Postgres compiled
 * to WASM), not a TypeScript mirror of it.
 *
 * WHY THIS FILE EXISTS
 *
 * `src/db/rls-policy-coverage.spec.ts` already pins `app_tenant_guard` — but it
 * does so by reimplementing the predicate in TypeScript and testing the
 * reimplementation. That tests our READING of the SQL. This file runs the SQL
 * itself, extracted from the migration so it cannot drift, and asserts what the
 * database actually does.
 *
 * The difference matters. During the 2026-11-12 audit the one finding that
 * changed the entire recommendation was invisible from the SQL text and only
 * appeared when the policy met a real connection: a superuser bypasses RLS
 * outright, `FORCE ROW LEVEL SECURITY` notwithstanding, and every compose file
 * in this repo connects as the initdb superuser.
 *
 * Runs under `node --test` rather than jest, like the other PGlite tests:
 * jest's CJS runtime cannot perform the dynamic ESM import PGlite needs without
 * --experimental-vm-modules.
 *
 * A NOTE ON `set_config(..., true)`
 *
 * The third argument makes the setting transaction-local, so it must run inside
 * an explicit transaction — exactly how `PrismaService.withTenant` calls it. In
 * autocommit the setting is discarded immediately and every scenario silently
 * returns the unscoped result. Hence the BEGIN/COMMIT wrapping.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  HERE,
  '..',
  'prisma',
  'migrations',
  '20261012210000_rls_tenant_isolation',
  'migration.sql',
);

/** The two functions the policy binds to, taken verbatim from the migration. */
function policyFunctions(sql) {
  const grab = (name) => {
    const m = sql.match(
      new RegExp(`CREATE OR REPLACE FUNCTION ${name}[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`, 'm'),
    );
    if (!m) throw new Error(`${name} not found in the RLS migration — did it move?`);
    return m[0];
  };
  return `${grab('app_tenant')}\n\n${grab('app_tenant_guard')}`;
}

const DDL = `
CREATE TABLE waybills (id text primary key, "companyId" text);
ALTER TABLE waybills ENABLE ROW LEVEL SECURITY;
ALTER TABLE waybills FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON waybills
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
INSERT INTO waybills VALUES ('w1','acme'), ('w2','globex');

-- What the application SHOULD connect as: not a superuser, no BYPASSRLS.
CREATE ROLE app_user;
GRANT SELECT ON waybills TO app_user;
`;

let PGlite;
let db;

before(async () => {
  ({ PGlite } = await import('@electric-sql/pglite'));
  db = await PGlite.create();
  await db.exec(policyFunctions(readFileSync(MIGRATION, 'utf8')));
  await db.exec(DDL);
});

after(async () => {
  if (db) await db.close();
});

/** One scenario in its own transaction: role, strict flag, optional context. */
async function visible({ role, strict = 'off', companyId } = {}) {
  await db.exec('BEGIN');
  try {
    if (role) await db.exec(`SET LOCAL ROLE ${role}`);
    await db.exec(`SET LOCAL app.rls_strict = '${strict}'`);
    if (companyId !== undefined) {
      await db.query(`SELECT set_config('app.company_id', $1, true)`, [companyId]);
    }
    const r = await db.query('SELECT id, "companyId" FROM waybills ORDER BY id');
    return r.rows;
  } finally {
    await db.exec('COMMIT');
  }
}

describe('the policy does what the migration says it does', () => {
  test('the functions are read from the migration, not retyped', () => {
    const fns = policyFunctions(readFileSync(MIGRATION, 'utf8'));
    assert.match(fns, /app_tenant\(\)/);
    assert.match(fns, /app_tenant_guard/);
    assert.match(fns, /app\.rls_strict/);
  });

  test('a real tenant context isolates rows', async () => {
    assert.deepEqual(await visible({ role: 'app_user', companyId: 'acme' }), [
      { id: 'w1', companyId: 'acme' },
    ]);
  });

  test("a context for a tenant with no rows sees nothing", async () => {
    assert.deepEqual(await visible({ role: 'app_user', companyId: 'nobody' }), []);
  });
});

describe('the hole withTenant("") used to open', () => {
  test('an empty context leaks every row', async () => {
    // `app_tenant()` is NULLIF(current_setting(...), ''), so '' becomes NULL and
    // the guard falls through to its permissive branch. This is why
    // PrismaService.withTenant now refuses an empty id instead of setting one.
    assert.equal((await visible({ role: 'app_user', companyId: '' })).length, 2);
  });

  test('no context at all behaves the same way under phase 1', async () => {
    assert.equal((await visible({ role: 'app_user' })).length, 2);
  });
});

describe('phase 2 — what flipping rls_strict would actually do', () => {
  test('an uncontextualised query returns nothing, not everything', async () => {
    // The 114 platform operations cannot establish a tenant context. Under
    // phase 2 they do not leak — they stop working. Neither outcome is
    // acceptable, which is the point: the flag needs a role split first.
    assert.deepEqual(await visible({ role: 'app_user', strict: 'on' }), []);
  });

  test('a proper context still works with the flag on', async () => {
    assert.deepEqual(await visible({ role: 'app_user', strict: 'on', companyId: 'globex' }), [
      { id: 'w2', companyId: 'globex' },
    ]);
  });

  test('the flag would also have closed the empty-context hole', async () => {
    // Worth stating: switching it on fixes the leak above as a side effect. It
    // was never an option, because of the test before this one.
    assert.deepEqual(await visible({ role: 'app_user', strict: 'on', companyId: '' }), []);
  });
});

describe('the deployment finding: a superuser bypasses all of it', () => {
  test('this session is a superuser, which is the deployment shape', async () => {
    const r = await db.query(`SELECT current_setting('is_superuser') AS su`);
    assert.equal(r.rows[0].su, 'on');
  });

  test('a superuser sees every tenant even with the flag on and no context', async () => {
    // FORCE ROW LEVEL SECURITY binds the table OWNER. It does not bind a
    // superuser. Every compose file here sets POSTGRES_USER and connects as it,
    // and the official image makes that role the initdb superuser — so as
    // deployed, none of this policy is doing anything.
    assert.equal((await visible({ strict: 'on' })).length, 2);
  });

  test('a superuser is not isolated even with a tenant context set', async () => {
    // The strongest form: flag on AND context set, and a superuser session
    // still sees both rows. This is why the coverage number measures nothing.
    assert.equal((await visible({ strict: 'on', companyId: 'acme' })).length, 2);
  });

  test('a normal role IS bound — the control case', async () => {
    // Same policy, same flag, same absence of context; the only difference is
    // the role. This is the connection shape the application must use for any
    // of this to matter.
    assert.deepEqual(await visible({ role: 'app_user', strict: 'on' }), []);
  });
});
