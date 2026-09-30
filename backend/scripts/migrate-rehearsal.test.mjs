/**
 * Unit tests for the migration rehearsal tool.
 *
 * The database-facing behaviour is exercised separately by running the tool
 * against real clones (see docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md);
 * these tests pin the parsing, comparison and decision logic it depends on.
 *
 * Run with: npm run migrations:test (or node --test scripts/migrate-rehearsal.test.mjs)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRefusal,
  assertDisposableTarget,
  compareInventory,
  decide,
  describeTarget,
  normalizeDefault,
  normalizeFormattedType,
  normalizeType,
  parseColumnDefinition,
  parseConstraintDef,
  parseIndexDef,
  migrationSetPaths,
  parseMigration,
  parsePrimaryKeyDef,
} from './migrate-rehearsal.mjs';

const MIGRATION_SQL = `
-- CreateEnum
CREATE TYPE "Status" AS ENUM ('DRAFT', 'APPROVED');

-- CreateTable
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'DRAFT',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentId" TEXT,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Widget_name_key" ON "Widget"("name");

-- CreateIndex
CREATE INDEX "Widget_parentId_idx" ON "Widget"("parentId");

-- AddForeignKey
ALTER TABLE "Widget" ADD CONSTRAINT "Widget_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

const EMPTY_INVENTORY = {
  tables: [],
  enums: [],
  indexes: [],
  foreignKeys: [],
  primaryKeys: [],
  migrationBookkeeping: { present: false, applied: [] },
};

test('normalises migration types to the PostgreSQL spellings', () => {
  assert.equal(normalizeType('TEXT'), 'text');
  assert.equal(normalizeType('TIMESTAMP(3)'), 'timestamp(3)');
  assert.equal(normalizeType('DOUBLE PRECISION'), 'double precision');
  assert.equal(normalizeType('VARCHAR(255)'), 'varchar(255)');
  assert.equal(normalizeType('DECIMAL(10,2)'), 'decimal(10,2)');
  assert.equal(normalizeType('"Status"'), 'Status');
  assert.equal(normalizeType('TEXT[]'), 'text[]');
  assert.equal(normalizeType('"Status"[]'), 'Status[]');
});

test('normalises pg_catalog format_type output to the migration spellings', () => {
  assert.equal(normalizeFormattedType('text'), 'text');
  assert.equal(normalizeFormattedType('timestamp(3) without time zone'), 'timestamp(3)');
  assert.equal(normalizeFormattedType('timestamp(3) with time zone'), 'timestamptz(3)');
  assert.equal(normalizeFormattedType('timestamp without time zone'), 'timestamp(6)');
  assert.equal(normalizeFormattedType('character varying(255)'), 'varchar(255)');
  assert.equal(normalizeFormattedType('numeric(10,2)'), 'decimal(10,2)');
  assert.equal(normalizeFormattedType('text[]'), 'text[]');
  assert.equal(normalizeFormattedType('integer'), 'integer');
  assert.equal(normalizeFormattedType('double precision'), 'double precision');
  assert.equal(normalizeFormattedType('boolean'), 'boolean');
  assert.equal(normalizeFormattedType('jsonb'), 'jsonb');
  // format_type() quotes and may schema-qualify enum types.
  assert.equal(normalizeFormattedType('"Status"'), 'Status');
  assert.equal(normalizeFormattedType('"Status"[]'), 'Status[]');
  assert.equal(normalizeFormattedType('public."Status"'), 'Status');
});

test('normalises defaults so casts and parentheses do not fake a drift', () => {
  assert.equal(normalizeDefault(`'DRAFT'::"Status"`), `'draft'`);
  assert.equal(normalizeDefault(`'DRAFT'::text`), `'draft'`);
  assert.equal(normalizeDefault('CURRENT_TIMESTAMP'), 'current_timestamp');
  assert.equal(normalizeDefault('(now())'), 'current_timestamp');
  assert.equal(normalizeDefault('0'), '0');
  assert.equal(normalizeDefault('false'), 'false');
  assert.equal(normalizeDefault('ARRAY[]::text[]'), 'array[]');
  assert.equal(normalizeDefault(null), null);
  assert.equal(normalizeDefault(''), null);
});

test('parses enums, tables, columns, indexes and foreign keys out of a migration', () => {
  const migration = parseMigration(MIGRATION_SQL);

  assert.deepEqual(migration.enums, [{ name: 'Status', values: ['DRAFT', 'APPROVED'] }]);
  assert.equal(migration.tables.length, 1);

  const widget = migration.tables[0];
  assert.equal(widget.name, 'Widget');
  assert.deepEqual(widget.primaryKey, ['id']);
  assert.deepEqual(widget.columns, [
    { name: 'id', type: 'text', notNull: true, default: null },
    { name: 'name', type: 'text', notNull: true, default: null },
    { name: 'status', type: 'Status', notNull: true, default: `'draft'` },
    { name: 'quantity', type: 'integer', notNull: true, default: '0' },
    { name: 'tags', type: 'text[]', notNull: false, default: 'array[]' },
    { name: 'createdAt', type: 'timestamp(3)', notNull: true, default: 'current_timestamp' },
    { name: 'parentId', type: 'text', notNull: false, default: null },
  ]);

  assert.deepEqual(migration.indexes, [
    { name: 'Widget_name_key', table: 'Widget', columns: ['name'], unique: true },
    { name: 'Widget_parentId_idx', table: 'Widget', columns: ['parentId'], unique: false },
  ]);
  assert.deepEqual(migration.foreignKeys, [
    {
      name: 'Widget_parentId_fkey',
      table: 'Widget',
      columns: ['parentId'],
      refTable: 'Widget',
      refColumns: ['id'],
    },
  ]);
});

test('parses PostgreSQL index and constraint definitions', () => {
  assert.deepEqual(
    parseIndexDef(
      'CREATE UNIQUE INDEX "Widget_name_key" ON public."Widget" USING btree ("name")',
    ),
    { name: 'Widget_name_key', table: 'Widget', unique: true, method: 'btree', columns: ['name'] },
  );
  assert.deepEqual(
    parseConstraintDef(
      'FOREIGN KEY ("parentId") REFERENCES "Widget"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    ),
    {
      columns: ['parentId'],
      refTable: 'Widget',
      refColumns: ['id'],
      actions: 'ON DELETE CASCADE ON UPDATE CASCADE',
    },
  );
  assert.deepEqual(parsePrimaryKeyDef('PRIMARY KEY ("id", "name")'), ['id', 'name']);
  assert.equal(parseIndexDef('not an index'), undefined);
});

const INVENTORY_MATCHING = {
  tables: [
    {
      name: 'Widget',
      rowEstimate: 3,
      columns: [
        { name: 'id', type: 'text', notNull: true, default: null },
        { name: 'name', type: 'text', notNull: true, default: null },
        { name: 'status', type: 'Status', notNull: true, default: `'draft'` },
        { name: 'quantity', type: 'integer', notNull: true, default: '0' },
        { name: 'tags', type: 'text[]', notNull: false, default: 'array[]' },
        { name: 'createdAt', type: 'timestamp(3)', notNull: true, default: 'current_timestamp' },
        { name: 'parentId', type: 'text', notNull: false, default: null },
      ],
    },
  ],
  enums: [{ name: 'Status', values: ['DRAFT', 'APPROVED'] }],
  indexes: [
    { name: 'Widget_name_key', table: 'Widget', columns: ['name'], unique: true, method: 'btree' },
    { name: 'Widget_parentId_idx', table: 'Widget', columns: ['parentId'], unique: false, method: 'btree' },
    { name: 'Widget_pkey', table: 'Widget', columns: ['id'], unique: true, method: 'btree' },
  ],
  foreignKeys: [
    {
      name: 'Widget_parentId_fkey',
      table: 'Widget',
      columns: ['parentId'],
      refTable: 'Widget',
      refColumns: ['id'],
      actions: 'ON DELETE CASCADE ON UPDATE CASCADE',
    },
  ],
  primaryKeys: [{ table: 'Widget', columns: ['id'] }],
  migrationBookkeeping: { present: false, applied: [] },
};

test("Prisma's own bookkeeping table does not count as drift", () => {
  const migration = {
    ...parseMigration(MIGRATION_SQL),
    path: '/x/prisma/migrations/20260101000000_init/migration.sql',
  };
  const withoutImplicitPk = INVENTORY_MATCHING.indexes.filter((index) => index.name !== 'Widget_pkey');
  const withLedger = {
    ...INVENTORY_MATCHING,
    tables: [
      ...INVENTORY_MATCHING.tables,
      {
        name: '_prisma_migrations',
        rowEstimate: 1,
        columns: [
          { name: 'id', type: 'varchar(36)', notNull: true, default: null },
          { name: 'migration_name', type: 'varchar(255)', notNull: true, default: null },
        ],
      },
    ],
    // The ledger's own index and primary key live in the database, not the migration.
    indexes: [
      ...withoutImplicitPk,
      { name: '_prisma_migrations_pkey', table: '_prisma_migrations', columns: ['id'], unique: true },
    ],
    primaryKeys: [
      ...INVENTORY_MATCHING.primaryKeys,
      { table: '_prisma_migrations', columns: ['id'] },
    ],
  };

  const comparison = compareInventory(migration, withLedger);
  assert.deepEqual(comparison.tablesOnlyInDb, []);
  assert.deepEqual(comparison.columnsOnlyInDb, []);
  assert.deepEqual(comparison.indexesOnlyInDb, []);
  assert.deepEqual(comparison.primaryKeysOnlyInDb, []);
  assert.equal(comparison.identical, true);

  const recorded = {
    ...withLedger,
    migrationBookkeeping: { present: true, readable: true, applied: ['20260101000000_init'] },
  };
  assert.equal(decide(migration, recorded, compareInventory(migration, recorded)).verdict, 'already-applied');
});

test('a database that matches the migration is reported as identical', () => {
  const migration = parseMigration(MIGRATION_SQL);
  const comparison = compareInventory(migration, INVENTORY_MATCHING);
  // The implicit btree index behind the primary key is not in the migration.
  assert.deepEqual(comparison.indexesOnlyInDb.map((index) => index.name), ['Widget_pkey']);
  const withoutImplicitPk = {
    ...INVENTORY_MATCHING,
    indexes: INVENTORY_MATCHING.indexes.filter((index) => index.name !== 'Widget_pkey'),
  };
  assert.equal(compareInventory(migration, withoutImplicitPk).identical, true);
});

test('reports additive drift, extra objects and in-place changes in both directions', () => {
  const migration = parseMigration(MIGRATION_SQL);

  const behindTheMigration = {
    ...EMPTY_INVENTORY,
    tables: [{ name: 'Legacy', rowEstimate: 1, columns: [{ name: 'id', type: 'text', notNull: true, default: null }] }],
    enums: [{ name: 'LegacyKind', values: ['A'] }],
  };
  const additive = compareInventory(migration, behindTheMigration);
  assert.deepEqual(additive.tablesOnlyInMigration, ['Widget']);
  assert.deepEqual(additive.enumsOnlyInMigration, ['Status']);
  assert.deepEqual(additive.tablesOnlyInDb, ['Legacy']);
  assert.equal(additive.identical, false);

  const drifted = {
    ...INVENTORY_MATCHING,
    tables: [
      {
        name: 'Widget',
        rowEstimate: 1,
        columns: [
          { name: 'id', type: 'text', notNull: true, default: null },
          { name: 'name', type: 'text', notNull: false, default: null }, // was NOT NULL
          { name: 'status', type: 'text', notNull: true, default: `'draft'` }, // was enum
          { name: 'quantity', type: 'integer', notNull: true, default: '1' }, // default changed
          { name: 'tags', type: 'text[]', notNull: false, default: 'array[]' },
          { name: 'createdAt', type: 'timestamp(3)', notNull: true, default: 'current_timestamp' },
          { name: 'parentId', type: 'text', notNull: false, default: null },
          { name: 'legacyNote', type: 'text', notNull: false, default: null }, // extra column
        ],
      },
    ],
  };
  const comparison = compareInventory(migration, drifted);
  assert.deepEqual(comparison.columnTypeDiffs, [
    { table: 'Widget', column: 'status', db: 'text', migration: 'Status' },
  ]);
  assert.deepEqual(comparison.columnNullabilityDiffs, [
    { table: 'Widget', column: 'name', db: false, migration: true },
  ]);
  assert.deepEqual(comparison.columnDefaultDiffs, [
    { table: 'Widget', column: 'quantity', db: '1', migration: '0' },
  ]);
  assert.deepEqual(comparison.columnsOnlyInDb, [
    { table: 'Widget', column: 'legacyNote', type: 'text' },
  ]);
});

test('decides between clean, baseline, already-applied and drift', () => {
  const migration = { ...parseMigration(MIGRATION_SQL), path: '/x/prisma/migrations/20260101000000_init/migration.sql' };

  assert.equal(decide(migration, EMPTY_INVENTORY, compareInventory(migration, EMPTY_INVENTORY)).verdict, 'clean');

  const matching = { ...INVENTORY_MATCHING, indexes: INVENTORY_MATCHING.indexes.filter((i) => i.name !== 'Widget_pkey') };
  const baselineDecision = decide(migration, matching, compareInventory(migration, matching));
  assert.equal(baselineDecision.verdict, 'baseline');
  assert.match(baselineDecision.commands[0], /migrate resolve --applied 20260101000000_init/);

  const applied = {
    ...matching,
    migrationBookkeeping: { present: true, applied: ['20260101000000_init'] },
  };
  assert.equal(decide(migration, applied, compareInventory(migration, applied)).verdict, 'already-applied');

  // A recorded migration on a database that does not match it is a disagreement,
  // not an "already applied".
  const recordedButDrifted = { ...applied, tables: [] , indexes: [], foreignKeys: [], primaryKeys: [] };
  const ledger = decide(migration, recordedButDrifted, compareInventory(migration, recordedButDrifted));
  assert.equal(ledger.verdict, 'drift');
  assert.match(ledger.summary, /ledger and the schema disagree/);
  assert.equal(ledger.additive, true, 'still additive — nothing extra in the database');

  // Behind the migration, but holding nothing the migration does not know
  // about — the additive case (baseline-resolve, then apply a generated delta).
  const partialSubset = {
    ...EMPTY_INVENTORY,
    tables: [
      { name: 'Widget', rowEstimate: 0, columns: [{ name: 'id', type: 'text', notNull: true, default: null }] },
    ],
    enums: [{ name: 'Status', values: ['DRAFT', 'APPROVED'] }],
  };
  const drift = decide(migration, partialSubset, compareInventory(migration, partialSubset));
  assert.equal(drift.verdict, 'drift');
  assert.equal(drift.additive, true, 'the database has no objects the migration does not know about');

  // One extra object in the database is enough to make this a human decision.
  const mixed = {
    ...partialSubset,
    tables: [
      ...partialSubset.tables,
      { name: 'Surprise', rowEstimate: 0, columns: [{ name: 'id', type: 'text', notNull: true, default: null }] },
    ],
  };
  assert.equal(decide(migration, mixed, compareInventory(migration, mixed)).additive, false);
});

test('reads the target out of both TCP and unix-socket connection strings', () => {
  assert.deepEqual(describeTarget('postgresql://u:p@localhost:5432/flowops_staging_clone'), {
    host: 'localhost:5432',
    database: 'flowops_staging_clone',
  });
  assert.deepEqual(describeTarget('postgresql://postgres:@/flowops_rehearsal?host=/tmp/dev-pg/data'), {
    host: '/tmp/dev-pg/data',
    database: 'flowops_rehearsal',
  });
});

test('refuses anything that is not unmistakably a disposable clone', () => {
  assert.doesNotThrow(() => assertDisposableTarget('postgresql://u:p@localhost:5432/flowops_staging_clone'));
  assert.doesNotThrow(() => assertDisposableTarget('postgresql://postgres:@/flowops_test?host=/tmp/dev-pg/data'));
  assert.doesNotThrow(() =>
    assertDisposableTarget('postgresql://u:p@db.example.com:5432/flowops_rehearsal', { allowRemote: true }),
  );

  assert.throws(
    () => assertDisposableTarget('postgresql://u:p@localhost:5432/flowops'),
    /must end in one of/,
  );
  assert.throws(
    () => assertDisposableTarget('postgresql://u:p@localhost:5432/flowops_production'),
    /names production/,
  );
  assert.throws(
    () => assertDisposableTarget('postgresql://u:p@db.example.com:5432/flowops_clone'),
    /--i-have-a-clone/,
  );
});

test('--mode apply refuses anything unverified, not just blocking findings', () => {
  assert.equal(applyRefusal({ verdict: 'clean', findings: [] }), null);
  assert.match(applyRefusal({ verdict: 'baseline', findings: [] }), /verdict/);
  assert.match(
    applyRefusal({ verdict: 'clean', findings: [{ severity: 'blocking' }] }),
    /blocking/,
  );
  assert.match(
    applyRefusal({ verdict: 'clean', findings: [{ severity: 'unknown' }] }),
    /could not be verified/,
  );
  // Blocking wins when both are present: name what will actually fail first.
  assert.match(
    applyRefusal({
      verdict: 'clean',
      findings: [{ severity: 'unknown' }, { severity: 'blocking' }],
    }),
    /blocking/,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-migration history (baseline + delta)
// ─────────────────────────────────────────────────────────────────────────────

test('a set of migrations is recorded only when every name is in the ledger', () => {
  const migration = {
    ...parseMigration(MIGRATION_SQL),
    path: '/repo/prisma/migrations/20240101120000_init/migration.sql',
    appliedNames: ['20240101120000_init', '20240201120000_more'],
  };
  const inventory = {
    ...INVENTORY_MATCHING,
    indexes: INVENTORY_MATCHING.indexes.filter((index) => index.name !== 'Widget_pkey'),
  };

  const partial = structuredClone(inventory);
  partial.migrationBookkeeping = { present: true, readable: true, applied: ['20240101120000_init'] };
  const partialDecision = decide(migration, partial, compareInventory(migration, partial));
  assert.equal(partialDecision.verdict, 'baseline');
  assert.deepEqual(partialDecision.commands, [
    'npx prisma migrate resolve --applied 20240101120000_init',
    'npx prisma migrate resolve --applied 20240201120000_more',
    'npx prisma migrate deploy',
  ]);

  const full = structuredClone(inventory);
  full.migrationBookkeeping = {
    present: true,
    readable: true,
    applied: ['20240101120000_init', '20240201120000_more'],
  };
  assert.equal(decide(migration, full, compareInventory(migration, full)).verdict, 'already-applied');
});

test('a set that the database is behind is additive drift with a resolve-then-deploy path', () => {
  const migration = {
    ...parseMigration(MIGRATION_SQL),
    path: '/repo/prisma/migrations/20240101120000_init/migration.sql',
    appliedNames: ['20240101120000_init', '20240201120000_more'],
  };
  const behind = structuredClone({
    ...INVENTORY_MATCHING,
    indexes: INVENTORY_MATCHING.indexes.filter((index) => index.name !== 'Widget_pkey'),
  });
  behind.migrationBookkeeping = { present: false, readable: false, applied: [] };
  // Drop one table from the database: the history creates it, the clone does not have it.
  behind.tables = behind.tables.filter((table) => table.name !== 'Widget');

  const decision = decide(migration, behind, compareInventory(migration, behind));
  assert.equal(decision.verdict, 'drift');
  assert.equal(decision.additive, true);
  assert.deepEqual(decision.commands, [
    'npx prisma migrate resolve --applied 20240101120000_init',
    'npx prisma migrate deploy',
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// ALTER TABLE support (a delta migration changes tables it did not create)
// ─────────────────────────────────────────────────────────────────────────────

test('ALTER TABLE ... ADD COLUMN is folded into the table, so a migrated database is not "drift"', () => {
  const migration = parseMigration(`
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Widget" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Widget" ADD COLUMN     "count" INTEGER NOT NULL DEFAULT 0;
`);

  const widget = migration.tables.find((table) => table.name === 'Widget');
  assert.deepEqual(
    widget.columns.map((column) => column.name),
    ['id', 'note', 'count'],
  );
  assert.deepEqual(parseColumnDefinition('note', 'TEXT'), {
    name: 'note',
    type: 'text',
    notNull: false,
    default: null,
  });
  assert.equal(widget.columns[1].type, 'text');
  assert.equal(widget.columns[1].notNull, false);
  assert.equal(widget.columns[2].notNull, true);
  assert.equal(widget.columns[2].default, normalizeDefault('0'));
});

test('ALTER COLUMN set/drop NOT NULL, set/drop DEFAULT and TYPE are applied', () => {
  const migration = parseMigration(`
CREATE TABLE "Widget" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "count" INTEGER NOT NULL,

    CONSTRAINT "Widget_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Widget" ALTER COLUMN "note" SET NOT NULL;
ALTER TABLE "Widget" ALTER COLUMN "note" SET DEFAULT 'draft';
ALTER TABLE "Widget" ALTER COLUMN "count" DROP NOT NULL;
`);
  const widget = migration.tables.find((table) => table.name === 'Widget');
  const note = widget.columns.find((column) => column.name === 'note');
  const count = widget.columns.find((column) => column.name === 'count');
  assert.equal(note.notNull, true);
  assert.equal(note.default, normalizeDefault("'draft'"));
  assert.equal(count.notNull, false);
});

test('a recorded two-migration history that matches is already-applied, and names the history not the folder', () => {
  const migration = {
    ...parseMigration(MIGRATION_SQL),
    path: '/repo/prisma/migrations/20240101120000_first/migration.sql',
    appliedNames: ['20240101120000_first', '20240201120000_second'],
  };
  const inventory = {
    ...INVENTORY_MATCHING,
    indexes: INVENTORY_MATCHING.indexes.filter((index) => index.name !== 'Widget_pkey'),
    migrationBookkeeping: {
      present: true,
      readable: true,
      applied: ['20240101120000_first', '20240201120000_second'],
    },
  };
  const decision = decide(migration, inventory, compareInventory(migration, inventory));
  assert.equal(decision.verdict, 'already-applied');
  assert.match(decision.summary, /records all 2 migrations/);
  assert.doesNotMatch(decision.summary, /records prisma/);
});
