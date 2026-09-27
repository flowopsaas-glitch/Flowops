#!/usr/bin/env node
/**
 * Migration rehearsal against a disposable clone of an existing database.
 *
 * A clean disposable database proves a migration is syntactically valid; it does
 * not prove the migration is safe for a database that already holds data. This
 * tool answers the questions that decision actually needs:
 *
 *   1. what does the existing database contain (tables, enums, indexes,
 *      constraints, row estimates)?
 *   2. how does it differ from the migration — missing objects, extra objects,
 *      columns whose type/nullability/default changed?
 *   3. must the migration be applied, or marked as an already-applied baseline
 *      because the database already matches it?
 *   4. are the data-preserving alterations safe — would the unique indexes,
 *      foreign keys or NOT NULL columns the migration expects be rejected by
 *      the rows that actually exist?
 *
 * Read-only by default. `--mode apply` only ever runs on a target that passed
 * the guards below and only when the verdict says applying is the right move.
 *
 * Usage:
 *   node scripts/migrate-rehearsal.mjs --url <clone-url> [--mode inspect|apply]
 *                                     [--migration <path>] [--schema <path>]
 *                                     [--report <file>] [--i-have-a-clone]
 *                                     [--confirm-apply]
 *
 * Exit codes: 0 = rehearsal completed (whatever the verdict), 1 = could not run
 * (guard refused, connection failed, unreadable migration).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, '..');

/** Database names this tool will ever touch. */
const DISPOSABLE_SUFFIXES = ['_clone', '_rehearsal', '_test', '_ci', '_ephemeral', '_shadow'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

// ─────────────────────────────────────────────────────────────────────────────
// Parsing the migration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical form for a column type, so a migration's `TIMESTAMP(3)` and
 * PostgreSQL's `timestamp without time zone` + precision 3 compare equal.
 */
export function normalizeType(raw) {
  const type = String(raw).trim().replace(/\s+/g, ' ');
  if (type.endsWith('[]')) return `${normalizeType(type.slice(0, -2))}[]`;
  const enumMatch = /^"([^"]+)"$/.exec(type);
  if (enumMatch) return enumMatch[1];

  const upper = type.toUpperCase();
  let match;
  if ((match = /^VARCHAR\((\d+)\)$/.exec(upper))) return `varchar(${match[1]})`;
  if ((match = /^DECIMAL\((\d+),(\d+)\)$/.exec(upper))) return `decimal(${match[1]},${match[2]})`;
  if ((match = /^NUMERIC\((\d+),(\d+)\)$/.exec(upper))) return `decimal(${match[1]},${match[2]})`;
  if ((match = /^TIMESTAMP\((\d)\)$/.exec(upper))) return `timestamp(${match[1]})`;
  if ((match = /^TIMESTAMPTZ\((\d)\)$/.exec(upper))) return `timestamptz(${match[1]})`;
  if (upper === 'TEXT') return 'text';
  if (upper === 'DOUBLE PRECISION') return 'double precision';
  if (upper === 'INTEGER' || upper === 'INT' || upper === 'INT4') return 'integer';
  if (upper === 'BIGINT' || upper === 'INT8') return 'bigint';
  if (upper === 'BOOLEAN' || upper === 'BOOL') return 'boolean';
  if (upper === 'JSONB') return 'jsonb';
  if (upper === 'UUID') return 'uuid';
  if (upper === 'DATE') return 'date';
  return upper.toLowerCase();
}

/** Canonical form for the same type as reported by information_schema. */
/**
 * Normalise `format_type()` output (what pg_catalog hands back) into the same
 * spellings the migration uses. `format_type` is the canonical DDL text, so
 * this needs fewer special cases than information_schema, but PostgreSQL spells
 * timestamps in full and defaults the precision to 6.
 */
export function normalizeFormattedType(formatted) {
  // format_type() schema-qualifies a type that is not on the caller's search path.
  const raw = String(formatted).trim().replace(/\s+/g, ' ').replace(/^public\./, '');
  const arrayMatch = /^(.*)\[\]$/.exec(raw);
  if (arrayMatch) return `${normalizeFormattedType(arrayMatch[1])}[]`;
  let match;
  if ((match = /^timestamp\((\d+)\) without time zone$/.exec(raw))) return `timestamp(${match[1]})`;
  if ((match = /^timestamp\((\d+)\) with time zone$/.exec(raw))) return `timestamptz(${match[1]})`;
  if (raw === 'timestamp without time zone') return 'timestamp(6)';
  if (raw === 'timestamp with time zone') return 'timestamptz(6)';
  if ((match = /^character varying\((\d+)\)$/.exec(raw))) return `varchar(${match[1]})`;
  if (raw === 'character varying') return 'varchar';
  if ((match = /^character\((\d+)\)$/.exec(raw))) return `char(${match[1]})`;
  if ((match = /^numeric\((\d+),(\d+)\)$/.exec(raw))) return `decimal(${match[1]},${match[2]})`;
  return normalizeType(raw);
}

/**
 * Defaults are stored as expressions, so `'PENDING'` comes back as
 * `'PENDING'::"ApprovalStatus"` and `CURRENT_TIMESTAMP` may be wrapped in
 * parentheses. Normalise both sides; a difference that survives this is worth a
 * human look, but harmless spelling differences should not fake a drift.
 */
