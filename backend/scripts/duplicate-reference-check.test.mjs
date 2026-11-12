/**
 * Tests for scripts/duplicate-reference-check.mjs.
 *
 * The check exists so nobody deploys the unique-constraint migration blind.
 * A duplicate check that FAILS to find a duplicate is worse than no check at
 * all, because it hands out a clean bill of health — so these tests run the
 * real queries from the script against a real Postgres (PGlite) seeded with
 * duplicates, and assert they are found.
 *
 * They also pin the two scoping decisions that are easy to get wrong:
 *   * NULL wabaMessageId values are not duplicates of each other (Postgres
 *     allows any number of NULLs under a unique index), and
 *   * the same code in two different companies is NOT a duplicate.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import { CHECKS, run } from './duplicate-reference-check.mjs';

const DDL = `
  CREATE TABLE "whatsapp_messages" (
    "id" text PRIMARY KEY, "content" text NOT NULL, "wabaMessageId" text,
    "threadId" text NOT NULL, "direction" text NOT NULL, "sentAt" timestamptz NOT NULL
  );
  CREATE TABLE "manifests" (
    "id" text PRIMARY KEY, "companyId" text NOT NULL, "code" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  );
  CREATE TABLE "courier_orders" (
    "id" text PRIMARY KEY, "companyId" text NOT NULL, "reference" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  );
`;

const SEED = `
  INSERT INTO "whatsapp_messages" VALUES
    ('w-1','a','waba.dup','t-1','INBOUND','2026-01-01T00:00:00Z'),
    ('w-2','b','waba.dup','t-1','INBOUND','2026-01-01T00:00:05Z'),
    ('w-3','c','waba.once','t-1','INBOUND','2026-01-02T00:00:00Z'),
    ('w-4','d', NULL,'t-1','INBOUND','2026-01-03T00:00:00Z'),
    ('w-5','e', NULL,'t-1','INBOUND','2026-01-04T00:00:00Z');

  INSERT INTO "manifests" VALUES
    ('m-1','c1','MAN-00001','2026-01-01T00:00:00Z'),
    ('m-2','c1','MAN-00001','2026-01-01T00:00:05Z'),
    ('m-3','c2','MAN-00001','2026-01-02T00:00:00Z');

  INSERT INTO "courier_orders" VALUES
    ('o-1','c1','ORD-2026-00001','2026-01-01T00:00:00Z'),
    ('o-2','c2','ORD-2026-00001','2026-01-02T00:00:00Z');
`;

let PGlite;
before(async () => {
  ({ PGlite } = await import('@electric-sql/pglite'));
});

async function seeded(withData) {
  const db = await new PGlite();
  await db.exec(DDL);
  if (withData) await db.exec(SEED);
  return db;
}

const groupFor = (results, name) => results.find((r) => r.name.startsWith(name)).groups;

describe('the check finds duplicates', () => {
  test('finds a repeated wabaMessageId', async () => {
    const db = await seeded(true);
    const groups = groupFor(await run(db), 'whatsapp_messages');
    assert.equal(groups.length, 1, 'exactly one duplicate group');
    assert.equal(groups[0].value, 'waba.dup');
    assert.equal(groups[0].n, 2);
    await db.close();
  });

  test('does not treat NULL provider ids as duplicates of each other', async () => {
    const db = await seeded(true);
    const groups = groupFor(await run(db), 'whatsapp_messages');
    assert.ok(
      groups.every((g) => g.value !== null),
      'two rows with no provider id are not a duplicate group',
    );
    await db.close();
  });

  test('finds a repeated manifest code within one company', async () => {
    const db = await seeded(true);
    const groups = groupFor(await run(db), 'manifests.code');
    assert.equal(groups.length, 1);
    assert.equal(groups[0].tenant, 'c1');
    assert.equal(groups[0].value, 'MAN-00001');
    await db.close();
  });

  test('does not call the same code in two companies a duplicate', async () => {
    // Tenant-scoped on purpose: a global unique on code would reject this.
    const db = await seeded(true);
    const groups = groupFor(await run(db), 'manifests.code');
    assert.ok(
      groups.every((g) => g.tenant === 'c1'),
      'c1 and c2 may both hold MAN-00001',
    );
    await db.close();
  });

  test('reports a clean database as clean', async () => {
    const db = await seeded(false);
    const results = await run(db);
    assert.deepEqual(
      results.map((r) => r.groups.length),
      [0, 0, 0],
    );
    await db.close();
  });
});

describe('the check itself', () => {
  test('covers all three references the migration constrains', () => {
    const names = CHECKS.map((c) => c.name).join(' | ');
    assert.ok(/whatsapp_messages/.test(names));
    assert.ok(/manifests/.test(names));
    assert.ok(/courier_orders/.test(names));
    assert.equal(CHECKS.length, 3);
  });

  test('is read-only — no statement may write', () => {
    // The whole point of this script is that it is safe to run on production.
    for (const c of CHECKS) {
      const sql = c.sql.toUpperCase();
      for (const forbidden of ['UPDATE', 'DELETE', 'INSERT', 'DROP', 'ALTER', 'CREATE']) {
        assert.ok(
          !new RegExp(`\\b${forbidden}\\b`).test(sql),
          `${c.name} contains ${forbidden}; this script must never write`,
        );
      }
    }
  });

  test('each check explains why duplicates happen and what the migration will do', () => {
    for (const c of CHECKS) {
      assert.ok(c.explain && c.explain.length > 40, `${c.name} needs a why`);
      assert.ok(c.remedy && c.remedy.length > 20, `${c.name} needs a remedy`);
    }
  });
});
