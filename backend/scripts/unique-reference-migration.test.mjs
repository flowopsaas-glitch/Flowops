/**
 * Tests for prisma/migrations/20261113090000_unique_business_references.
 *
 * WHY THIS RUNS A REAL POSTGRES
 * -----------------------------
 * The whole risk in this migration is the data, not the DDL. CREATE UNIQUE
 * INDEX is one line and obviously correct; what can abort a deploy is a
 * duplicate row that has been sitting in the table since before the
 * constraint existed. A test that only checks the SQL parses would pass
 * happily and then fail in production.
 *
 * So this boots PGlite — real PostgreSQL compiled to WASM, no server needed —
 * creates the three tables, seeds duplicates, and applies the actual
 * migration.sql from disk (read and split, never copied, so the test cannot
 * drift from what ships).
 *
 * It asserts the thing that matters in both directions:
 *   * the index CANNOT be created before de-duplication (proving the dedup
 *     step is load-bearing and not ceremony), and
 *   * after de-duplication it CAN, the OLDEST row keeps its value, and the
 *     constraint is genuinely enforced against a new duplicate insert.
 *
 * It also pins the tenant-scoping decision: company A and company B may both
 * hold MAN-00001. A global unique on "code" would reject that as a violation
 * when it is actually correct data — one of the two most likely ways to get
 * this change wrong.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(HERE, '..', 'prisma', 'migrations', '20261113090000_unique_business_references', 'migration.sql');

const MARKER = '-- ── The constraints themselves';

/**
 * The real migration, split into its two halves at the section marker.
 *
 * Split line-wise, not on the marker substring: the marker is a full-width
 * rule (`-- ── The constraints themselves ─────…`) and a substring split
 * leaves the trailing dashes behind as a syntax error.
 */
function readMigration() {
  const lines = readFileSync(MIGRATION, 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith(MARKER));
  assert.ok(at > 0, 'migration must keep the section marker this test splits on');
  return { dedup: lines.slice(0, at).join('\n'), indexes: lines.slice(at + 1).join('\n') };
}

const DDL = `
  CREATE TABLE "whatsapp_messages" (
    "id" text PRIMARY KEY,
    "content" text NOT NULL,
    "wabaMessageId" text,
    "threadId" text NOT NULL,
    "sentAt" timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE "manifests" (
    "id" text PRIMARY KEY,
    "companyId" text NOT NULL,
    "code" text NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE "courier_orders" (
    "id" text PRIMARY KEY,
    "companyId" text NOT NULL,
    "reference" text NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now()
  );
`;

/**
 * Seed data shaped like the failure this migration exists to fix:
 * three inbound rows sharing one waba id (a webhook retry stored twice),
 * two manifests sharing a code inside one tenant, plus the same code in a
 * second tenant where it is perfectly legal.
 */
const SEED = `
  INSERT INTO "whatsapp_messages" ("id","content","wabaMessageId","threadId","sentAt") VALUES
    ('w-1','first copy',   'waba.retried','t-1','2026-01-01T00:00:00Z'),
    ('w-2','second copy',  'waba.retried','t-1','2026-01-01T00:00:05Z'),
    ('w-3','third copy',   'waba.retried','t-1','2026-01-01T00:00:10Z'),
    ('w-4','unrelated',    'waba.other',  't-1','2026-01-02T00:00:00Z'),
    ('w-5','no provider id', NULL,        't-1','2026-01-03T00:00:00Z'),
    ('w-6','also no id',     NULL,        't-1','2026-01-04T00:00:00Z');

  INSERT INTO "manifests" ("id","companyId","code","createdAt") VALUES
    ('m-1','c1','MAN-00001','2026-01-01T00:00:00Z'),
    ('m-2','c1','MAN-00001','2026-01-01T00:00:05Z'),
    ('m-3','c1','MAN-00002','2026-01-02T00:00:00Z'),
    ('m-4','c2','MAN-00001','2026-01-03T00:00:00Z');

  INSERT INTO "courier_orders" ("id","companyId","reference","createdAt") VALUES
    ('o-1','c1','ORD-2026-00001','2026-01-01T00:00:00Z'),
    ('o-2','c1','ORD-2026-00001','2026-01-01T00:00:05Z'),
    ('o-3','c2','ORD-2026-00001','2026-01-02T00:00:00Z');
`;

let PGlite;
let fresh; // () => Promise<db> seeded with DDL + SEED

before(async () => {
  ({ PGlite } = await import('@electric-sql/pglite'));
  fresh = async () => {
    const db = await new PGlite();
    await db.exec(DDL);
    await db.exec(SEED);
    return db;
  };
});

describe('the constraint cannot be created while duplicates exist', () => {
  test('index creation fails before de-duplication (the dedup step is load-bearing)', async () => {
    const { indexes } = readMigration();
    const db = await fresh();
    await assert.rejects(
      () => db.exec(indexes),
      /could not create unique index/i,
      'if this passes, the de-duplication is unnecessary and the migration should say so',
    );
    await db.close();
  });
});

