/**
 * Unit tests for the migration guard and review tools.
 *
 * Run with: npm run migrations:test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { checkMigrations, lockProvider, schemaProvider } from './verify-migrations.mjs';
import {
  compareTables,
  createdTables,
  findDestructive,
  migrationSqlFiles,
  modelTables,
  splitStatements,
  summariseStatements,
} from './review-migration.mjs';

const SCHEMA = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Widget {
  id String @id
}
`;

function fixture({ migrations = {}, lock = 'provider = "postgresql"\n', schema = SCHEMA } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'flowops-migrations-'));
  const migrationsDir = path.join(root, 'migrations');
  mkdirSync(migrationsDir, { recursive: true });
  if (lock !== null) writeFileSync(path.join(migrationsDir, 'migration_lock.toml'), lock);
  for (const [name, sql] of Object.entries(migrations)) {
    const dir = path.join(migrationsDir, name);
    mkdirSync(dir, { recursive: true });
    if (sql !== null) writeFileSync(path.join(dir, 'migration.sql'), sql);
  }
  const schemaPath = path.join(root, 'schema.prisma');
  writeFileSync(schemaPath, schema);
  return { root, migrationsDir, schemaPath, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('accepts a well-formed migrations directory', () => {
  const f = fixture({ migrations: { '20240101120000_init': 'CREATE TABLE "Widget" ("id" TEXT);' } });
  const result = checkMigrations(f);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.migrations.length, 1);
  assert.equal(result.schemaProvider, 'postgresql');
  f.cleanup();
});

test('warns that migration inventory validation is not migration-review or deployment approval', () => {
  const f = fixture({
    migrations: {
      '20240101120000_init': 'CREATE TABLE "Widget" ("id" TEXT);',
      '20240201120000_more': 'ALTER TABLE "Widget" ADD COLUMN "name" TEXT;',
    },
  });
  const result = checkMigrations(f);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, [
    '2 migration(s) present; this check validates file/provider shape only and does not attest migration review, data compatibility, or deployment safety.',
  ]);
  f.cleanup();
});

test('fails when the directory is missing or empty — deploy would silently no-op', () => {
  const missing = checkMigrations({
    migrationsDir: path.join(tmpdir(), 'flowops-does-not-exist'),
    schemaPath: 'prisma/schema.prisma',
  });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join('\n'), /No migrations directory/);

  const f = fixture();
  const empty = checkMigrations(f);
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join('\n'), /no migration/);
  f.cleanup();
});

test('rejects a migration folder without, or with an empty, migration.sql', () => {
  const f = fixture({
    migrations: {
      '20240101120000_init': null,
      '20240101120001_second': '   \n',
    },
  });
  const result = checkMigrations(f);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /has no migration.sql/);
  assert.match(result.errors.join('\n'), /empty migration.sql/);
  f.cleanup();
});

test('rejects a lock file whose provider disagrees with the schema', () => {
  const f = fixture({
    migrations: { '20240101120000_init': 'CREATE TABLE "Widget" ("id" TEXT);' },
    lock: 'provider = "mysql"\n',
  });
  const result = checkMigrations(f);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /declares provider "mysql".*"postgresql"/);
  f.cleanup();
});

test('rejects migration folder names Prisma would not order', () => {
  const f = fixture({
    migrations: { banana: 'CREATE TABLE "Widget" ("id" TEXT);' },
  });
  const result = checkMigrations(f);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /banana/);
  f.cleanup();
});

test('parses the schema datasource and lock file providers', () => {
  assert.equal(schemaProvider(SCHEMA), 'postgresql');
  assert.equal(schemaProvider('model X { id String @id }'), undefined);
  assert.equal(lockProvider('provider = "postgresql"'), 'postgresql');
  assert.equal(lockProvider('nothing here'), undefined);
});

test('splits Prisma-style SQL into statements, keeping CREATE TABLE blocks intact', () => {
  const statements = splitStatements(
    [
      '-- CreateTable',
      'CREATE TABLE "Widget" (',
      '    "id" TEXT NOT NULL,',
      '    "name" TEXT,',
      '    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")',
      ');',
      '',
      '-- CreateIndex',
      'CREATE INDEX "Widget_name_idx" ON "Widget"("name");',
    ].join('\n'),
  );
  assert.equal(statements.length, 2);
  assert.match(statements[0], /^CREATE TABLE "Widget"/);
  assert.match(statements[1], /^CREATE INDEX/);
});

test('classifies every statement it is given', () => {
  const statements = splitStatements(
    [
      'CREATE TYPE "Foo" AS ENUM (\'A\');',
      'CREATE TABLE "Widget" (',
      '    "id" TEXT NOT NULL',
      ');',
      'CREATE UNIQUE INDEX "Widget_id_key" ON "Widget"("id");',
      'ALTER TABLE "Widget" ADD CONSTRAINT "Widget_pkey" PRIMARY KEY ("id");',
      'ALTER TABLE "Other" ADD CONSTRAINT "Other_fk" FOREIGN KEY ("id") REFERENCES "Widget"("id");',
    ].join('\n'),
  );
  const counts = summariseStatements(statements);
  assert.equal(counts['CREATE TYPE (enum)'], 1);
  assert.equal(counts['CREATE TABLE'], 1);
  assert.equal(counts['CREATE UNIQUE INDEX'], 1);
  assert.equal(counts['ADD PRIMARY KEY'], 1);
  assert.equal(counts['ADD FOREIGN KEY'], 1);
  assert.equal(
    Object.keys(counts).filter((k) => k.startsWith('UNCLASSIFIED')).length,
    0,
  );
});

test('finds destructive operations, and none in a purely additive migration', () => {
  const additive = splitStatements(
    [
      'CREATE TABLE "Widget" (',
      '    "id" TEXT NOT NULL',
      ');',
      'ALTER TABLE "Widget" ADD CONSTRAINT "Widget_pkey" PRIMARY KEY ("id");',
    ].join('\n'),
  );
  assert.deepEqual(findDestructive(additive), []);

  const destructive = splitStatements(
    [
      'ALTER TABLE "Widget" DROP COLUMN "legacy";',
      'DROP TABLE "Old";',
      'TRUNCATE "Widget";',
      'DELETE FROM "Widget" WHERE "id" IS NULL;',
      'ALTER TABLE "Widget" ALTER COLUMN "name" TYPE VARCHAR(10);',
    ].join('\n'),
  );
  const found = findDestructive(destructive);
  assert.equal(found.length, 5);
  assert.deepEqual(
    found.map((f) => f.what),
    ['ALTER TABLE ... DROP', 'DROP', 'TRUNCATE', 'DELETE FROM', 'ALTER COLUMN ... TYPE (rewrite)'],
  );
});

test('compares migration tables against schema models in both directions', () => {
  const statements = splitStatements(
    ['CREATE TABLE "Widget" (', '    "id" TEXT NOT NULL', ');'].join('\n'),
  );
  const tables = createdTables(statements);
  assert.deepEqual(tables, ['Widget']);

  const models = modelTables(`
model Widget {
  id String @id
}

model Mapped {
  id String @id
  @@map("mapped_things")
}

model Ignored {
  id String @id
  @@ignore
}
`);
  assert.deepEqual(models, [
    { model: 'Widget', table: 'Widget' },
    { model: 'Mapped', table: 'mapped_things' },
  ]);

  const mismatch = compareTables(['Widget', 'mapped_things', 'stale_table'], [
    ...models,
    { model: 'Missing', table: 'missing' },
  ]);
  assert.deepEqual(mismatch.modelsWithoutTable, [{ model: 'Missing', table: 'missing' }]);
  assert.deepEqual(mismatch.tablesWithoutModel, ['stale_table']);

  const aligned = compareTables(['Widget', 'mapped_things'], models);
  assert.deepEqual(aligned.modelsWithoutTable, []);
  assert.deepEqual(aligned.tablesWithoutModel, []);
});

test('lists migration files in the order Prisma applies them', () => {
  const f = fixture({
    migrations: {
      '20240101120000_init': 'CREATE TABLE "Widget" ("id" TEXT);',
      '20240201120000_more': 'CREATE TABLE "Gadget" ("id" TEXT);',
    },
  });
  assert.deepEqual(
    migrationSqlFiles(f.migrationsDir).map((file) => path.basename(path.dirname(file))),
    ['20240101120000_init', '20240201120000_more'],
  );
  f.cleanup();
});
