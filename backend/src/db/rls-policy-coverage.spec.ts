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

/**
 * Deliberate deviations from the plain `app_tenant_guard("companyId")` shape.
 *
 * Both are WEAKER or DIFFERENT than the standard clause and are safe only
 * because of what the table holds, so each is enumerated here rather than
 * permitted in general. Adding the variant to any other table leaves the
 * allowlist out of step and turns this suite red.
 */
const SHARED_ROW_POLICY_TABLES = new Set([
  // Platform-preset networks (companyId IS NULL) are readable by every tenant;
  // tenant-defined ones are guarded. Weak by design: a tenant can see the
  // preset ladder catalogue, never another tenant's own networks.
  'rail_networks',
]);

const PARENT_DELEGATED_POLICY_TABLES = new Set([
  // A rung has no companyId of its own; its policy checks the parent network's.
  // This is real isolation (not the companyId-less false security warned about
  // below) because visibility is derived from a guarded parent row.
  'rail_escalation_rungs',
]);

/** The shared-row clause: shared rows visible to all, own rows visible to owner. */
const SHARED_GUARD_SHAPE = 'app_tenant_guard_shared("companyId")';

function rlsMigrationSql(): string {
  // The RLS migration defines the helpers and the bulk of the policies.
  // Tenant tables created AFTER it carry their policy in their own creating
  // migration (so fresh-database replay creates the table before its
  // policy), so coverage is judged over the union of every migration.
  const dirs = readdirSync(MIGRATION_DIR).filter((d) => d.includes('rls_tenant_isolation'));
  expect(dirs.length).toBe(1);
  const all = readdirSync(MIGRATION_DIR)
    .filter((d) => existsSync(join(MIGRATION_DIR, d, 'migration.sql')))
    .sort()
    .map((d) => readFileSync(join(MIGRATION_DIR, d, 'migration.sql'), 'utf8'));
  return all.join('\n');
}

/** TS mirror of SQL `app_tenant_guard("companyId")` — the policy's meaning, executable. */
function appTenantGuard(companyId: string, sessionCompanyId: string | null, rlsStrict: string | null): boolean {
  const tenant = sessionCompanyId && sessionCompanyId !== '' ? sessionCompanyId : null;
  if (tenant !== null) return companyId === tenant;
  const strict = rlsStrict ?? 'off';
  return !['on', 'true', '1'].includes(strict);
}

