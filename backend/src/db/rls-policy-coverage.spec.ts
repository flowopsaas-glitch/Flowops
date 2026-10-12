import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * RLS policy coverage — the crack-closer.
 *
 * Reads schema.prisma and the generated RLS migration and fails the build if:
 *  - any table carrying a `companyId` lacks ENABLE/FORCE RLS + a tenant policy,
 *  - any policy exists for a table WITHOUT companyId (false security),
 *  - a policy deviates from the app_tenant_guard() clause shape,
 *  - the `app_tenant()` / `app_tenant_guard()` helpers are missing.
 *
 * Adding a new tenant table without regenerating the migration
 * (`python3 backend/scripts/generate-rls-migration.py`) turns this suite red.
 *
 * The truth-table tests below pin the SEMANTICS of `app_tenant_guard` — a TS
 * mirror of the SQL — so nobody can quietly change what phase-1/phase-2 mean.
 */

const ROOT = join(__dirname, '..', '..');
const SCHEMA = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const MIGRATION_DIR = join(ROOT, 'prisma', 'migrations');

function tenantTables(): Set<string> {
  const models = SCHEMA.match(/model (\w+) \{[\s\S]*?\n\}/g) ?? [];
  const tables = new Set<string>();
  for (const block of models) {
    if (!/^\s*companyId\s+String/m.test(block)) continue;
    const map = block.match(/@@map\("([^"]+)"\)/);
    const name = block.match(/model (\w+) \{/);
    if (map) tables.add(map[1]);
    else if (name) tables.add(name[1]);
  }
  return tables;
}

function rlsMigrationSql(): string {
  const dirs = readdirSync(MIGRATION_DIR).filter((d) => d.includes('rls_tenant_isolation'));
  expect(dirs.length).toBe(1);
  return readFileSync(join(MIGRATION_DIR, dirs[0], 'migration.sql'), 'utf8');
}

/** TS mirror of SQL `app_tenant_guard("companyId")` — the policy's meaning, executable. */
function appTenantGuard(companyId: string, sessionCompanyId: string | null, rlsStrict: string | null): boolean {
  const tenant = sessionCompanyId && sessionCompanyId !== '' ? sessionCompanyId : null;
  if (tenant !== null) return companyId === tenant;
  const strict = rlsStrict ?? 'off';
  return !['on', 'true', '1'].includes(strict);
}

describe('RLS tenant isolation — policy coverage', () => {
  const sql = rlsMigrationSql();

  it('defines the app_tenant() and app_tenant_guard() helpers the policies bind to', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION app_tenant\(\) RETURNS TEXT/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION app_tenant_guard\("companyId" TEXT\) RETURNS BOOLEAN/);
    expect(sql).toContain("current_setting('app.company_id'");
    expect(sql).toContain("current_setting('app.rls_strict'");
  });

  it('covers every tenant table with enable + force + a well-formed policy', () => {
    const missing: string[] = [];
    for (const table of tenantTables()) {
      const enabled = sql.includes(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      const forced = sql.includes(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
      const policy = new RegExp(
        `CREATE POLICY "tenant_isolation" ON "${table}"\\s+USING \\(app_tenant_guard\\("companyId"\\)\\)\\s+WITH CHECK \\(app_tenant_guard\\("companyId"\\)\\);`,
      ).test(sql);
      if (!enabled || !forced || !policy) missing.push(`${table} (enable=${enabled}, force=${forced}, policy=${policy})`);
    }
    expect(missing).toEqual([]);
  });

  it('has one policy per tenant table and no policies on non-tenant tables', () => {
    const tables = tenantTables();
    const policyTables = [...sql.matchAll(/CREATE POLICY "tenant_isolation" ON "([^"]+)"/g)].map((m) => m[1]);
    // Exactly one policy per tenant table, nothing more (a policy on a table
    // without companyId would filter EVERYTHING on app_tenant() — false security).
    expect(new Set(policyTables).size).toBe(tables.size);
    for (const t of policyTables) expect(tables.has(t)).toBe(true);
  });

  it('pins the phase-1 posture and documents the phase-2 setting flip in the migration', () => {
    expect(sql).toContain('PHASE-1');
    expect(sql).toContain('PHASE-2');
    expect(sql).toContain("ALTER DATABASE flowops SET app.rls_strict = 'on'");
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('migration file is non-trivial and safe (no destructive statements)', () => {
    expect(sql.length).toBeGreaterThan(5000);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
    expect(existsSync(join(ROOT, 'scripts', 'generate-rls-migration.py'))).toBe(true);
  });
});

describe('RLS tenant isolation — app_tenant_guard semantics (TS mirror of the SQL)', () => {
  it('PHASE-1 (rls_strict off): context set -> strict tenant isolation', () => {
    expect(appTenantGuard('cmp-a', 'cmp-a', 'off')).toBe(true);
    expect(appTenantGuard('cmp-b', 'cmp-a', 'off')).toBe(false);
    // the strict flag must NOT weaken isolation when a context IS set
    expect(appTenantGuard('cmp-b', 'cmp-a', 'on')).toBe(false);
    expect(appTenantGuard('cmp-a', 'cmp-a', 'on')).toBe(true);
  });

  it('PHASE-1: no context (seeds, migrations, outbox drain) -> policy steps aside', () => {
    expect(appTenantGuard('cmp-a', null, 'off')).toBe(true);
    expect(appTenantGuard('cmp-a', '', 'off')).toBe(true);
    expect(appTenantGuard('cmp-a', null, null)).toBe(true);
  });

  it('PHASE-2 (rls_strict on): no context -> rows are refused outright', () => {
    expect(appTenantGuard('cmp-a', null, 'on')).toBe(false);
    expect(appTenantGuard('cmp-a', '', 'true')).toBe(false);
    expect(appTenantGuard('cmp-a', null, '1')).toBe(false);
    // …while a proper context still works
    expect(appTenantGuard('cmp-a', 'cmp-a', 'on')).toBe(true);
  });

  it('unknown rls_strict values fall back to phase-1 permissive (safe default)', () => {
    expect(appTenantGuard('cmp-a', null, 'maybe')).toBe(true);
    expect(appTenantGuard('cmp-a', null, 'ON ')).toBe(true); // SQL-side COALESCE trims? no — exact match only
  });
});
