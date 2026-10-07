/**
 * Guards docs/RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md — the document an operator will paste production commands from.
 *
 * It does NOT run anything; it fails when the checklist stops obeying the rules it states, or stops agreeing with the
 * migrations it describes:
 *   - every command is ONE line ending in `; echo done`;
 *   - a read-only (R / V) step contains no mutating verb, and a mutating step carries a sequential `approved: N`;
 *   - no command can print a secret or `.env`, and none is a destructive Prisma command;
 *   - every gated step names its blast radius and its rollback;
 *   - the rollback SQL is exactly what the three rail migrations create, undone in reverse order;
 *   - the object counts it promises equal what the migrations add.
 *
 * (That the rollback SQL is also COMPLETE was proven on a real PostgreSQL engine — see docs/tools/verify-migrations-pglite.mjs.)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const normalizeNewlines = (text: string) => text.replace(/\r\n/g, '\n');
const doc = normalizeNewlines(readFileSync(join(root, 'docs', 'RAIL-RASA-DEPLOYMENT-CHECKLIST-2026-10-02.md'), 'utf8'));
const migrationsDir = join(root, 'backend', 'prisma', 'migrations');

interface Cmd { kind: string; text: string; raw: string }
const commands: Cmd[] = [...doc.matchAll(/<!-- CMD ([^>]+?) -->\n```text\n([\s\S]*?)\n```/g)].map((m) => ({ kind: m[1].trim(), text: m[2], raw: m[0] }));
const approved = commands.filter((c) => c.kind.startsWith('approved'));
const readOnly = commands.filter((c) => c.kind.startsWith('read-only'));

/**
 * This spec exists to keep the deployment checklist honest about the release it
 * describes: the rail pricing deployment of 2026-10-03, RELEASE_SHA `be1792d`,
 * which shipped waves 2, 3 and 4.
 *
 * The filter below therefore names those waves explicitly rather than taking
 * every `rail_wave` it finds. That is scoping, not exclusion — and it is
 * deliberate, because a later wave is a different release with its own
 * document. Silently folding new waves into this guard would make the counts,
 * the rollback block and the "no drops" claim describe a release that never
 * happened.
 *
 * The tripwire test further down fails if any *other* wave appears, so a new
 * one cannot be forgotten here.
 */
const DEPLOYMENT_WAVES = /_rail_wave(2|3|4)_/;

const railMigrations = readdirSync(migrationsDir).filter((d) => DEPLOYMENT_WAVES.test(d) && existsSync(join(migrationsDir, d, 'migration.sql'))).sort();
const sqlOf = (m: string) => normalizeNewlines(readFileSync(join(migrationsDir, m, 'migration.sql'), 'utf8')).split('\n').filter((l) => !l.startsWith('--')).join('\n');