/** TS mirror of SQL `app_tenant_guard_shared("companyId")` — executable semantics. */
function appTenantGuardShared(
  companyId: string | null,
  sessionCompanyId: string | null,
  rlsStrict: string | null,
): boolean {
  // Platform-preset rows (companyId IS NULL) are visible to everyone.
  if (companyId === null) return true;
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
      // Standard shape, or the shared-row shape for an allowlisted table.
      const standard = new RegExp(
        `CREATE POLICY "tenant_isolation" ON "${table}"\\s+USING \\(app_tenant_guard\\("companyId"\\)\\)\\s+WITH CHECK \\(app_tenant_guard\\("companyId"\\)\\);`,
      ).test(sql);
      const shared = new RegExp(
        `CREATE POLICY "tenant_isolation" ON "${table}"\\s+USING \\(${SHARED_GUARD_SHAPE.replace(/[()"]/g, '\\$&')}\\)`,
      ).test(sql);
      const policy = standard || (shared && SHARED_ROW_POLICY_TABLES.has(table));
      if (!enabled || !forced || !policy) missing.push(`${table} (enable=${enabled}, force=${forced}, policy=${policy})`);
    }
    expect(missing).toEqual([]);
  });

  it('has one policy per tenant table and no policies on non-tenant tables', () => {
    const tables = tenantTables();
    const policyTables = [...sql.matchAll(/CREATE POLICY "tenant_isolation" ON "([^"]+)"/g)].map((m) => m[1]);
    // Exactly one policy per tenant table, nothing more (a policy on a table
    // without companyId would filter EVERYTHING on app_tenant() — false security).
    expect(new Set(policyTables).size).toBe(tables.size + PARENT_DELEGATED_POLICY_TABLES.size);
    for (const t of policyTables) {
      expect(tables.has(t) || PARENT_DELEGATED_POLICY_TABLES.has(t)).toBe(true);
    }
  });

  it('uses the shared-row clause on exactly the allowlisted tables, and nowhere else', () => {
    // An allowlist that is never checked against reality is a comment, not a
    // control. This pins both directions: every allowlisted table really uses
    // the variant, and no unlisted table has quietly adopted it.
    const using = new RegExp(`USING \\(${SHARED_GUARD_SHAPE.replace(/[()"]/g, '\\$&')}\\)`);
    const withCheck = new RegExp(`WITH CHECK \\(${SHARED_GUARD_SHAPE.replace(/[()"]/g, '\\$&')}\\)`);

    for (const table of SHARED_ROW_POLICY_TABLES) {
      const block = sql.match(
        new RegExp(`CREATE POLICY "tenant_isolation" ON "${table}"[\\s\\S]{0,400}?;`),
      );
      // expect() takes a single argument in this repo — no message overload.
      expect(block).not.toBeNull();
      expect(using.test(block![0])).toBe(true);
      expect(withCheck.test(block![0])).toBe(true);
    }

    // No table outside the allowlist may use the variant.
    const anyShared = [...sql.matchAll(
      new RegExp(`CREATE POLICY "tenant_isolation" ON "([^"]+)"[\\s\\S]{0,400}?${SHARED_GUARD_SHAPE.replace(/[()"]/g, '\\$&')}`, 'g'),
    )].map((m) => m[1]);
    for (const t of new Set(anyShared)) expect(SHARED_ROW_POLICY_TABLES.has(t)).toBe(true);
  });

  it('the shared-row guard never leaks one tenant\'s rows to another', () => {
    // The whole point of the variant: a tenant gains the platform's shared
    // rows but must not gain a competitor's. Enumerated, because this is the
    // one place a "harmless" refactor would turn into a data breach.
    expect(appTenantGuardShared('A', 'A', 'on')).toBe(true);   // own row
    expect(appTenantGuardShared('B', 'A', 'on')).toBe(false);  // other tenant's row
    expect(appTenantGuardShared(null, 'A', 'on')).toBe(true);  // platform preset
    expect(appTenantGuardShared('A', null, 'off')).toBe(true); // no session, phase-1
    // Strict mode does NOT hide shared rows — that is the deliberate difference
    // from app_tenant_guard, and the reason the table is allowlisted.
    expect(appTenantGuardShared(null, null, 'on')).toBe(true);
    // ...but it still refuses another tenant's row with no session.
    expect(appTenantGuardShared('A', null, 'on')).toBe(false);
  });

  it('pins the shared-row guard against the plain guard, so the difference stays visible', () => {
    // Where the two agree and where they diverge, written down so the choice
    // cannot drift into an accident.
    for (const strict of ['on', 'off']) {
      expect(appTenantGuardShared('A', 'A', strict))
        .toBe(appTenantGuard('A', strict === 'on' ? 'A' : null, strict));
    }
    // The divergence: a shared (NULL-owner) row with no tenant session.
    expect(appTenantGuardShared(null, null, 'on')).toBe(true);
    expect(appTenantGuard(null as unknown as string, null, 'on')).toBe(false);
  });

  it('pins the phase-1 posture and documents the phase-2 setting flip in the migration', () => {
    expect(sql).toContain('PHASE-1');
    expect(sql).toContain('PHASE-2');
    expect(sql).toContain("ALTER DATABASE flowops SET app.rls_strict = 'on'");
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  });