describe('de-duplication', () => {
  test('the oldest row in each group keeps its provider id', async () => {
    const { dedup } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    const rows = await db.query(
      `SELECT "id","wabaMessageId" FROM "whatsapp_messages" WHERE "id" IN ('w-1','w-2','w-3') ORDER BY "id"`,
    );
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.wabaMessageId]));
    assert.equal(byId['w-1'], 'waba.retried', 'the oldest row keeps the provider id');
    assert.equal(byId['w-2'], null, 'the later copy is nulled');
    assert.equal(byId['w-3'], null, 'the later copy is nulled');
    await db.close();
  });

  test('message rows themselves survive — only the redundant pointer goes', async () => {
    const { dedup } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM "whatsapp_messages"`);
    assert.equal(rows[0].n, 6, 'no message row may be deleted');
    await db.close();
  });

  test('NULLs are not treated as duplicates of each other', async () => {
    const { dedup, indexes } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    // Two rows already had no provider id; a unique index must accept both.
    await db.exec(indexes);
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM "whatsapp_messages" WHERE "wabaMessageId" IS NULL`,
    );
    assert.equal(rows[0].n, 4, 'one kept id + two pre-existing NULLs + ... must all coexist');
    await db.close();
  });

  test('the oldest manifest keeps its code; the redundant copy is suffixed', async () => {
    const { dedup } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    const { rows } = await db.query(`SELECT "id","code" FROM "manifests" ORDER BY "id"`);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.code]));
    assert.equal(byId['m-1'], 'MAN-00001', 'oldest row keeps the original code');
    assert.equal(byId['m-2'], 'MAN-00001-dup2', 'redundant row is suffixed, not deleted');
    assert.equal(byId['m-3'], 'MAN-00002', 'an unaffected row is untouched');
    await db.close();
  });

  test('the same code in a different tenant is left alone (tenant-scoped, not global)', async () => {
    const { dedup } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    const { rows } = await db.query(`SELECT "code" FROM "manifests" WHERE "id" = 'm-4'`);
    assert.equal(rows[0].code, 'MAN-00001', 'company c2 legitimately has its own MAN-00001');
    await db.close();
  });

  test('courier references are handled the same way', async () => {
    const { dedup } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    const { rows } = await db.query(`SELECT "id","reference" FROM "courier_orders" ORDER BY "id"`);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.reference]));
    assert.equal(byId['o-1'], 'ORD-2026-00001');
    assert.equal(byId['o-2'], 'ORD-2026-00001-dup2');
    assert.equal(byId['o-3'], 'ORD-2026-00001', 'other tenant untouched');
    await db.close();
  });
});

describe('the applied migration', () => {
  test('the indexes are created once the data is clean', async () => {
    const { dedup, indexes } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    await db.exec(indexes);
    // ESCAPE is not decoration: in LIKE, `_` is a single-character wildcard,
    // so '%_key' would silently match every '*_pkey' primary key too.
    const { rows } = await db.query(
      `SELECT indexname FROM pg_indexes WHERE indexname LIKE '%!_key' ESCAPE '!' ORDER BY indexname`,
    );
    assert.deepEqual(rows.map((r) => r.indexname), [
      'courier_orders_companyId_reference_key',
      'manifests_companyId_code_key',
      'whatsapp_messages_wabaMessageId_key',
    ]);
    await db.close();
  });

  test('a duplicate insert is now rejected by the database', async () => {
    const { dedup, indexes } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    await db.exec(indexes);
    await assert.rejects(
      () =>
        db.exec(
          `INSERT INTO "whatsapp_messages" ("id","content","wabaMessageId","threadId") VALUES ('w-9','retry','waba.other','t-1')`,
        ),
      /duplicate key value|unique constraint/i,
    );
    await db.close();
  });

  test('a duplicate manifest code is rejected, a second tenant is not', async () => {
    const { dedup, indexes } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    await db.exec(indexes);
    await assert.rejects(
      () => db.exec(`INSERT INTO "manifests" ("id","companyId","code") VALUES ('m-9','c1','MAN-00002')`),
      /duplicate key value|unique constraint/i,
    );
    // Same code, different tenant: legal, must succeed.
    await db.exec(`INSERT INTO "manifests" ("id","companyId","code") VALUES ('m-10','c3','MAN-00002')`);
    await db.close();
  });

  test('re-running the de-duplication changes nothing (idempotent)', async () => {
    const { dedup } = readMigration();
    const db = await fresh();
    await db.exec(dedup);
    const snap = async () =>
      (await db.query(`SELECT "id","wabaMessageId" FROM "whatsapp_messages" ORDER BY "id"`)).rows;
    const first = await snap();
    await db.exec(dedup);
    const second = await snap();
    assert.deepEqual(second, first, 'a second pass must be a no-op');
    await db.close();
  });
});