export function normalizeDefault(raw) {
  if (raw === null || raw === undefined) return null;
  let value = String(raw).trim();
  if (value === '') return null;
  value = value.replace(/::"?[a-zA-Z_][\w ]*"?(\(\d+(,\d+)?\))?(\[\])?/g, '');
  while (/^\(.*\)$/.test(value) && balanced(value)) value = value.slice(1, -1).trim();
  return value
    .replace(/\s+/g, ' ')
    .replace(/^now\(\)$/i, 'current_timestamp')
    .replace(/'([^']*)'/, "'$1'")
    .toLowerCase();
}

function balanced(value) {
  let depth = 0;
  for (const char of value) {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    if (depth === 0 && char !== value[value.length - 1]) return false;
  }
  return depth === 0;
}

/**
 * Parse the objects a migration creates. Prisma emits predictable shapes:
 * one-line CREATE TYPE / CREATE INDEX / ALTER TABLE ... FOREIGN KEY, and
 * CREATE TABLE blocks whose columns are one per line.
 */
export function parseMigration(sql) {
  const enums = [];
  const tables = [];
  const indexes = [];
  const foreignKeys = [];

  const lines = sql.split('\n');
  let block = null;

  const flush = () => {
    if (!block) return;
    tables.push({ name: block.name, columns: block.columns, primaryKey: block.primaryKey });
    block = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--')) continue;

    if (block) {
      if (line.startsWith(')')) {
        flush();
        continue;
      }
      const body = line.replace(/,$/, '');
      const primaryKey = /^CONSTRAINT\s+"[^"]+"\s+PRIMARY KEY\s+\(([^)]*)\)$/i.exec(body);
      if (primaryKey) {
        block.primaryKey = splitColumns(primaryKey[1]);
        continue;
      }
      if (/^CONSTRAINT\s+/i.test(body)) continue;
      const column = /^"([^"]+)"\s+(.+)$/.exec(body);
      if (!column) continue;
      let rest = column[2];
      let columnDefault = null;
      const defaultIndex = rest.indexOf(' DEFAULT ');
      if (defaultIndex !== -1) {
        columnDefault = normalizeDefault(rest.slice(defaultIndex + ' DEFAULT '.length));
        rest = rest.slice(0, defaultIndex);
      }
      let notNull = false;
      if (/ NOT NULL$/.test(rest)) {
        notNull = true;
        rest = rest.slice(0, -' NOT NULL'.length);
      }
      block.columns.push({
        name: column[1],
        type: normalizeType(rest),
        notNull,
        default: columnDefault,
      });
      continue;
    }

    const createTable = /^CREATE TABLE "([^"]+)"\s*\($/.exec(line);
    if (createTable) {
      block = { name: createTable[1], columns: [], primaryKey: undefined };
      continue;
    }

    const createEnum = /^CREATE TYPE "([^"]+)" AS ENUM \((.*)\);?$/i.exec(line);
    if (createEnum) {
      enums.push({ name: createEnum[1], values: splitLabels(createEnum[2]) });
      continue;
    }

    const createIndex = /^CREATE (UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"\s*\(([^)]*)\)/i.exec(line);
    if (createIndex) {
      indexes.push({
        name: createIndex[2],
        table: createIndex[3],
        columns: splitColumns(createIndex[4]),
        unique: Boolean(createIndex[1]),
      });
      continue;
    }

    const addForeignKey =
      /^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]*)\) REFERENCES "([^"]+)"\s*\(([^)]*)\)(.*)$/i.exec(
        line,
      );
    if (addForeignKey) {
      foreignKeys.push({
        name: addForeignKey[2],
        table: addForeignKey[1],
        columns: splitColumns(addForeignKey[3]),
        refTable: addForeignKey[4],
        refColumns: splitColumns(addForeignKey[5]),
      });
    }
  }
  flush();

  return { enums, tables, indexes, foreignKeys };
}

function splitColumns(list) {
  return list
    .split(',')
    .map((part) => part.trim().replace(/^"|"$/g, '').replace(/ (ASC|DESC)$/i, ''))
    .filter(Boolean);
}