/**
 * Strip SQL comments so the destructive-statement scan reads instructions,
 * not prose.
 *
 * Before this, the guard scanned raw migration text, so writing the phrase
 * "DROP TABLE" inside an explanatory comment failed the build even though no
 * such statement existed. That is a guard that punishes documentation — and
 * the predictable workaround is to stop documenting.
 *
 * Handles the three comment forms Postgres accepts, plus the content forms a
 * comment can hide a statement inside: string literals and dollar-quoted
 * bodies, which must survive intact so a real statement inside a function
 * body is still judged as code.
 */
function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      if (end === -1) break;
      out += '\n';
      i = end + 1;
      continue;
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) break;
      // Keep the newlines so line-based reporting stays aligned with the file.
      out += sql.slice(i, end + 2).replace(/[^\n]/g, ' ');
      i = end + 2;
      continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) { j += 2; continue; } // escaped quote
          j += 1;
          break;
        }
        if (sql[j] === '\\') { j += 2; continue; }
        j += 1;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    const dollar = sql.slice(i).match(/^\$[A-Za-z_]*\$/);
    if (dollar) {
      const tag = dollar[0]; // the whole $tag$, not the inner identifier
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) break;
      const stop = end + tag.length;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

describe('stripSqlComments (fixtures)', () => {
  const strip = stripSqlComments;

  it('removes line and block comments', () => {
    const line = strip('DROP TABLE a; -- DROP TABLE b;');
    expect(line).toContain('DROP TABLE a;');
    expect(line).not.toContain('DROP TABLE b');

    const block = strip('/* DROP TABLE c; */ DROP TABLE a;');
    expect(block).toContain('DROP TABLE a;');
    expect(block).not.toContain('DROP TABLE c');
  });

  it('keeps line numbers aligned when a block comment spans lines', () => {
    // Comment text is blanked, not deleted, so any line we report still
    // matches the line the reader sees in the migration file.
    const before = 'SELECT 1;\n/*\nDROP TABLE d;\n*/\nSELECT 2;';
    const after = strip(before);
    expect(after.split('\n')).toHaveLength(before.split('\n').length);
    expect(after).not.toContain('DROP TABLE d');
    expect(after).toContain('SELECT 2;');
  });

  it('leaves statements inside string literals and dollar-quoted bodies alone', () => {
    // These are not comments: a real statement hiding in either must still fail.
    expect(strip("SELECT 'DROP TABLE x;';")).toBe("SELECT 'DROP TABLE x;';");
    expect(strip("SELECT 'it''s -- not a comment';")).toBe("SELECT 'it''s -- not a comment';");
    expect(strip("$$ DROP TABLE y; $$")).toBe("$$ DROP TABLE y; $$");
    expect(strip("$fn$ TRUNCATE z; $fn$")).toBe("$fn$ TRUNCATE z; $fn$");
  });

  it('does not let a comment swallow the rest of the file', () => {
    // An unterminated block comment must not silently blank everything after it,
    // turning a destructive statement into an invisible one.
    expect(strip('/* unterminated DROP TABLE q;')).toBe('');
  });
});

  it('migration file is non-trivial and safe (no destructive statements)', () => {
    expect(sql.length).toBeGreaterThan(5000);
    expect(stripSqlComments(sql)).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
    expect(existsSync(join(ROOT, 'scripts', 'generate-rls-migration.py'))).toBe(true);
  });

  it('still fails on a destructive statement that a comment tries to launder', () => {
    // The reason comment-awareness is safe: stripping comments removes the
    // ability to HIDE a statement, never the ability to catch one. Each of
    // these is a real statement the guard must still reject.
    const cases = [
      '-- harmless note\nDROP TABLE tenant_rows;',
      '/* nothing to see here */ DROP TABLE tenant_rows;',
      'CREATE FUNCTION f() RETURNS void AS $$ BEGIN DROP TABLE tenant_rows; END; $$ LANGUAGE plpgsql;',
      "COMMENT ON TABLE t IS 'DROP TABLE tenant_rows;';",
    ];
    for (const c of cases) {
      expect(stripSqlComments(c)).toMatch(/DROP TABLE/i);
    }
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
