/**
 * The role split, executed against a real PostgreSQL (PGlite — Postgres
 * compiled to WASM).
 *
 * WHY THIS FILE EXISTS
 *
 * `rls-semantics.test.mjs` proved the blocking finding of the 2026-11-12 audit:
 * as a superuser, every tenant isolation policy is installed, correct, and
 * never consulted. `FORCE ROW LEVEL SECURITY` binds the table owner, not a
 * superuser. So the net under the application-filter layer was not hanging.
 *
 * `scripts/rls-roles.sql` fixes that by splitting traffic across two roles.
 * This file runs the policy functions — read verbatim from the migration, so
 * they cannot drift — against a real database and asserts what each role
 * actually sees.
 *
 * The claim being tested is narrow and load-bearing:
 *
 *   - the app role, with no tenant context, sees NOTHING (fail closed);
 *   - the app role, with a context, sees its own rows and no one else's;
 *   - the platform role, with no context, sees everything — which is what the
 *     ~114 cross-tenant operations in PLATFORM_SCOPE require;
 *   - the platform role holds no bypass: the moment it declares a tenant it is
 *     isolated like anyone else, and with strict on it is closed too.
 *
 * That fourth point is what makes the platform role safe to exist. Its power
 * comes from `app.rls_strict = 'off'` on its login and from nothing else — not
 * from a privilege it carries around.
 *
 * Runs under `node --test`, like the other PGlite tests: jest's CJS runtime
 * cannot perform the dynamic ESM import PGlite needs.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(HERE, '..', 'prisma', 'migrations', '20261012210000_rls_tenant_isolation', 'migration.sql');
const ROLES_SQL = join(HERE, 'rls-roles.sql');

/** The two functions the policy binds to, taken verbatim from the migration. */
function policyFunctions(sql) {
  const grab = (name) => {
    const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name}[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`, 'm'));
    if (!m) throw new Error(`${name} not found in the RLS migration — did it move?`);
    return m[0];
  };
  return `${grab('app_tenant')}\n\n${grab('app_tenant_guard')}`;
}

/**
 * A stand-in for the tenant tables, plus the two roles in their post-split
 * shape. Attributes matter: NOSUPERUSER and NOBYPASSRLS are the entire fix.
 */
const DDL = `
CREATE TABLE waybills (id text primary key, "companyId" text);
ALTER TABLE waybills ENABLE ROW LEVEL SECURITY;
ALTER TABLE waybills FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON waybills
  USING (app_tenant_guard("companyId"))
  WITH CHECK (app_tenant_guard("companyId"));
INSERT INTO waybills VALUES ('w1','acme'), ('w2','globex');

CREATE ROLE flowops_app      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE flowops_platform NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT SELECT ON waybills TO flowops_app, flowops_platform;
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

/**
 * One scenario in its own transaction: role, strict flag, optional context.
 *
 * `app.rls_strict` is set with SET LOCAL here because role-level defaults
 * (`ALTER ROLE ... SET`) apply at login, and PGlite gives us one connection.
 * The split is therefore simulated the way the roles would actually differ,
 * which is exactly what `ALTER ROLE flowops_app SET app.rls_strict = 'on'`
 * produces on a real login.
 */
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

async function roleAttributes(name) {
  const r = await db.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1', [name]);
  return r.rows[0];
}

describe('rls-roles.sql says the right things (static, so it cannot drift)', () => {
  const sql = readFileSync(ROLES_SQL, 'utf8');

  test('creates both roles without superuser or BYPASSRLS', () => {
    // Conditional creation is fine; the unconditional ALTER ROLE afterwards is
    // what makes a pre-existing superuser role impossible to leave behind.
    assert.match(sql, /ALTER ROLE flowops_app\s+NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;/);
    assert.match(sql, /ALTER ROLE flowops_platform\s+NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;/);
  });

  test('sets app.rls_strict on for the app role and off for the platform role', () => {
    assert.match(sql, /ALTER ROLE flowops_app\s+SET app\.rls_strict = 'on';/);
    assert.match(sql, /ALTER ROLE flowops_platform\s+SET app\.rls_strict = 'off';/);
  });

  test('covers tables created by later migrations, not just the ones that exist today', () => {
    // Without this the next Prisma migration revokes the app role by omission.
    assert.match(sql, /ALTER DEFAULT PRIVILEGES[\s\S]*?ON TABLES TO flowops_app/);
  });

  test('is idempotent: re-running converges rather than failing', () => {
    assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'flowops_app'\)/);
    assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'flowops_platform'\)/);
  });
});

describe('neither role can bypass row-level security', () => {
  test('flowops_app is neither a superuser nor BYPASSRLS', async () => {
    assert.deepEqual(await roleAttributes('flowops_app'), { rolsuper: false, rolbypassrls: false });
  });

  test('flowops_platform is neither a superuser nor BYPASSRLS', async () => {
    assert.deepEqual(await roleAttributes('flowops_platform'), { rolsuper: false, rolbypassrls: false });
  });
});

describe('the app role fails closed', () => {
  test('with no tenant context it sees nothing, not everything', async () => {
    // This is the behaviour that does not exist today. It is the whole point.
    assert.deepEqual(await visible({ role: 'flowops_app', strict: 'on' }), []);
  });

  test('with a tenant context it sees only that tenant', async () => {
    assert.deepEqual(await visible({ role: 'flowops_app', strict: 'on', companyId: 'acme' }), [
      { id: 'w1', companyId: 'acme' },
    ]);
  });

  test('a context for a tenant with no rows sees nothing', async () => {
    assert.deepEqual(await visible({ role: 'flowops_app', strict: 'on', companyId: 'nobody' }), []);
  });

  test('an empty context does not fall through to the permissive branch', async () => {
    // app_tenant() is NULLIF(current_setting(...), ''), so '' became NULL and
    // leaked every row under phase 1. Strict closes it.
    assert.deepEqual(await visible({ role: 'flowops_app', strict: 'on', companyId: '' }), []);
  });
});

describe('the platform role keeps the cross-tenant operations working', () => {
  test('with no tenant context it still sees every row', async () => {
    // owner, auth, paystack callbacks, webhooks, alerting and the platform
    // sweeps cannot establish a tenant. This is what lets them run.
    assert.equal((await visible({ role: 'flowops_platform', strict: 'off' })).length, 2);
  });

  test('but it holds no bypass: the moment it declares a tenant it is isolated', async () => {
    // The safety property that makes a powerful second role acceptable. Its
    // reach comes from the flag on its login, not from a privilege it carries.
    assert.deepEqual(await visible({ role: 'flowops_platform', strict: 'off', companyId: 'acme' }), [
      { id: 'w1', companyId: 'acme' },
    ]);
  });

  test('with strict on it is closed too — no escape hatch either way', async () => {
    assert.deepEqual(await visible({ role: 'flowops_platform', strict: 'on' }), []);
  });
});