describe('checklist — the command rules', () => {
  it('has a meaningful number of commands (the parser is not vacuous)', () => {
    expect(commands.length).toBeGreaterThanOrEqual(30);
    expect(readOnly.length).toBeGreaterThanOrEqual(18);
    expect(approved.length).toBe(12);
  });

  it.each(commands.map((c) => [c.kind, c] as const))('%s is ONE line that ends with "; echo done"', (_k, c) => {
    expect(c.text.includes('\n')).toBe(false);
    expect(c.text.endsWith('; echo done')).toBe(true);
    expect(c.text.split('; echo done').length - 1).toBe(1); // the suffix appears once, at the end
  });

  it('the approvals are 1..12, in order, each used exactly once', () => {
    const n = approved.map((c) => Number(/^approved (\d+)$/.exec(c.kind)?.[1]));
    expect(n).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('every read-only step is really read-only — no mutating verb, no write SQL, no --apply', () => {
    const mutating = [
      /docker compose [^;]*\b(up|down|restart|run|build|stop|kill|rm|pull)\b/, /\bdocker (tag|rm|rmi|stop|kill|restart|run)\b/, /\bgit (merge|reset|checkout|pull|push|commit|clean|stash|rebase)\b/,
      /\brm\s/, /\bmv\s/, /\bcp\s/, /migrate (deploy|resolve|reset|dev)/, /db push/, /--apply/, /--restore-live/, /flowops-backup-r2/, /restore-verify/,
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/, /vps-deploy/, />\s*\/|>>/,
    ];
    for (const c of readOnly) for (const re of mutating) expect({ step: c.kind, hit: re.test(c.text) }).toEqual({ step: c.kind, hit: false });
  });

  it('no command can print a secret or the .env file', () => {
    for (const c of commands) {
      expect(c.text).not.toMatch(/\bcat\b[^;|]*\.env|\bless\b[^;|]*\.env|\bhead\b[^;|]*\.env|\btail\b[^;|]*\.env|\bsource\b[^;|]*\.env/);
      expect(c.text).not.toMatch(/\bprintenv\b|(^|[;&|]\s*)env(\s|$)|compose[^;]* config|\bset -x\b|echo\s+\$/);
      expect(c.text).not.toMatch(/POSTGRES_PASSWORD|JWT_SECRET|JWT_REFRESH_SECRET|OWNER_SEED_PASSWORD|DATABASE_URL|api[_-]?key|secret|token/i);
      // `docker inspect` dumps the whole environment unless it is formatted
      if (/docker inspect/.test(c.text)) expect(c.text).toMatch(/--format/);
      // the only place `.env` may appear is as the file a count is taken from
      if (/\.env\b/.test(c.text)) expect(c.text).toMatch(/^grep -c '\^ALLOW_AI_' \/root\/FlowOps\/\.env; echo done$/);
    }
  });

  it('no command is a destructive Prisma or database command on the deployment path', () => {
    for (const c of commands.filter((x) => /^approved ([1-7])$/.test(x.kind) || x.kind.startsWith('read-only'))) {
      expect(c.text).not.toMatch(/migrate (reset|dev|resolve)|db push|accept-data-loss|DROP\s|TRUNCATE|DELETE\s+FROM/i);
    }
  });

  it('the only commands that move data or code are the gated ones (a mutating command is never marked read-only)', () => {
    for (const c of approved) expect(c.kind).toMatch(/^approved \d+$/);
    const gated = approved.map((c) => c.text).join('\n');
    expect(gated).toContain('flowops-backup-r2 --backup-only');
    expect(gated).toContain('merge --ff-only <RELEASE_SHA>');
    expect(gated).toContain('prisma migrate deploy');
    expect(gated).toContain('./deploy/vps-deploy.sh');
    expect(gated).toContain('seed-rail-reference.js --apply');
  });

  it('migrates BEFORE the application is swapped (the old image would otherwise meet the old schema… or the new one the old schema)', () => {
    const idx = (needle: string) => approved.findIndex((c) => c.text.includes(needle));
    expect(idx('flowops-backup-r2')).toBeLessThan(idx('prisma migrate deploy'));
    expect(idx('restore-verify.sh --latest-local')).toBeLessThan(idx('prisma migrate deploy'));
    expect(idx('build api')).toBeLessThan(idx('prisma migrate deploy'));
    expect(idx('prisma migrate deploy')).toBeLessThan(idx('./deploy/vps-deploy.sh'));
    expect(idx('./deploy/vps-deploy.sh')).toBeLessThan(idx('seed-rail-reference.js --apply'));
  });

  it('the migration runs the NEW image once, with --no-deps and --rm, via the compose service (so no credential is typed)', () => {
    const m = approved.find((c) => c.text.includes('prisma migrate deploy'))!;
    expect(m.text).toContain('docker compose -f docker-compose.yml -f deploy/docker-compose.vps.yml run --rm -T --no-deps api ./node_modules/.bin/prisma migrate deploy');
    expect(m.text).not.toMatch(/--env-file|DATABASE_URL|postgresql:\/\//);
  });
});

/**
 * Regressions from the first real run (2026-10-03, RELEASE_SHA be1792d).
 *
 * These are not style opinions — each one is a thing that was wrong in the document, was only caught because a step was
 * held and verified rather than trusted, and would otherwise be re-introduced by the next edit.
 */
describe('checklist — regressions from the 2026-10-03 run', () => {
  const cmd = (kind: string) => {
    const found = commands.find((c) => c.kind === kind);
    expect(found).toBeDefined();
    return found!;
  };

  it('V6b does not use the blunt pattern that can never report zero', () => {
    // 'error|exception|prisma' reported 7 on a perfectly healthy deploy: PrismaModule/PrismaService startup lines, and
    // five `Mapped {…}` routes whose PATHS contain error/exception (/observability/client-error, /operations/exception-sla,
    // /owner/observatory/errors, …). A check that can never read 0 is worse than no check — it trains the operator to
    // wave through a non-zero result.
    const v6b = cmd('read-only V6b').text;
    expect(v6b).not.toMatch(/grep -ciE 'error\|exception\|prisma'/);
    expect(v6b).toMatch(/grep -v 'Mapped \{'/); // drop route-registration lines before counting
    expect(v6b).not.toMatch(/grep -i\b/); // case-sensitive: match the ERROR severity, not "client-error"
  });

  it('Step 6 bounds the frontend build (its package.json hardcodes --max-old-space-size=8192 on a 2 GB host)', () => {
    // A CLI flag beats NODE_OPTIONS, so --memory is the only lever that can bound this build. The host has 1.9 Gi RAM.
    expect(cmd('approved 6').text).toMatch(/build frontend --memory \d+m/);
  });

  it('records the run that proved the document wrong, so the next operator reads it first', () => {
    expect(doc).toMatch(/## 8\. Corrections from the 2026-10-03 run/);
    for (const lesson of [
      'A green exit code is not a verified state.',
      'The backend does not need a raised heap.',
      'The frontend is the real memory risk',
    ]) {
      expect(doc).toContain(lesson);
    }
  });
});

describe('checklist — each gated step names its blast radius and its rollback', () => {
  const sections = [...doc.matchAll(/### Step (\d+)[^\n]*\n([\s\S]*?)(?=\n### |\n## )/g)].map((m) => ({ n: Number(m[1]), body: m[2] }));

  it('covers steps 1 to 7', () => expect(sections.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]));

  it.each([1, 2, 3, 4, 5, 6, 7])('Step %s has a Blast radius and a Rollback', (n) => {
    const s = sections.find((x) => x.n === n)!;
    expect(s.body).toContain('**Blast radius:**');
    expect(s.body).toContain('**Rollback:**');
  });

  it('every step heading carries its approval number', () => {
    for (let n = 1; n <= 7; n += 1) expect(doc).toMatch(new RegExp(`### Step ${n} [^\\n]*\`approved: ${n}\``));
  });

  it('the rollback approvals 8–12 are all described', () => {
    for (let n = 8; n <= 12; n += 1) expect(doc).toContain(`approved: ${n}\``);
  });

  it('says plainly that nothing has been run', () => {
    expect(doc).toMatch(/\*\*Status: PREPARED — NOTHING IN THIS DOCUMENT HAS BEEN RUN\.\*\*/);
  });
});

describe('checklist — it agrees with the migrations it describes', () => {
  it('there are exactly three rail migrations, and the document names each of them', () => {
    expect(railMigrations).toHaveLength(3);
    for (const m of railMigrations) expect(doc).toContain(m);
  });

  /**
   * TRIPWIRE. Every rail wave in the tree that this spec does not cover, listed
   * by name. Wave 5 is recorded here because it is known and deliberately out
   * of scope: it is the TRIM TOC Operations workstream, not part of the
   * pricing release this checklist governs.
   *
   * Adding a wave to this list is a decision that must be justified in the
   * comment above. If a wave appears that is not listed, this fails — which is
   * the point: the alternative is a new migration quietly changing the counts
   * and the rollback block of a document that describes a release already run.
   */
  it('names every rail wave this spec deliberately does not cover', () => {
    const allWaves = readdirSync(migrationsDir).filter((d) => /_rail_wave\d/.test(d)).sort();
    const uncovered = allWaves.filter((d) => !DEPLOYMENT_WAVES.test(d));
    expect(uncovered).toEqual(['20261004000000_rail_wave5_handshake_ladder_gaps']);
  });

  const count = (re: RegExp) => railMigrations.reduce((n, m) => n + (sqlOf(m).match(re)?.length ?? 0), 0);

  it('the promised additions equal the statements in the migrations', () => {
    const tables = count(/^CREATE TABLE /gm);
    const types = count(/^CREATE TYPE /gm);
    const explicitIndexes = count(/^CREATE (UNIQUE )?INDEX /gm);
    const addColumns = count(/ADD COLUMN/g);
    expect({ tables, types, explicitIndexes, addColumns }).toEqual({ tables: 12, types: 23, explicitIndexes: 27, addColumns: 19 });
    expect(doc).toContain('**12 `CREATE TABLE`, 23 `CREATE TYPE`, 39 indexes (27 explicit + 12 primary keys), 19 `ALTER TABLE … ADD COLUMN`**');
    // the counts the operator compares against: now → after (tables | enums | indexes | FKs)
    const now = [133, 72, 362, 150];
    const after = [now[0] + tables, now[1] + types, now[2] + explicitIndexes + tables, now[3]];
    expect(after.join('|')).toBe('145|95|401|150');
    expect(doc).toContain(`now \`${now.join('\\|')}\` → after \`${after.join('\\|')}\``);
    expect(doc).toContain('`145|95|401|150`');
  });

  it('adds no foreign key, no drop and no data statement (the claim the whole plan rests on)', () => {
    for (const m of railMigrations) expect(sqlOf(m)).not.toMatch(/FOREIGN KEY|REFERENCES|^\s*DROP\s|ALTER COLUMN|SET NOT NULL|^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
  });

  it('the twelve "new tables are empty" check names exactly the tables the migrations create', () => {
    const created = railMigrations.flatMap((m) => [...sqlOf(m).matchAll(/^CREATE TABLE "([^"]+)"/gm)].map((x) => x[1])).sort();
    const v3 = approved.length && readOnly.find((c) => c.kind === 'read-only V3')!.text;
    const named = [...(v3 as string).matchAll(/FROM (rail_[a-z_]+)\)/g)].map((x) => x[1]).sort();
    expect(named).toEqual(created);
  });

  it('the altered tables are the two the document says (wagons, rail_consignments), with the column counts it says', () => {
    const cols = new Map<string, number>();
    for (const m of railMigrations) for (const x of sqlOf(m).matchAll(/^ALTER TABLE "([^"]+)" ADD COLUMN/gm)) cols.set(x[1], (cols.get(x[1]) ?? 0) + 1);
    expect(Object.fromEntries(cols)).toEqual({ wagons: 9, rail_consignments: 10 });
    expect(doc).toContain('(`wagons` +9, `rail_consignments` +10)');
  });
});

describe('checklist — the rollback SQL is exactly the migrations undone, in reverse order', () => {
  /** Rebuilds the rollback from the migration files: columns, then tables, then enum types, newest migration first. */
  function generate(): string {
    const out: string[] = [];
    for (const m of [...railMigrations].reverse()) {
      const sql = sqlOf(m);
      const types = [...sql.matchAll(/^CREATE TYPE "([^"]+)"/gm)].map((x) => x[1]);
      const tables = [...sql.matchAll(/^CREATE TABLE "([^"]+)"/gm)].map((x) => x[1]);
      const cols = new Map<string, string[]>();
      for (const x of sql.matchAll(/^ALTER TABLE "([^"]+)" ADD COLUMN\s+"([^"]+)"/gm)) cols.set(x[1], [...(cols.get(x[1]) ?? []), x[2]]);
      out.push(`-- ${m}`);
      for (const [t, cs] of cols) out.push(`ALTER TABLE "${t}" ${[...cs].reverse().map((c) => `DROP COLUMN "${c}"`).join(', ')};`);
      if (tables.length) out.push(`DROP TABLE ${[...tables].reverse().map((t) => `"${t}"`).join(', ')};`);
      if (types.length) out.push(`DROP TYPE ${[...types].reverse().map((t) => `"${t}"`).join(', ')};`);
      out.push(`DELETE FROM "_prisma_migrations" WHERE "migration_name" = '${m}';`);
      out.push('');
    }
    return out.join('\n').trim();
  }
  const block = /<!-- BEGIN ROLLBACK-SQL -->\n```sql\n([\s\S]*?)\n```\n<!-- END ROLLBACK-SQL -->/.exec(doc)?.[1];

  it('the document carries the block', () => expect(block).toBeDefined());

  it('equals what the migrations create, undone newest-first (it fails if a migration is edited and the checklist is not)', () => {
    expect(block).toBe(generate());
  });

  it('drops a column before the enum type it uses, and a table before its types (so it can actually run)', () => {
    const lines = (block as string).split('\n').filter((l) => !l.startsWith('--') && l.trim());
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].startsWith('DROP TYPE')) {
        // every ALTER / DROP TABLE of the same migration came before its DROP TYPE
        const section = lines.slice(Math.max(0, i - 3), i);
        for (const l of section) expect(l.startsWith('DROP TYPE')).toBe(false);
      }
    }
    const firstType = lines.findIndex((l) => l.startsWith('DROP TYPE'));
    const firstTable = lines.findIndex((l) => l.startsWith('DROP TABLE'));
    expect(firstTable).toBeLessThan(firstType);
  });

  it('removes one ledger row per migration, and no other row', () => {
    const deletes = (block as string).split('\n').filter((l) => l.startsWith('DELETE FROM'));
    expect(deletes).toHaveLength(3);
    for (const m of railMigrations) expect(deletes.some((d) => d.includes(`'${m}'`))).toBe(true);
    expect(deletes.every((d) => /WHERE "migration_name" = '[^']+';$/.test(d))).toBe(true);
  });

  it('never touches a table that existed before these migrations', () => {
    const dropped = [...(block as string).matchAll(/DROP TABLE ([^;]+);/g)].flatMap((m) => m[1].split(',').map((t) => t.trim().replace(/"/g, '')));
    expect(dropped).toHaveLength(12);
    expect(dropped.every((t) => /^rail_/.test(t))).toBe(true);
    const altered = [...(block as string).matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(altered)).toEqual(new Set(['rail_consignments', 'wagons']));
  });
});