function splitLabels(list) {
  return [...list.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1].replace(/''/g, "'"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Introspection
// ─────────────────────────────────────────────────────────────────────────────

export const QUERIES = {
  // pg_catalog, not information_schema: information_schema only shows objects the
  // connecting role has privileges on, which silently turns a limited role into a
  // bogus "empty database" reading.
  tables: `SELECT c.relname AS table_name
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            ORDER BY c.relname`,
  columns: `SELECT c.relname AS table_name,
                   a.attname AS column_name,
                   format_type(a.atttypid, a.atttypmod) AS formatted_type,
                   a.attnotnull AS not_null,
                   pg_get_expr(d.adbin, d.adrelid) AS column_default
              FROM pg_attribute a
              JOIN pg_class c ON c.oid = a.attrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
              LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
             WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
               AND a.attnum > 0 AND NOT a.attisdropped
             ORDER BY c.relname, a.attnum`,
  enums: `SELECT t.typname AS name, e.enumlabel AS label
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public'
          ORDER BY t.typname, e.enumsortorder`,
  indexes: `SELECT i.indexname, i.indexdef
            FROM pg_indexes i
            LEFT JOIN pg_class ic
              ON ic.relname = i.indexname
             AND ic.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
            LEFT JOIN pg_constraint con ON con.conindid = ic.oid
            WHERE i.schemaname = 'public' AND con.oid IS NULL
            ORDER BY i.indexname`,
  constraints: `SELECT c.conname AS name, c.contype AS type, rel.relname AS table_name,
                       pg_get_constraintdef(c.oid) AS definition
                FROM pg_constraint c
                JOIN pg_class rel ON rel.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = rel.relnamespace
                WHERE n.nspname = 'public' AND c.contype IN ('p', 'f', 'u')
                ORDER BY rel.relname, c.conname`,
  rowEstimates: `SELECT c.relname AS name, c.reltuples AS rows
                   FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
                  ORDER BY c.relname`,
  migrationBookkeeping: `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`,
  appliedMigrations: `SELECT migration_name FROM _prisma_migrations ORDER BY started_at`,
};

/** Parse a PostgreSQL index definition into the same shape as the migration's. */
export function parseIndexDef(indexdef) {
  const match =
    /^CREATE (UNIQUE )?INDEX (\S+) ON (?:(\w+)\.)?(\S+) USING (\w+) \((.*)\)$/.exec(indexdef.trim());
  if (!match) return undefined;
  return {
    // pg_indexes.indexdef quotes both the index and the table.
    name: match[2].replace(/"/g, ''),
    table: match[4].replace(/"/g, ''),
    unique: Boolean(match[1]),
    method: match[5],
    columns: splitColumns(match[6]),
  };
}

/** Parse `FOREIGN KEY ("a") REFERENCES t("b") ON DELETE ...` into the same shape. */
export function parseConstraintDef(definition) {
  const match =
    /^FOREIGN KEY \(([^)]*)\) REFERENCES ([^()]+)\(([^)]*)\)(.*)$/.exec(definition.trim());
  if (!match) return undefined;
  return {
    columns: splitColumns(match[1]),
    refTable: match[2].trim().replace(/"/g, '').replace(/^public\./, ''),
    refColumns: splitColumns(match[3]),
    actions: match[4].trim(),
  };
}

/** `PRIMARY KEY (a, b)` → ['a', 'b']. */
export function parsePrimaryKeyDef(definition) {
  const match = /^PRIMARY KEY \(([^)]*)\)$/.exec(definition.trim());
  return match ? splitColumns(match[1]) : undefined;
}

export async function readInventory(client) {
  const q = async (sql) => (await client.query(sql)).rows;
  const [tables, columns, enums, indexes, constraints, estimates, bookkeeping] = await Promise.all([
    q(QUERIES.tables),
    q(QUERIES.columns),
    q(QUERIES.enums),
    q(QUERIES.indexes),
    q(QUERIES.constraints),
    q(QUERIES.rowEstimates),
    q(QUERIES.migrationBookkeeping),
  ]);

  const estimateByName = new Map(
    estimates.map((row) => [row.name, Number(row.rows) < 0 ? null : Number(row.rows)]),
  );
  const enumMap = new Map();
  for (const row of enums) {
    if (!enumMap.has(row.name)) enumMap.set(row.name, []);
    enumMap.get(row.name).push(row.label);
  }

  let applied = [];
  let bookkeepingReadable = true;
  if (bookkeeping[0]?.present) {
    try {
      applied = await q(QUERIES.appliedMigrations);
    } catch {
      // The role can see that the table exists but cannot read it. Say so,
      // rather than claiming the migration was never applied.
      bookkeepingReadable = false;
    }
  }

  return {
    tables: tables.map((row) => ({
      name: row.table_name,
      rowEstimate: estimateByName.get(row.table_name) ?? null,
      columns: columns
        .filter((column) => column.table_name === row.table_name)
        .map((column) => ({
          name: column.column_name,
          type: normalizeFormattedType(column.formatted_type),
          notNull: column.not_null === true || column.not_null === 't',
          default: normalizeDefault(column.column_default),
        })),
    })),
    enums: [...enumMap.entries()].map(([name, values]) => ({ name, values })),
    indexes: indexes.map((row) => parseIndexDef(row.indexdef)).filter(Boolean),
    foreignKeys: constraints
      .filter((row) => row.type === 'f')
      .map((row) => ({ name: row.name, table: row.table_name, ...parseConstraintDef(row.definition) }))
      .filter((fk) => fk.columns),
    primaryKeys: constraints
      .filter((row) => row.type === 'p')
      .map((row) => ({ table: row.table_name, columns: parsePrimaryKeyDef(row.definition) }))
      .filter((pk) => pk.columns),
    migrationBookkeeping: {
      present: Boolean(bookkeeping[0]?.present),
      readable: bookkeepingReadable,
      applied: applied.map((row) => row.migration_name),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison
// ─────────────────────────────────────────────────────────────────────────────

const key = (table, columns) => `${table}(${columns.join(',')})`;

/**
 * Compare what the migration creates with what the database already has.
 * Everything is reported in both directions: objects only in the migration are
 * work to do, objects only in the database are schema the migration does not
 * know about (and therefore a migration-history question, not a code question).
 */
/**
 * Prisma's own ledger is bookkeeping, not application schema. It exists in any
 * database that `prisma migrate` has touched, and the migration never creates
 * it, so comparing it would make every real clone look drifted.
 */
export const LEDGER_TABLE = '_prisma_migrations';

export function compareInventory(migration, inventory) {
  const isLedger = (name) => name === LEDGER_TABLE;

  const migrationTables = new Map(migration.tables.map((table) => [table.name, table]));
  const dbTables = new Map(
    inventory.tables.filter((table) => !isLedger(table.name)).map((table) => [table.name, table]),
  );

  const tablesOnlyInMigration = [...migrationTables.keys()].filter((name) => !dbTables.has(name));
  const tablesOnlyInDb = [...dbTables.keys()].filter(
    (name) => !migrationTables.has(name) && !isLedger(name),
  );

  const columnsOnlyInMigration = [];
  const columnsOnlyInDb = [];
  const columnTypeDiffs = [];
  const columnNullabilityDiffs = [];
  const columnDefaultDiffs = [];

  for (const [name, table] of migrationTables) {
    const dbTable = dbTables.get(name);
    if (!dbTable) continue;
    const dbColumns = new Map(dbTable.columns.map((column) => [column.name, column]));
    for (const column of table.columns) {
      const dbColumn = dbColumns.get(column.name);
      if (!dbColumn) {
        columnsOnlyInMigration.push({ table: name, column: column.name, type: column.type });
        continue;
      }
      if (dbColumn.type !== column.type) {
        columnTypeDiffs.push({ table: name, column: column.name, db: dbColumn.type, migration: column.type });
      }
      if (dbColumn.notNull !== column.notNull) {
        columnNullabilityDiffs.push({ table: name, column: column.name, db: dbColumn.notNull, migration: column.notNull });
      }
      if ((dbColumn.default ?? null) !== (column.default ?? null)) {
        columnDefaultDiffs.push({
          table: name,
          column: column.name,
          db: dbColumn.default,
          migration: column.default,
        });
      }
    }
    for (const column of dbTable.columns) {
      if (!table.columns.some((candidate) => candidate.name === column.name)) {
        columnsOnlyInDb.push({ table: name, column: column.name, type: column.type });
      }
    }
  }

  const enumNames = (list) => new Map(list.map((entry) => [entry.name, entry]));
  const migrationEnums = enumNames(migration.enums);
  const dbEnums = enumNames(inventory.enums);
  const enumsOnlyInMigration = [...migrationEnums.keys()].filter((name) => !dbEnums.has(name));
  const enumsOnlyInDb = [...dbEnums.keys()].filter((name) => !migrationEnums.has(name));
  const enumValueDiffs = [];
  for (const [name, entry] of migrationEnums) {
    const dbEntry = dbEnums.get(name);
    if (!dbEntry) continue;
    const onlyInDb = dbEntry.values.filter((value) => !entry.values.includes(value));
    const onlyInMigration = entry.values.filter((value) => !dbEntry.values.includes(value));
    if (onlyInDb.length || onlyInMigration.length) {
      enumValueDiffs.push({ name, onlyInDb, onlyInMigration });
    }
  }

  const indexKey = (index) => `${index.table}(${index.columns.join(',')})${index.unique ? ' unique' : ''}`;
  const migrationIndexes = new Map(migration.indexes.map((index) => [indexKey(index), index]));
  const dbIndexes = new Map(
    inventory.indexes.filter((index) => !isLedger(index.table)).map((index) => [indexKey(index), index]),
  );
  const indexesOnlyInMigration = [...migrationIndexes.entries()]
    .filter(([k]) => !dbIndexes.has(k))
    .map(([, index]) => index);
  const indexesOnlyInDb = [...dbIndexes.entries()]
    .filter(([k]) => !migrationIndexes.has(k))
    .map(([, index]) => index);
  const indexNameDiffs = [...migrationIndexes.entries()]
    .filter(([k, index]) => dbIndexes.has(k) && dbIndexes.get(k).name !== index.name)
    .map(([k, index]) => ({ table: index.table, columns: index.columns, migration: index.name, db: dbIndexes.get(k).name }));

  const fkKey = (fk) => `${fk.table}(${fk.columns.join(',')})->${fk.refTable}(${fk.refColumns.join(',')})`;
  const migrationFks = new Map(migration.foreignKeys.map((fk) => [fkKey(fk), fk]));
  const dbFks = new Map(
    inventory.foreignKeys.filter((fk) => !isLedger(fk.table) && !isLedger(fk.refTable)).map((fk) => [fkKey(fk), fk]),
  );
  const foreignKeysOnlyInMigration = [...migrationFks.entries()]
    .filter(([k]) => !dbFks.has(k))
    .map(([, fk]) => fk);
  const foreignKeysOnlyInDb = [...dbFks.entries()]
    .filter(([k]) => !migrationFks.has(k))
    .map(([, fk]) => fk);

  const migrationPkKeys = new Set(
    migration.tables.filter((table) => table.primaryKey).map((table) => key(table.name, table.primaryKey)),
  );
  const dbPkKeys = new Set(
    inventory.primaryKeys.filter((pk) => !isLedger(pk.table)).map((pk) => key(pk.table, pk.columns)),
  );
  const primaryKeysOnlyInMigration = [...migrationPkKeys].filter((k) => !dbPkKeys.has(k));
  const primaryKeysOnlyInDb = [...dbPkKeys].filter((k) => !migrationPkKeys.has(k));

  const identical =
    tablesOnlyInMigration.length === 0 &&
    tablesOnlyInDb.length === 0 &&
    columnsOnlyInMigration.length === 0 &&
    columnsOnlyInDb.length === 0 &&
    columnTypeDiffs.length === 0 &&
    columnNullabilityDiffs.length === 0 &&
    columnDefaultDiffs.length === 0 &&
    enumsOnlyInMigration.length === 0 &&
    enumsOnlyInDb.length === 0 &&
    enumValueDiffs.length === 0 &&
    indexesOnlyInMigration.length === 0 &&
    indexesOnlyInDb.length === 0 &&
    foreignKeysOnlyInMigration.length === 0 &&
    foreignKeysOnlyInDb.length === 0 &&
    primaryKeysOnlyInMigration.length === 0 &&
    primaryKeysOnlyInDb.length === 0;

  return {
    identical,
    tablesOnlyInMigration,
    tablesOnlyInDb,
    columnsOnlyInMigration,
    columnsOnlyInDb,
    columnTypeDiffs,
    columnNullabilityDiffs,
    columnDefaultDiffs,
    enumsOnlyInMigration,
    enumsOnlyInDb,
    enumValueDiffs,
    indexesOnlyInMigration,
    indexesOnlyInDb,
    indexNameDiffs,
    foreignKeysOnlyInMigration,
    foreignKeysOnlyInDb,
    primaryKeysOnlyInMigration,
    primaryKeysOnlyInDb,
  };
}

/** Turn a comparison into the decision the merge gate asks for. */
export function decide(migration, inventory, comparison) {
  const hasObjects = inventory.tables.length > 0 || inventory.enums.length > 0;
  const appliedName = `${path.basename(path.dirname(migration.path))}`;

  if (!hasObjects) {
    return {
      verdict: 'clean',
      summary: 'The target is empty: apply the migration normally.',
      commands: [`npx prisma migrate deploy`],
    };
  }

  const recorded = inventory.migrationBookkeeping.applied.includes(appliedName);

  if (comparison.identical && recorded) {
    return {
      verdict: 'already-applied',
      summary: `_prisma_migrations already records ${appliedName}, and the database matches it.`,
      commands: [`npx prisma migrate status`],
    };
  }

  const ledgerUnknown =
    inventory.migrationBookkeeping.present && inventory.migrationBookkeeping.readable === false
      ? ' Note: `_prisma_migrations` exists but this role cannot read it, so whether the ' +
        'migration is already recorded is unknown — check that before resolving.'
      : '';

  if (comparison.identical) {
    return {
      verdict: 'baseline',
      summary:
        'The database already matches the migration exactly (typical of an environment that ' +
        'was maintained with `prisma db push`). Applying the SQL would fail on existing objects; ' +
        'mark the migration as applied instead, then deploy onward.' +
        ledgerUnknown,
      commands: [
        `npx prisma migrate resolve --applied ${appliedName}`,
        `npx prisma migrate deploy`,
      ],
    };
  }

  // "Additive" means: the database is behind, but holds nothing the migration
  // does not know about, and nothing differs in place. Anything that the
  // migration would have to undo or rewrite needs a human decision.
  const additive =
    comparison.tablesOnlyInDb.length === 0 &&
    comparison.columnsOnlyInDb.length === 0 &&
    comparison.enumsOnlyInDb.length === 0 &&
    comparison.indexesOnlyInDb.length === 0 &&
    comparison.foreignKeysOnlyInDb.length === 0 &&
    comparison.primaryKeysOnlyInDb.length === 0 &&
    comparison.columnTypeDiffs.length === 0 &&
    comparison.columnNullabilityDiffs.length === 0 &&
    comparison.columnDefaultDiffs.length === 0 &&
    comparison.enumValueDiffs.length === 0 &&
    comparison.indexNameDiffs.length === 0;

  return {
    verdict: 'drift',
    additive,
    summary: recorded
      ? `_prisma_migrations records ${appliedName}, but the database does not match it: the ` +
        'ledger and the schema disagree. Investigate before resolving anything — a migration ' +
        'must never be marked applied on a database it did not build.'
      : additive
        ? 'The database is behind the migration but has no objects the migration does not know ' +
          'about. This is the additive case: baseline-resolve the initial migration, then let a ' +
          'delta migration from the same diff add the missing objects.'
        : 'The database and the migration disagree in both directions (or in type/nullability): ' +
          'this needs a reviewed delta plan before anything is applied.' +
          ledgerUnknown,
    commands: [
      `npx prisma migrate resolve --applied ${appliedName}`,
      `npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script > delta.sql`,
      `# review delta.sql, commit it as a new migration, then: npx prisma migrate deploy`,
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data-level safety checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Can the indexes, foreign keys and NOT NULL columns the migration expects be
 * added to the rows that exist? Each check returns a finding only when there is
 * something to fix, so "no findings" means "safe to add".
 */
export async function safetyChecks(client, migration, comparison, inventory) {
  const findings = [];
  const count = async (sql) => Number((await client.query(sql)).rows[0].count);

  // A constraint can only be endangered by data that exists. If the target
  // does not hold the table yet, the migration creates it (empty) and there is
  // nothing to check — otherwise every CREATE TABLE in the migration would
  // produce a wall of "relation does not exist".
  const dbTables = new Set(inventory.tables.map((table) => table.name));
  const uncheckable = [];
  const unknown = (finding) => {
    if (uncheckable.length < 15) uncheckable.push(finding);
  };

  // Unique indexes the migration expects that the database does not have yet.
  for (const index of comparison.indexesOnlyInMigration) {
    if (!index.unique || !dbTables.has(index.table)) continue;
    const columns = index.columns.map((column) => `"${column}"`).join(', ');
    const sql = `SELECT COALESCE(SUM(duplicates), 0)::int AS count FROM (
                   SELECT COUNT(*) AS duplicates FROM "${index.table}"
                   GROUP BY ${columns} HAVING COUNT(*) > 1
                 ) grouped`;
    try {
      const duplicates = await count(sql);
      if (duplicates > 0) {
        findings.push({
          severity: 'blocking',
          kind: 'unique-index',
          target: `${index.table}(${index.columns.join(',')})`,
          detail: `${duplicates} row(s) share a key with another row — CREATE UNIQUE INDEX "${index.name}" would fail. Resolve the duplicates first.`,
          sql,
        });
      }
    } catch (error) {
      unknown({
        severity: 'unknown',
        kind: 'unique-index',
        target: `${index.table}(${index.columns.join(',')})`,
        detail: `could not check duplicates: ${error.message}`,
      });
    }
  }

  // Foreign keys the migration expects that are not enforced yet.
  for (const fk of comparison.foreignKeysOnlyInMigration) {
    if (!dbTables.has(fk.table)) continue;
    const columns = fk.columns.map((column) => `"${column}"`).join(', ');
    const present = await count(
      `SELECT COUNT(*)::int AS count FROM "${fk.table}" WHERE "${fk.columns[0]}" IS NOT NULL`,
    ).catch(() => undefined);

    if (present === undefined) {
      unknown({
        severity: 'unknown',
        kind: 'foreign-key',
        target: `${fk.table}(${fk.columns.join(',')}) → ${fk.refTable}`,
        detail: 'could not count rows referencing the parent table',
      });
      continue;
    }

    if (present === 0) continue; // no rows to orphan; the constraint is safe.

    if (!dbTables.has(fk.refTable)) {
      // The parent is created empty by the migration, so every existing row
      // with a value in this column is guaranteed to be an orphan.
      findings.push({
        severity: 'blocking',
        kind: 'foreign-key',
        target: `${fk.table}(${fk.columns.join(',')}) → ${fk.refTable}`,
        detail:
          `${present} row(s) carry a value in ${columns} but \`${fk.refTable}\` does not exist yet. ` +
          `The migration creates it empty, so adding "${fk.name}" would fail. Backfill or null those rows first.`,
        sql: `SELECT COUNT(*) FROM "${fk.table}" WHERE "${fk.columns[0]}" IS NOT NULL`,
      });
      continue;
    }

    const pairs = fk.columns
      .map((column, position) => `child."${column}" = parent."${fk.refColumns[position]}"`)
      .join(' AND ');
    const sql = `SELECT COUNT(*)::int AS count FROM "${fk.table}" child
                 LEFT JOIN "${fk.refTable}" parent ON ${pairs}
                 WHERE child."${fk.columns[0]}" IS NOT NULL
                   AND parent."${fk.refColumns[0]}" IS NULL`;
    try {
      const orphans = await count(sql);
      if (orphans > 0) {
        findings.push({
          severity: 'blocking',
          kind: 'foreign-key',
          target: `${fk.table}(${fk.columns.join(',')}) → ${fk.refTable}`,
          detail: `${orphans} row(s) reference a parent that does not exist — adding "${fk.name}" would fail.`,
          sql,
        });
      }
    } catch (error) {
      unknown({
        severity: 'unknown',
        kind: 'foreign-key',
        target: `${fk.table}(${fk.columns.join(',')}) → ${fk.refTable}`,
        detail: `could not check orphans: ${error.message}`,
      });
    }
  }

  // Columns the migration wants NOT NULL that are currently nullable.
  for (const diff of comparison.columnNullabilityDiffs) {
    if (diff.migration !== true || !dbTables.has(diff.table)) continue;
    const sql = `SELECT COUNT(*)::int AS count FROM "${diff.table}" WHERE "${diff.column}" IS NULL`;
    try {
      const nulls = await count(sql);
      if (nulls > 0) {
        findings.push({
          severity: 'blocking',
          kind: 'not-null',
          target: `${diff.table}."${diff.column}"`,
          detail: `${nulls} row(s) are NULL — setting NOT NULL would fail without a backfill.`,
          sql,
        });
      }
    } catch (error) {
      unknown({
        severity: 'unknown',
        kind: 'not-null',
        target: `${diff.table}."${diff.column}"`,
        detail: `could not count NULLs: ${error.message}`,
      });
    }
  }

  findings.push(...uncheckable);
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────────────

/** Render a list, but never let one section bury the report body. */
const capped = (items, render, cap = 30) => {
  if (!items.length) return '- none';
  const shown = items.slice(0, cap).map((item) => `- ${render(item)}`);
  if (items.length > cap) shown.push(`- …and ${items.length - cap} more`);
  return shown.join('\n');
};

/** Render several related lists as one block, collapsing to a single "- none". */
const group = (specs) => {
  const body = specs
    .map(({ items, render, cap }) => (items.length ? capped(items, render, cap) : ''))
    .filter(Boolean)
    .join('\n');
  return body || '- none';
};

/**
 * Whether `--mode apply` may proceed, and if not, why.
 *
 * Applying is only ever a rehearsal on a disposable clone, but it still refuses
 * two things beyond a non-`clean` verdict: a `blocking` finding, which means the
 * SQL would fail, and an `unknown` finding, which means the check never ran.
 * Unverified is not the same as safe — see the runbook's decision rules.
 */
export function applyRefusal({ verdict, findings = [] }) {
  if (verdict !== 'clean') return `the verdict is "${verdict}"`;
  const blocking = findings.filter((finding) => finding.severity === 'blocking');
  if (blocking.length > 0) {
    return `${blocking.length} blocking finding(s) must be resolved first`;
  }
  const unverifiable = findings.filter((finding) => finding.severity !== 'blocking');
  if (unverifiable.length > 0) {
    return (
      `${unverifiable.length} finding(s) could not be verified — resolve or explain them ` +
      'before applying'
    );
  }
  return null;
}

export function renderReport({ target, migrationPath, inventory, comparison, decision, findings, mode }) {
  const { host, database } = target ?? describeTarget('');
  const emptyTarget = inventory.tables.length === 0 && inventory.enums.length === 0;
  const blocking = findings.filter((finding) => finding.severity === 'blocking');
  const unverifiable = findings.filter((finding) => finding.severity !== 'blocking');

  const onlyInMigration = emptyTarget
    ? `The target holds no tables and no enums: the migration creates all ${comparison.tablesOnlyInMigration.length} tables and ${comparison.enumsOnlyInMigration.length} enums from scratch.`
    : group([
        { items: comparison.tablesOnlyInMigration, render: (name) => `table \`${name}\`` },
        { items: comparison.enumsOnlyInMigration, render: (name) => `enum \`${name}\`` },
        {
          items: comparison.columnsOnlyInMigration,
          render: (c) => `column \`${c.table}."${c.column}"\` (${c.type})`,
        },
        {
          items: comparison.indexesOnlyInMigration,
          render: (i) => `${i.unique ? 'unique ' : ''}index on \`${i.table}(${i.columns.join(', ')})\``,
        },
        {
          items: comparison.foreignKeysOnlyInMigration,
          render: (fk) => `foreign key \`${fk.table}(${fk.columns.join(', ')})\` → \`${fk.refTable}\``,
        },
        { items: comparison.primaryKeysOnlyInMigration, render: (k) => `primary key \`${k}\`` },
      ]);

  return `# Migration rehearsal report

- Target: \`${host}/${database}\` (disposable clone)
- Migration: \`${path.relative(BACKEND_ROOT, migrationPath)}\`
- Mode: ${mode}
- Tables in target: ${inventory.tables.length}; enums: ${inventory.enums.length}; indexes: ${inventory.indexes.length}; foreign keys: ${inventory.foreignKeys.length}

## Verdict: ${decision.verdict}

${decision.summary}

${decision.commands.map((command) => `    ${command}`).join('\n')}

## Inventory

${capped(
  inventory.tables.slice().sort((a, b) => (b.rowEstimate ?? 0) - (a.rowEstimate ?? 0)),
  (table) => `\`${table.name}\` — ~${table.rowEstimate ?? '?'} rows, ${table.columns.length} columns`,
  25,
)}

## Differences from the migration

### Objects only in the migration (work to do)

${onlyInMigration}

### Objects only in the database (not in the migration)

${group([
  { items: comparison.tablesOnlyInDb, render: (name) => `table \`${name}\`` },
  { items: comparison.enumsOnlyInDb, render: (name) => `enum \`${name}\`` },
  { items: comparison.columnsOnlyInDb, render: (c) => `column \`${c.table}."${c.column}"\` (${c.type})` },
  {
    items: comparison.indexesOnlyInDb,
    render: (i) => `${i.unique ? 'unique ' : ''}index \`${i.name}\` on \`${i.table}(${i.columns.join(', ')})\``,
  },
  { items: comparison.foreignKeysOnlyInDb, render: (fk) => `foreign key \`${fk.name}\` on \`${fk.table}\`` },
  { items: comparison.primaryKeysOnlyInDb, render: (k) => `primary key \`${k}\`` },
])}

### Changed in place (needs a data-preserving alteration)

${group([
  { items: comparison.columnTypeDiffs, render: (d) => `\`${d.table}."${d.column}"\`: ${d.db} → ${d.migration}` },
  {
    items: comparison.columnNullabilityDiffs,
    render: (d) => `\`${d.table}."${d.column}"\`: ${d.db ? 'NOT NULL' : 'NULL'} → ${d.migration ? 'NOT NULL' : 'NULL'}`,
  },
  {
    items: comparison.columnDefaultDiffs,
    render: (d) => `\`${d.table}."${d.column}"\`: default ${d.db ?? '(none)'} → ${d.migration ?? '(none)'}`,
  },
  {
    items: comparison.enumValueDiffs,
    render: (d) =>
      `enum \`${d.name}\`: only in database ${JSON.stringify(d.onlyInDb)}, only in migration ${JSON.stringify(d.onlyInMigration)}`,
  },
  {
    items: comparison.indexNameDiffs,
    render: (d) =>
      `index on \`${d.table}(${d.columns.join(', ')})\`: named \`${d.db}\` but the migration calls it \`${d.migration}\``,
  },
])}

## Can the constraints be added to the existing rows?

### Blocking findings

${blocking.length === 0 ? 'None: no existing row contradicts a unique index, foreign key or NOT NULL column the migration wants to add.' : capped(blocking, (f) => `**${f.kind}** \`${f.target}\` — ${f.detail}`)}

### Could not be verified

${unverifiable.length === 0 ? 'None: every check ran against the target.' : capped(unverifiable, (f) => `**${f.kind}** \`${f.target}\` — ${f.detail}`)}
`;
}

export function describeTarget(url) {
  const match = /^postgres(?:ql)?:\/\/(?<userinfo>[^@]*)@?(?<hostport>[^/?]*)\/(?<db>[^?]*)/.exec(url);
  const query = new URLSearchParams((url.split('?')[1] ?? '').replace(/\?/g, '&'));
  return {
    host: query.get('host') || match?.groups?.hostport || 'unknown',
    database: match?.groups?.db || 'unknown',
  };
}

/** Refuse anything that is not unmistakably a disposable clone. */
export function assertDisposableTarget(url, { allowRemote = false } = {}) {
  const { host, database } = describeTarget(url);
  if (!database || database === 'unknown') {
    throw new Error('Could not read the database name from the connection string.');
  }
  if (/prod/i.test(database) || /prod/i.test(host)) {
    throw new Error(`Refusing to rehearse against "${host}/${database}": it names production.`);
  }
  if (!DISPOSABLE_SUFFIXES.some((suffix) => database.toLowerCase().endsWith(suffix))) {
    throw new Error(
      `Refusing to rehearse against "${database}": the name must end in one of ${DISPOSABLE_SUFFIXES.join(', ')} ` +
        'so it is unmistakably a disposable clone.',
    );
  }
  const hostname = host.replace(/:\d+$/, '');
  const local = host === '' || host.startsWith('/') || LOCAL_HOSTS.includes(hostname) || hostname.endsWith('.local');
  if (!local && !allowRemote) {
    throw new Error(
      `Refusing to run against non-local host "${host}" without --i-have-a-clone. ` +
        'The target must be a disposable clone created for this rehearsal.',
    );
  }
  return { host, database, local };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

function argOf(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index === -1 ? fallback : argv[index + 1];
}

export function latestMigrationPath(migrationsDir = path.join(BACKEND_ROOT, 'prisma', 'migrations')) {
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (dirs.length === 0) throw new Error(`No migrations in ${migrationsDir}.`);
  return path.join(migrationsDir, dirs[dirs.length - 1], 'migration.sql');
}

async function main(argv) {
  const url = argOf(argv, '--url', process.env.REHEARSAL_DATABASE_URL);
  const mode = argOf(argv, '--mode', 'inspect');
  const allowRemote = argv.includes('--i-have-a-clone') || process.env.REHEARSAL_ALLOW_REMOTE === '1';
  const confirmApply = argv.includes('--confirm-apply');
  const reportPath = argOf(argv, '--report', 'rehearsal-report.md');

  const wantsHelp = argv.includes('--help') || argv.includes('-h');
  if (!url || wantsHelp) {
    console.error(
      [
        'Rehearse the committed migration against a disposable clone of an existing database.',
        '',
        'Usage: node scripts/migrate-rehearsal.mjs --url <clone-url> [options]',
        '',
        'Options:',
        '  --url <clone-url>     Connection string of the disposable clone (or REHEARSAL_DATABASE_URL).',
        '  --mode <mode>         inspect (default, read-only) | apply (writes, and only on a clean, fully checked clone).',
        '  --migration <path>    Migration to rehearse (default: latest under prisma/migrations).',
        '  --report <file>       Where to write the markdown report (default: rehearsal-report.md).',
        '  --i-have-a-clone      Required for non-local hosts; acknowledges the target is disposable.',
        '  --confirm-apply       Required together with --mode apply.',
        '  --help                This text.',
        '',
        'Refuses any database whose name does not end in _clone, _rehearsal, _test, _ci, _ephemeral',
        'or _shadow, and any name or host containing "prod". Read the runbook first:',
        'docs/MIGRATION-REHEARSAL-RUNBOOK-2026-09-26.md',
      ].join('\n'),
    );
    return wantsHelp ? 0 : 1;
  }
  if (!['inspect', 'apply'].includes(mode)) {
    console.error(`Unknown --mode "${mode}" (expected inspect or apply).`);
    return 1;
  }
  if (mode === 'apply' && !confirmApply) {
    console.error('--mode apply also needs --confirm-apply: it writes to the clone.');
    return 1;
  }

  let target;
  try {
    target = assertDisposableTarget(url, { allowRemote });
  } catch (error) {
    console.error(`::error::${error.message}`);
    return 1;
  }

  const migrationPath = path.resolve(
    BACKEND_ROOT,
    argOf(argv, '--migration', path.relative(BACKEND_ROOT, latestMigrationPath())),
  );
  if (!existsSync(migrationPath)) {
    console.error(`::error::No migration to rehearse at ${migrationPath}`);
    return 1;
  }
  const migrationSql = readFileSync(migrationPath, 'utf8');
  const migration = { ...parseMigration(migrationSql), path: migrationPath };

  // `pg` is CommonJS: `import('pg')` exposes the module as `default` on some
  // Node versions and as named exports on others. Accept either shape.
  const pg = await import('pg');
  const Client = pg.Client ?? pg.default?.Client;
  if (typeof Client !== 'function') {
    console.error('::error::The `pg` package is not installed or does not export Client');
    return 1;
  }
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 15000 });
  await client.connect();

  try {
    const inventory = await readInventory(client);
    const comparison = compareInventory(migration, inventory);
    const decision = decide(migration, inventory, comparison);
    const findings = await safetyChecks(client, migration, comparison, inventory);

    const report = renderReport({
      target,
      migrationPath,
      inventory,
      comparison,
      decision,
      findings,
      mode,
    });
    writeFileSync(reportPath, report);
    console.log(report);

    if (mode === 'apply') {
      const refusal = applyRefusal({ verdict: decision.verdict, findings });
      if (refusal) {
        console.error(
          `::error::Not applying: ${refusal}.` +
            (decision.verdict === 'clean' ? '' : ` ${decision.summary}`),
        );
        return 1;
      }
      console.log('Applying the migration to the clone…');
      await client.query('BEGIN');
      try {
        await client.query(migrationSql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      const after = await readInventory(client);
      const afterComparison = compareInventory(migration, after);
      console.log(
        afterComparison.identical
          ? 'Post-apply check: the clone now matches the migration exactly.'
          : 'Post-apply check: differences remain — see the report.',
      );
    }
  } finally {
    await client.end();
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`::error::${error.message}`);
      process.exit(1);
    });
}
