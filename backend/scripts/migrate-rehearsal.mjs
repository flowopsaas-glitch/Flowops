#!/usr/bin/env node
/**
 * Inspect-only migration diagnostic. Derived from PR #436 at 7844fffa; hardened
 * on this branch without importing its feature code or initial migration.
 * Never executes migration SQL, resolve, db push, or other apply operations.
 * Exit 0 = complete diagnostic ready for independent review (NOT approval);
 * exit 2 = HOLD (drift/blocking/unknown); exit 1 = execution/configuration failure.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Database names this tool will ever touch. */
const DISPOSABLE_SUFFIXES = [
  "_clone",
  "_rehearsal",
  "_test",
  "_ci",
  "_ephemeral",
  "_shadow",
];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];

// ─────────────────────────────────────────────────────────────────────────────
// Parsing the migration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical form for a column type, so a migration's `TIMESTAMP(3)` and
 * PostgreSQL's `timestamp without time zone` + precision 3 compare equal.
 */
export function normalizeType(raw) {
  const type = String(raw).trim().replace(/\s+/g, " ");
  if (type.endsWith("[]")) return `${normalizeType(type.slice(0, -2))}[]`;
  const enumMatch = /^"([^"]+)"$/.exec(type);
  if (enumMatch) return enumMatch[1];

  const upper = type.toUpperCase();
  let match;
  if ((match = /^VARCHAR\((\d+)\)$/.exec(upper))) return `varchar(${match[1]})`;
  if ((match = /^DECIMAL\((\d+),(\d+)\)$/.exec(upper)))
    return `decimal(${match[1]},${match[2]})`;
  if ((match = /^NUMERIC\((\d+),(\d+)\)$/.exec(upper)))
    return `decimal(${match[1]},${match[2]})`;
  if ((match = /^TIMESTAMP\((\d)\)$/.exec(upper)))
    return `timestamp(${match[1]})`;
  if ((match = /^TIMESTAMPTZ\((\d)\)$/.exec(upper)))
    return `timestamptz(${match[1]})`;
  if (upper === "TEXT") return "text";
  if (upper === "DOUBLE PRECISION") return "double precision";
  if (upper === "INTEGER" || upper === "INT" || upper === "INT4")
    return "integer";
  if (upper === "BIGINT" || upper === "INT8") return "bigint";
  if (upper === "BOOLEAN" || upper === "BOOL") return "boolean";
  if (upper === "JSONB") return "jsonb";
  if (upper === "UUID") return "uuid";
  if (upper === "DATE") return "date";
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
  const raw = String(formatted)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^public\./, "");
  const arrayMatch = /^(.*)\[\]$/.exec(raw);
  if (arrayMatch) return `${normalizeFormattedType(arrayMatch[1])}[]`;
  let match;
  if ((match = /^timestamp\((\d+)\) without time zone$/.exec(raw)))
    return `timestamp(${match[1]})`;
  if ((match = /^timestamp\((\d+)\) with time zone$/.exec(raw)))
    return `timestamptz(${match[1]})`;
  if (raw === "timestamp without time zone") return "timestamp(6)";
  if (raw === "timestamp with time zone") return "timestamptz(6)";
  if ((match = /^character varying\((\d+)\)$/.exec(raw)))
    return `varchar(${match[1]})`;
  if (raw === "character varying") return "varchar";
  if ((match = /^character\((\d+)\)$/.exec(raw))) return `char(${match[1]})`;
  if ((match = /^numeric\((\d+),(\d+)\)$/.exec(raw)))
    return `decimal(${match[1]},${match[2]})`;
  return normalizeType(raw);
}

/**
 * Defaults are stored as expressions, so `'PENDING'` comes back as
 * `'PENDING'::"ApprovalStatus"` and `CURRENT_TIMESTAMP` may be wrapped in
 * parentheses. Normalise both sides; a difference that survives this is worth a
 * human look, but harmless spelling differences should not fake a drift.
 */
export function normalizeDefault(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "")
    return null;
  let value = String(raw).trim();
  // Protect quoted literals/identifiers before normalizing SQL keywords. Never
  // lowercase data, or strip a cast-looking substring inside a string literal.
  const literals = [];
  value = value.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, (token) => {
    literals.push(token);
    return `__quoted_${literals.length - 1}__`;
  });
  const balanced = (text) => {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "(") depth++;
      if (text[i] === ")") depth--;
      if (depth === 0 && i < text.length - 1) return false;
      if (depth < 0) return false;
    }
    return depth === 0;
  };
  while (value.startsWith("(") && value.endsWith(")") && balanced(value))
    value = value.slice(1, -1).trim();
  value = value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^now\(\)$/, "current_timestamp");
  // PostgreSQL adds casts to literal defaults; don't erase casts in arbitrary
  // expressions or functions. Unknown expressions remain different, fail closed.
  value = value.replace(
    /^(__quoted_\d+__|array\[\])::(?:text(?:\[\])?|__quoted_\d+__)$/,
    "$1",
  );
  return value.replace(/__quoted_(\d+)__/g, (_, n) => literals[Number(n)]);
}

export function supportedDefault(raw) {
  const value = normalizeDefault(raw);
  return (
    value === null ||
    /^(?:true|false|current_timestamp|array\[\]|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|'(?:''|[^'])*')$/i.test(
      value,
    )
  );
}

export function normalizeForeignKeyActions(raw = "") {
  const value = raw.toUpperCase();
  const action = (which) =>
    new RegExp(
      `ON ${which} (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)`,
    ).exec(value)?.[1] ?? "NO ACTION";
  return `ON DELETE ${action("DELETE")} ON UPDATE ${action("UPDATE")} MATCH ${/MATCH (FULL|PARTIAL|SIMPLE)/.exec(value)?.[1] ?? "SIMPLE"} ${/(?<!NOT )DEFERRABLE/.test(value) ? "DEFERRABLE" : "NOT DEFERRABLE"} ${/INITIALLY DEFERRED/.test(value) ? "INITIALLY DEFERRED" : "INITIALLY IMMEDIATE"}`;
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
  const unsupported = [];

  const lines = sql.split("\n");
  let block = null;

  const flush = () => {
    if (!block) return;
    tables.push({
      name: block.name,
      columns: block.columns,
      primaryKey: block.primaryKey,
      primaryKeyName: block.primaryKeyName,
    });
    block = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("--")) continue;

    if (block) {
      if (line.startsWith(")")) {
        flush();
        continue;
      }
      const body = line.replace(/,$/, "");
      const primaryKey =
        /^CONSTRAINT\s+"[^"]+"\s+PRIMARY KEY\s+\(([^)]*)\)$/i.exec(body);
      if (primaryKey) {
        block.primaryKeyName = /^CONSTRAINT\s+"([^\"]+)"/.exec(body)[1];
        block.primaryKey = splitColumns(primaryKey[1]);
        continue;
      }
      if (/^CONSTRAINT\s+/i.test(body)) {
        unsupported.push(body);
        continue;
      }
      const column = /^"([^"]+)"\s+(.+)$/.exec(body);
      if (!column) {
        unsupported.push(body);
        continue;
      }
      let rest = column[2];
      if (/\b(GENERATED|CHECK|REFERENCES|UNIQUE|COLLATE)\b/i.test(rest))
        unsupported.push(body);
      let columnDefault = null;
      const defaultIndex = rest.indexOf(" DEFAULT ");
      if (defaultIndex !== -1) {
        const rawDefault = rest.slice(defaultIndex + " DEFAULT ".length);
        if (!supportedDefault(rawDefault))
          unsupported.push(`Unsupported default on ${block.name}.${column[1]}`);
        columnDefault = normalizeDefault(rawDefault);
        rest = rest.slice(0, defaultIndex);
      }
      let notNull = false;
      if (/ NOT NULL$/.test(rest)) {
        notNull = true;
        rest = rest.slice(0, -" NOT NULL".length);
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

    const createIndex =
      /^CREATE (UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"\s*\(([^)]*)\);?$/i.exec(
        line,
      );
    if (createIndex) {
      if (!/^"[^"]+"(?:,\s*"[^"]+")*$/.test(createIndex[4])) {
        unsupported.push(line);
        continue;
      }
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
        actions: normalizeForeignKeyActions(addForeignKey[6]),
      });
      continue;
    }
    unsupported.push(line);
  }
  if (block) unsupported.push(`Unterminated CREATE TABLE ${block.name}`);
  flush();

  for (const [kind, objects] of [
    ["table", tables],
    ["enum", enums],
    ["index", indexes],
    ["foreign-key", foreignKeys],
  ]) {
    const seen = new Set();
    for (const object of objects) {
      if (seen.has(object.name))
        unsupported.push(`Duplicate ${kind} name: ${object.name}`);
      seen.add(object.name);
    }
  }
  for (const table of tables) {
    const names = table.columns.map((c) => c.name);
    if (new Set(names).size !== names.length)
      unsupported.push(`Duplicate column in ${table.name}`);
  }
  return { enums, tables, indexes, foreignKeys, unsupported };
}

function splitColumns(list) {
  return list
    .split(",")
    .map((part) => part.trim().replace(/^"|"$/g, "").replace(/ ASC$/i, ""))
    .filter(Boolean);
}

function splitLabels(list) {
  return [...list.matchAll(/'((?:[^']|'')*)'/g)].map((match) =>
    match[1].replace(/''/g, "'"),
  );
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
  appliedMigrations: `SELECT migration_name, checksum, finished_at, rolled_back_at,
                            applied_steps_count FROM public."_prisma_migrations" ORDER BY started_at`,
  unsupported: `SELECT 'relation' AS kind, n.nspname || '.' || c.relname AS name
                  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relkind NOT IN ('r', 'i', 't')
                UNION ALL
                SELECT 'schema', nspname FROM pg_namespace
                 WHERE nspname <> 'public' AND nspname <> 'information_schema' AND nspname NOT LIKE 'pg_%'
                UNION ALL
                SELECT 'extension', extname FROM pg_extension WHERE extname <> 'plpgsql'
                UNION ALL
                SELECT 'constraint', c.conname FROM pg_constraint c
                  JOIN pg_namespace n ON n.oid = c.connamespace
                 WHERE n.nspname = 'public' AND (c.contype NOT IN ('p','f') OR NOT c.convalidated)
                UNION ALL
                SELECT 'trigger', t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND NOT t.tgisinternal
                UNION ALL
                SELECT 'row-security', c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND (c.relrowsecurity OR c.relforcerowsecurity)
                UNION ALL
                SELECT 'generated-or-identity-column', c.relname || '.' || a.attname
                  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND (a.attgenerated <> '' OR a.attidentity <> '')
                UNION ALL
                SELECT 'function', p.oid::regprocedure::text FROM pg_proc p
                  JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
                UNION ALL
                SELECT 'type', t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typtype IN ('d', 'r', 'm')
                UNION ALL
                SELECT 'invalid-index', ci.relname FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
                  JOIN pg_namespace n ON n.oid = ci.relnamespace
                 WHERE n.nspname = 'public' AND (NOT i.indisvalid OR NOT i.indisready)`,
};

/** Parse a PostgreSQL index definition into the same shape as the migration's. */
export function parseIndexDef(indexdef) {
  const match =
    /^CREATE (UNIQUE )?INDEX (\S+) ON (?:(\w+)\.)?(\S+) USING (\w+) \((.*)\)$/.exec(
      indexdef.trim(),
    );
  if (!match) return undefined;
  // Unsupported expressions/predicates/ordering must not silently disappear.
  if (
    !/^(?:"[^"\n]+"|[a-zA-Z_][\w]*)(?:, (?:"[^"\n]+"|[a-zA-Z_][\w]*))*$/.test(
      match[6],
    )
  )
    return undefined;
  return {
    // pg_indexes.indexdef quotes both the index and the table.
    name: match[2].replace(/"/g, ""),
    table: match[4].replace(/"/g, ""),
    unique: Boolean(match[1]),
    method: match[5],
    columns: splitColumns(match[6]),
  };
}

/** Parse `FOREIGN KEY ("a") REFERENCES t("b") ON DELETE ...` into the same shape. */
export function parseConstraintDef(definition) {
  const match =
    /^FOREIGN KEY \(([^)]*)\) REFERENCES ([^()]+)\(([^)]*)\)(.*)$/.exec(
      definition.trim(),
    );
  if (!match) return undefined;
  return {
    columns: splitColumns(match[1]),
    refTable: match[2]
      .trim()
      .replace(/"/g, "")
      .replace(/^public\./, ""),
    refColumns: splitColumns(match[3]),
    actions: normalizeForeignKeyActions(match[4]),
  };
}

/** `PRIMARY KEY (a, b)` → ['a', 'b']. */
export function parsePrimaryKeyDef(definition) {
  const match = /^PRIMARY KEY \(([^)]*)\)$/.exec(definition.trim());
  return match ? splitColumns(match[1]) : undefined;
}

export async function readInventory(client) {
  const q = async (sql) => (await client.query(sql)).rows;
  const [
    tables,
    columns,
    enums,
    indexes,
    constraints,
    estimates,
    bookkeeping,
    unsupported,
  ] = await Promise.all([
    q(QUERIES.tables),
    q(QUERIES.columns),
    q(QUERIES.enums),
    q(QUERIES.indexes),
    q(QUERIES.constraints),
    q(QUERIES.rowEstimates),
    q(QUERIES.migrationBookkeeping),
    q(QUERIES.unsupported),
  ]);

  const estimateByName = new Map(
    estimates.map((row) => [
      row.name,
      Number(row.rows) < 0 ? null : Number(row.rows),
    ]),
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
      applied = (await checkedQuery(client, QUERIES.appliedMigrations)).rows;
    } catch {
      // The role can see that the table exists but cannot read it. Say so,
      // rather than claiming the migration was never applied.
      bookkeepingReadable = false;
    }
  }

  for (const column of columns) {
    if (
      !supportedDefault(column.column_default) &&
      column.table_name !== LEDGER_TABLE
    )
      unsupported.push({
        kind: "column-default-expression",
        name: `${column.table_name}.${column.column_name}`,
      });
  }
  for (const row of indexes) {
    if (!parseIndexDef(row.indexdef))
      unsupported.push({ kind: "index-definition", name: row.indexname });
  }
  // Map-based comparison must not hide a second equivalent-looking object.
  // Preserve ambiguity as unknown evidence instead of choosing one object.
  const signatures = new Set();
  for (const row of indexes) {
    const index = parseIndexDef(row.indexdef);
    if (!index) continue;
    const signature = JSON.stringify([
      index.table,
      index.columns,
      index.unique,
      index.method,
    ]);
    if (signatures.has(signature))
      unsupported.push({
        kind: "duplicate-index-signature",
        name: row.indexname,
      });
    signatures.add(signature);
  }
  const fkSignatures = new Set();
  for (const row of constraints.filter((r) => r.type === "f")) {
    const fk = parseConstraintDef(row.definition);
    if (!fk) continue;
    const signature = JSON.stringify([
      row.table_name,
      fk.columns,
      fk.refTable,
      fk.refColumns,
      fk.actions,
    ]);
    if (fkSignatures.has(signature))
      unsupported.push({
        kind: "duplicate-foreign-key-signature",
        name: row.name,
      });
    fkSignatures.add(signature);
  }
  for (const row of constraints) {
    if (
      (row.type === "f" && !parseConstraintDef(row.definition)) ||
      (row.type === "p" && !parsePrimaryKeyDef(row.definition))
    ) {
      unsupported.push({ kind: "constraint-definition", name: row.name });
    }
  }
  return {
    unsupported,
    tables: tables.map((row) => ({
      name: row.table_name,
      rowEstimate: estimateByName.get(row.table_name) ?? null,
      columns: columns
        .filter((column) => column.table_name === row.table_name)
        .map((column) => ({
          name: column.column_name,
          type: normalizeFormattedType(column.formatted_type),
          notNull: column.not_null === true || column.not_null === "t",
          default: normalizeDefault(column.column_default),
        })),
    })),
    enums: [...enumMap.entries()].map(([name, values]) => ({ name, values })),
    indexes: indexes.map((row) => parseIndexDef(row.indexdef)).filter(Boolean),
    foreignKeys: constraints
      .filter((row) => row.type === "f")
      .map((row) => ({
        name: row.name,
        table: row.table_name,
        ...parseConstraintDef(row.definition),
      }))
      .filter((fk) => fk.columns),
    primaryKeys: constraints
      .filter((row) => row.type === "p")
      .map((row) => ({
        name: row.name,
        table: row.table_name,
        columns: parsePrimaryKeyDef(row.definition),
      }))
      .filter((pk) => pk.columns),
    migrationBookkeeping: {
      present: Boolean(bookkeeping[0]?.present),
      readable: bookkeepingReadable,
      records: applied,
      applied: applied
        .filter((row) => row.finished_at && !row.rolled_back_at)
        .map((row) => row.migration_name),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison
// ─────────────────────────────────────────────────────────────────────────────

const key = (table, columns) => `${table}(${columns.join(",")})`;

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
export const LEDGER_TABLE = "_prisma_migrations";

export function compareInventory(migration, inventory) {
  const isLedger = (name) => name === LEDGER_TABLE;

  const migrationTables = new Map(
    migration.tables.map((table) => [table.name, table]),
  );
  const dbTables = new Map(
    inventory.tables
      .filter((table) => !isLedger(table.name))
      .map((table) => [table.name, table]),
  );

  const tablesOnlyInMigration = [...migrationTables.keys()].filter(
    (name) => !dbTables.has(name),
  );
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
    const dbColumns = new Map(
      dbTable.columns.map((column) => [column.name, column]),
    );
    for (const column of table.columns) {
      const dbColumn = dbColumns.get(column.name);
      if (!dbColumn) {
        columnsOnlyInMigration.push({
          table: name,
          column: column.name,
          type: column.type,
        });
        continue;
      }
      if (dbColumn.type !== column.type) {
        columnTypeDiffs.push({
          table: name,
          column: column.name,
          db: dbColumn.type,
          migration: column.type,
        });
      }
      if (dbColumn.notNull !== column.notNull) {
        columnNullabilityDiffs.push({
          table: name,
          column: column.name,
          db: dbColumn.notNull,
          migration: column.notNull,
        });
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
        columnsOnlyInDb.push({
          table: name,
          column: column.name,
          type: column.type,
        });
      }
    }
  }

  const enumNames = (list) => new Map(list.map((entry) => [entry.name, entry]));
  const migrationEnums = enumNames(migration.enums);
  const dbEnums = enumNames(inventory.enums);
  const enumsOnlyInMigration = [...migrationEnums.keys()].filter(
    (name) => !dbEnums.has(name),
  );
  const enumsOnlyInDb = [...dbEnums.keys()].filter(
    (name) => !migrationEnums.has(name),
  );
  const enumValueDiffs = [];
  for (const [name, entry] of migrationEnums) {
    const dbEntry = dbEnums.get(name);
    if (!dbEntry) continue;
    const onlyInDb = dbEntry.values.filter(
      (value) => !entry.values.includes(value),
    );
    const onlyInMigration = entry.values.filter(
      (value) => !dbEntry.values.includes(value),
    );
    if (
      onlyInDb.length ||
      onlyInMigration.length ||
      JSON.stringify(entry.values) !== JSON.stringify(dbEntry.values)
    ) {
      enumValueDiffs.push({
        name,
        onlyInDb,
        onlyInMigration,
        databaseOrder: dbEntry.values,
        migrationOrder: entry.values,
      });
    }
  }

  const indexKey = (index) =>
    `${index.table}(${index.columns.join(",")})${index.unique ? " unique" : ""} ${index.method ?? "btree"}`;
  const migrationIndexes = new Map(
    migration.indexes.map((index) => [indexKey(index), index]),
  );
  const dbIndexes = new Map(
    inventory.indexes
      .filter((index) => !isLedger(index.table))
      .map((index) => [indexKey(index), index]),
  );
  const indexesOnlyInMigration = [...migrationIndexes.entries()]
    .filter(([k]) => !dbIndexes.has(k))
    .map(([, index]) => index);
  const indexesOnlyInDb = [...dbIndexes.entries()]
    .filter(([k]) => !migrationIndexes.has(k))
    .map(([, index]) => index);
  const indexNameDiffs = [...migrationIndexes.entries()]
    .filter(
      ([k, index]) => dbIndexes.has(k) && dbIndexes.get(k).name !== index.name,
    )
    .map(([k, index]) => ({
      table: index.table,
      columns: index.columns,
      migration: index.name,
      db: dbIndexes.get(k).name,
    }));

  const fkKey = (fk) =>
    `${fk.table}(${fk.columns.join(",")})->${fk.refTable}(${fk.refColumns.join(",")}) ${normalizeForeignKeyActions(fk.actions)}`;
  const migrationFks = new Map(
    migration.foreignKeys.map((fk) => [fkKey(fk), fk]),
  );
  const dbFks = new Map(
    inventory.foreignKeys
      .filter((fk) => !isLedger(fk.table) && !isLedger(fk.refTable))
      .map((fk) => [fkKey(fk), fk]),
  );
  const foreignKeysOnlyInMigration = [...migrationFks.entries()]
    .filter(([k]) => !dbFks.has(k))
    .map(([, fk]) => fk);
  const foreignKeysOnlyInDb = [...dbFks.entries()]
    .filter(([k]) => !migrationFks.has(k))
    .map(([, fk]) => fk);

  const migrationPkKeys = new Set(
    migration.tables
      .filter((table) => table.primaryKey)
      .map((table) => key(table.name, table.primaryKey)),
  );
  const dbPkKeys = new Set(
    inventory.primaryKeys
      .filter((pk) => !isLedger(pk.table))
      .map((pk) => key(pk.table, pk.columns)),
  );
  const primaryKeysOnlyInMigration = [...migrationPkKeys].filter(
    (k) => !dbPkKeys.has(k),
  );
  const primaryKeysOnlyInDb = [...dbPkKeys].filter(
    (k) => !migrationPkKeys.has(k),
  );

  const primaryKeyNameDiffs = migration.tables
    .filter((t) => t.primaryKeyName)
    .flatMap((t) => {
      const pk = inventory.primaryKeys.find(
        (p) =>
          p.table === t.name &&
          key(p.table, p.columns) === key(t.name, t.primaryKey),
      );
      return pk && pk.name !== t.primaryKeyName
        ? [
            {
              table: t.name,
              migration: t.primaryKeyName,
              database: pk.name ?? null,
            },
          ]
        : [];
    });
  const foreignKeyNameDiffs = migration.foreignKeys.flatMap((fk) => {
    const db = dbFks.get(fkKey(fk));
    return db && db.name !== fk.name
      ? [{ table: fk.table, migration: fk.name, database: db.name ?? null }]
      : [];
  });
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
    indexNameDiffs.length === 0 &&
    primaryKeyNameDiffs.length === 0 &&
    foreignKeyNameDiffs.length === 0 &&
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
    primaryKeyNameDiffs,
    foreignKeyNameDiffs,
    foreignKeysOnlyInMigration,
    foreignKeysOnlyInDb,
    primaryKeysOnlyInMigration,
    primaryKeysOnlyInDb,
  };
}

/** Turn a comparison into the decision the merge gate asks for. */
export function ledgerFindings(migration, inventory) {
  const ledger = inventory.migrationBookkeeping;
  if (!ledger?.present) return [];
  const finding = (severity, detail) => ({
    severity,
    kind: "migration-ledger",
    target: LEDGER_TABLE,
    detail,
  });
  if (ledger.readable === false || !Array.isArray(ledger.records))
    return [
      finding("unknown", "Migration ledger could not be fully verified."),
    ];
  const name = path.basename(path.dirname(migration.path));
  const issues = [];
  for (const row of ledger.records) {
    if (!row.finished_at && !row.rolled_back_at)
      issues.push(
        finding("blocking", `Unfinished migration: ${row.migration_name}`),
      );
    if (row.migration_name !== name || row.rolled_back_at) continue;
    if (!migration.sha256)
      issues.push(finding("unknown", "Migration checksum unavailable."));
    else if (row.checksum !== migration.sha256)
      issues.push(
        finding(
          "blocking",
          "Migration checksum does not match the reviewed SQL artifact.",
        ),
      );
    if (
      row.finished_at &&
      (!Number.isInteger(row.applied_steps_count) ||
        row.applied_steps_count < 0)
    )
      issues.push(
        finding(
          "unknown",
          "Completed ledger entry has invalid step metadata; independently verify baseline provenance.",
        ),
      );
  }
  if (
    ledger.records.some((r) => r.migration_name === name) &&
    !ledger.records.some(
      (r) => r.migration_name === name && r.finished_at && !r.rolled_back_at,
    )
  ) {
    issues.push(
      finding(
        "unknown",
        "Only failed or rolled-back records exist for the target migration.",
      ),
    );
  }
  if (
    ledger.records.filter(
      (r) => r.migration_name === name && r.finished_at && !r.rolled_back_at,
    ).length > 1
  )
    issues.push(
      finding(
        "unknown",
        "Duplicate successful records for the target migration.",
      ),
    );
  return issues;
}

export function decide(migration, inventory, comparison) {
  const ledgerIssues = ledgerFindings(migration, inventory);
  const name = path.basename(path.dirname(migration.path));
  const recorded = inventory.migrationBookkeeping?.records?.some(
    (r) => r.migration_name === name && r.finished_at && !r.rolled_back_at,
  );
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
    comparison.indexNameDiffs.length === 0 &&
    comparison.primaryKeyNameDiffs.length === 0 &&
    comparison.foreignKeyNameDiffs.length === 0;
  if (ledgerIssues.length)
    return {
      verdict: "unknown",
      summary:
        "Ledger evidence is incomplete or inconsistent. Hold for DB-owner review.",
      commands: [],
    };
  if (
    (migration.unsupported?.length ?? 0) ||
    (inventory.unsupported?.length ?? 0)
  )
    return {
      verdict: "unknown",
      summary:
        "Unsupported schema objects require independent inspection. Hold; no equivalence claim.",
      commands: [],
    };
  if (comparison.identical)
    return {
      verdict: recorded ? "already-applied" : "baseline",
      summary:
        "Supported schema objects match the reviewed artifact. This diagnostic is not authorization to adopt a baseline or apply any SQL.",
      commands: [],
    };
  if (
    inventory.tables.filter((t) => t.name !== LEDGER_TABLE).length === 0 &&
    inventory.enums.length === 0 &&
    !inventory.migrationBookkeeping?.present
  )
    return {
      verdict: "clean",
      summary:
        "Target has no supported application objects. Verify clone provenance: an empty target does not establish existing-data adoption.",
      commands: [],
    };
  return {
    verdict: "drift",
    additive,
    summary: recorded
      ? "The ledger and the schema disagree. Hold for an independently reviewed data-preserving plan."
      : "The actual clone differs from the reviewed artifact. Hold for an independently reviewed data-preserving plan.",
    commands: [],
    nextAction:
      "A DBA must compare the actual clone schema with the approved target and review all differences. This tool does not generate or execute delta, baseline, or apply commands.",
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
export const quoteIdentifier = (name) =>
  `"${String(name).replace(/"/g, '""')}"`;
const tableName = (name) => `"public".${quoteIdentifier(name)}`;
const sqlError = (error) =>
  /^[0-9A-Z]{5}$/.test(error?.code ?? "")
    ? `SQLSTATE ${error.code}`
    : "database check failed";

// Inspection uses a single repeatable-read transaction. A failed SELECT must
// not poison every subsequent check, so recover using a savepoint, not COMMIT.
export async function checkedQuery(client, sql) {
  await client.query("SAVEPOINT rehearsal_check");
  try {
    return await client.query(sql);
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT rehearsal_check");
    throw error;
  } finally {
    await client.query("RELEASE SAVEPOINT rehearsal_check");
  }
}

export async function safetyChecks(
  client,
  migration,
  comparison,
  inventory,
  checks = [],
) {
  const findings = ledgerFindings(migration, inventory);
  for (const line of migration.unsupported ?? [])
    findings.push({
      severity: "unknown",
      kind: "unsupported-migration",
      target: "migration.sql",
      detail: line,
    });
  for (const object of inventory.unsupported ?? [])
    findings.push({
      severity: "unknown",
      kind: "unsupported-database-object",
      target: object.name,
      detail: object.kind,
    });
  const dbTables = new Set(inventory.tables.map((table) => table.name));
  async function check(kind, target, sql, description) {
    try {
      const rows = (await checkedQuery(client, sql)).rows;
      const n = rows[0]?.count;
      if (n == null || !/^\d+$/.test(String(n)))
        throw new Error("Invalid count");
      const count = BigInt(n);
      checks.push({
        kind,
        target,
        sql,
        status: "executed",
        affectedRows: String(count),
      });
      if (count > 0n)
        findings.push({
          severity: "blocking",
          kind,
          target,
          detail: `${count} row(s): ${description}`,
          sql,
        });
    } catch (error) {
      checks.push({
        kind,
        target,
        sql,
        status: "unknown",
        reason: sqlError(error),
      });
      findings.push({
        severity: "unknown",
        kind,
        target,
        detail: sqlError(error),
        sql,
      });
    }
  }
  // Prove the inspection role can see every application table, even when
  // there are no missing constraints to trigger data checks. No row values are
  // fetched. With row_security=off, an RLS-filtered read fails, not passes.
  for (const table of inventory.tables.filter((t) => t.name !== LEDGER_TABLE)) {
    const sql = `SELECT 1 AS accessible FROM ${tableName(table.name)} LIMIT 1`;
    try {
      await checkedQuery(client, sql);
      checks.push({
        kind: "table-visibility",
        target: table.name,
        sql,
        status: "executed",
      });
    } catch (error) {
      checks.push({
        kind: "table-visibility",
        target: table.name,
        sql,
        status: "unknown",
        reason: sqlError(error),
      });
      findings.push({
        severity: "unknown",
        kind: "table-visibility",
        target: table.name,
        sql,
        detail: sqlError(error),
      });
    }
  }
  const skip = (kind, target) =>
    checks.push({
      kind,
      target,
      status: "not-applicable",
      reason: "Table does not exist in the clone.",
    });
  const duplicateSql = (
    table,
    columns,
    nullDistinct,
  ) => `SELECT COALESCE(SUM(duplicates), 0)::text AS count FROM (
    SELECT COUNT(*) AS duplicates FROM ${tableName(table)}
    ${nullDistinct ? `WHERE ${columns.map((c) => `${quoteIdentifier(c)} IS NOT NULL`).join(" AND ")}` : ""}
    GROUP BY ${columns.map(quoteIdentifier).join(", ")} HAVING COUNT(*) > 1) grouped`;
  for (const index of comparison.indexesOnlyInMigration) {
    if (!index.unique) continue;
    const target = `${index.table}(${index.columns.join(",")})`;
    if (!dbTables.has(index.table)) {
      skip("unique-index", target);
      continue;
    }
    await check(
      "unique-index",
      target,
      duplicateSql(index.table, index.columns, true),
      "duplicate non-NULL keys prevent a unique index",
    );
  }
  for (const table of migration.tables) {
    if (
      !table.primaryKey ||
      !comparison.primaryKeysOnlyInMigration.includes(
        key(table.name, table.primaryKey),
      )
    )
      continue;
    if (!dbTables.has(table.name)) {
      skip("primary-key", table.name);
      continue;
    }
    await check(
      "primary-key-duplicates",
      table.name,
      duplicateSql(table.name, table.primaryKey, false),
      "duplicate primary keys",
    );
    await check(
      "primary-key-nulls",
      table.name,
      `SELECT COUNT(*)::text AS count FROM ${tableName(table.name)} WHERE ${table.primaryKey.map((c) => `${quoteIdentifier(c)} IS NULL`).join(" OR ")}`,
      "NULL primary key columns",
    );
  }
  for (const fk of comparison.foreignKeysOnlyInMigration) {
    const target = `${fk.table}(${fk.columns.join(",")}) → ${fk.refTable}`;
    if (!dbTables.has(fk.table)) {
      skip("foreign-key", target);
      continue;
    }
    if (
      normalizeForeignKeyActions(fk.actions).includes("MATCH FULL") ||
      normalizeForeignKeyActions(fk.actions).includes("MATCH PARTIAL")
    ) {
      findings.push({
        severity: "unknown",
        kind: "foreign-key-match",
        target,
        detail: "Only MATCH SIMPLE row checks are supported.",
      });
      continue;
    }
    const present = fk.columns
      .map((c) => `child.${quoteIdentifier(c)} IS NOT NULL`)
      .join(" AND ");
    const joins = fk.columns
      .map(
        (c, n) =>
          `child.${quoteIdentifier(c)} = parent.${quoteIdentifier(fk.refColumns[n])}`,
      )
      .join(" AND ");
    const sql = dbTables.has(fk.refTable)
      ? `SELECT COUNT(*)::text AS count FROM ${tableName(fk.table)} child WHERE ${present} AND NOT EXISTS (SELECT 1 FROM ${tableName(fk.refTable)} parent WHERE ${joins})`
      : `SELECT COUNT(*)::text AS count FROM ${tableName(fk.table)} child WHERE ${present}`;
    await check("foreign-key", target, sql, "rows reference a missing parent");
  }
  for (const diff of comparison.columnNullabilityDiffs) {
    if (diff.migration !== true || !dbTables.has(diff.table)) continue;
    await check(
      "not-null",
      `${diff.table}.${diff.column}`,
      `SELECT COUNT(*)::text AS count FROM ${tableName(diff.table)} WHERE ${quoteIdentifier(diff.column)} IS NULL`,
      "NULL values prevent NOT NULL",
    );
  }
  for (const diff of comparison.columnsOnlyInMigration) {
    const column = migration.tables
      .find((t) => t.name === diff.table)
      ?.columns.find((c) => c.name === diff.column);
    if (!column?.notNull) continue;
    if (column.default != null) {
      findings.push({
        severity: "unknown",
        kind: "new-required-column-default",
        target: `${diff.table}.${diff.column}`,
        detail:
          "New required-column default/backfill behavior needs independent review.",
      });
      continue;
    }
    await check(
      "new-required-column",
      `${diff.table}.${diff.column}`,
      `SELECT COUNT(*)::text AS count FROM ${tableName(diff.table)}`,
      "existing rows require a backfill for a new NOT NULL column with no default",
    );
  }
  for (const diff of comparison.columnTypeDiffs)
    findings.push({
      severity: "unknown",
      kind: "column-type-change",
      target: `${diff.table}.${diff.column}`,
      detail: "Data-preserving type conversion has not been verified.",
    });
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────────────────────

export function describeTarget(url) {
  // Use the same canonical parsing as the driver, never a hand-written DSN regex.
  // Constructing Client parses configuration only; it does not open a connection.
  try {
    if (!/^postgres(?:ql)?:\/\//i.test(url ?? "")) throw new Error();
    const params = new URLSearchParams(String(url).split("?")[1] ?? "");
    const allowed = new Set([
      "host",
      "sslmode",
      "sslcert",
      "sslkey",
      "sslrootcert",
    ]);
    for (const key of params.keys()) if (!allowed.has(key)) throw new Error();
    const { host, port, database, user } = new pg.Client({
      connectionString: url,
    }).connectionParameters;
    if (!host || !database || !user) throw new Error();
    return {
      host: host.replace(/^\[|\]$/g, ""),
      port: Number(port),
      database,
      role: user,
    };
  } catch {
    throw new Error(
      "Invalid or unsupported clone connection configuration. Do not share the connection string.",
    );
  }
}

export function assertDisposableTarget(
  url,
  { allowRemote = false, expected } = {},
) {
  const target = describeTarget(url);
  if (/prod/i.test(target.database) || /prod/i.test(target.host)) {
    throw new Error("Refusing target: it names production.");
  }
  if (
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(target.database) ||
    !DISPOSABLE_SUFFIXES.some((s) => target.database.toLowerCase().endsWith(s))
  ) {
    throw new Error(
      `Database name must end in one of ${DISPOSABLE_SUFFIXES.join(", ")} and use simple identifier characters.`,
    );
  }
  const local =
    target.host.startsWith("/") || LOCAL_HOSTS.includes(target.host);
  if (!local && !allowRemote)
    throw new Error(
      "A non-local target requires --i-have-a-clone and independent isolation verification.",
    );
  if (
    expected &&
    (target.database !== expected.database ||
      target.host !== expected.host ||
      target.role !== expected.role)
  ) {
    throw new Error(
      "Connection target does not match the independently supplied expected host/database/role.",
    );
  }
  return { ...target, local };
}

export function parseOptions(argv, env = process.env) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const options = {};
  const valued = new Set([
    "--mode",
    "--migration",
    "--migration-sha256",
    "--report",
    "--source-revision",
    "--migration-revision",
    "--expected-host",
    "--expected-database",
    "--expected-role",
    "--clone-source",
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--i-have-a-clone") {
      options.cloneConfirmed = true;
      continue;
    }
    if (!valued.has(arg) || Object.hasOwn(options, arg))
      throw new Error(
        "Unsupported or duplicate argument. Only inspect mode is available; use --help.",
      );
    const value = argv[++i];
    if (!value || value.startsWith("--"))
      throw new Error("Missing argument value; use --help.");
    options[arg] = value;
  }
  if ((options["--mode"] ?? "inspect") !== "inspect")
    throw new Error(
      "Only --mode inspect is supported. Applying migrations is not authorized by this tool.",
    );
  for (const key of valued)
    if (key !== "--mode" && !options[key])
      throw new Error(`Required argument: ${key}`);
  if (!options.cloneConfirmed)
    throw new Error(
      "Confirm approved clone provenance with --i-have-a-clone; the name alone is insufficient.",
    );
  if (!env.REHEARSAL_DATABASE_URL)
    throw new Error(
      "Inject REHEARSAL_DATABASE_URL securely; never supply a URL on the command line.",
    );
  if (!/^[a-f0-9]{40}$/i.test(options["--source-revision"]))
    throw new Error("Source revision must be a full Git SHA.");
  if (!/^[a-f0-9]{40}$/i.test(options["--migration-revision"]))
    throw new Error(
      "Source revision for the migration must be a full Git SHA.",
    );
  if (!/^[a-f0-9]{64}$/i.test(options["--migration-sha256"]))
    throw new Error(
      "Reviewed migration SHA-256 must be supplied independently.",
    );
  if (!options["--report"].endsWith(".md"))
    throw new Error(
      "Report path must end in .md; a complete .json sibling will also be created.",
    );
  return {
    url: env.REHEARSAL_DATABASE_URL,
    target: assertDisposableTarget(env.REHEARSAL_DATABASE_URL, {
      allowRemote: true,
      expected: {
        host: options["--expected-host"],
        database: options["--expected-database"],
        role: options["--expected-role"],
      },
    }),
    migrationPath: path.resolve(options["--migration"]),
    migrationSha256: options["--migration-sha256"].toLowerCase(),
    reportPath: path.resolve(options["--report"]),
    sourceRevision: options["--source-revision"],
    migrationRevision: options["--migration-revision"],
    cloneSource: options["--clone-source"],
  };
}

export const IDENTITY_QUERY = `SELECT current_database() AS database, current_user AS role,
  session_user AS session_role, current_setting('transaction_read_only') AS read_only,
  current_setting('transaction_isolation') AS isolation, current_setting('search_path') AS search_path,
  current_setting('row_security') AS row_security,
  current_setting('server_version') AS server_version,
  inet_server_addr()::text AS server_address, inet_server_port() AS server_port`;

export async function inspectDatabase(client, migration, options) {
  const startedAt = new Date().toISOString();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
    await client.query("SET LOCAL search_path = pg_catalog, public");
    // A restricted role must fail a data query instead of silently reading an
    // RLS-filtered subset. RLS objects are also reported as unsupported below.
    await client.query("SET LOCAL row_security = off");
    const identity = (await client.query(IDENTITY_QUERY)).rows[0];
    if (
      !identity ||
      identity.database !== options.target.database ||
      identity.role !== options.target.role ||
      identity.session_role !== options.target.role ||
      identity.read_only !== "on" ||
      identity.isolation !== "repeatable read" ||
      identity.row_security !== "off" ||
      identity.search_path?.replace(/\s+/g, "") !== "pg_catalog,public"
    ) {
      throw new Error(
        "Connected identity or read-only snapshot controls do not match the approved inspection.",
      );
    }
    const inventory = await readInventory(client);
    const comparison = compareInventory(migration, inventory);
    const decision = decide(migration, inventory, comparison);
    const checks = [];
    const findings = await safetyChecks(
      client,
      migration,
      comparison,
      inventory,
      checks,
    );
    const status =
      findings.length || ["drift", "unknown"].includes(decision.verdict)
        ? "HOLD"
        : "REVIEW_REQUIRED";
    return {
      schemaVersion: 1,
      mode: "inspect",
      status,
      executionStatus: "completed",
      approval: "NOT_GRANTED",
      startedAt,
      completedAt: new Date().toISOString(),
      sourceRevision: options.sourceRevision,
      toolSha256: createHash("sha256")
        .update(readFileSync(fileURLToPath(import.meta.url)))
        .digest("hex"),
      cloneSource: {
        operatorAssertion: options.cloneSource,
        independentlyVerifiedByTool: false,
      },
      target: options.target,
      identity,
      migration: {
        name: path.basename(path.dirname(migration.path)),
        sha256: migration.sha256,
        sourceRevision: options.migrationRevision,
      },
      decision,
      inventory,
      comparison,
      findings,
      checks,
      findingCounts: {
        blocking: findings.filter((f) => f.severity === "blocking").length,
        unknown: findings.filter((f) => f.severity === "unknown").length,
      },
      postApplyVerification: {
        status: "not-applicable",
        reason: "Inspect-only; no apply performed.",
      },
    };
  } finally {
    // No COMMIT path exists, including when checks fail.
    await client.query("ROLLBACK");
  }
}

const printableJson = (value) =>
  JSON.stringify(value, null, 2)
    .replace(/`/g, "\\u0060")
    .replace(/</g, "\\u003c");
export function renderReport(report) {
  const { inventory, comparison, findings, checks, ...summary } = report;
  return (
    `# Migration inspection — ${report.status}\n\n` +
    "**Diagnostic only. No migration, baseline, deployment, or release approval.**\n\n" +
    "Exit 0 means ready for independent review, never permission to apply. Exit 2 means HOLD.\n\n" +
    "## Identity, provenance and verdict\n\n```json\n" +
    printableJson(summary) +
    "\n```\n\n" +
    "## Complete schema inventory\n\n```json\n" +
    printableJson(inventory) +
    "\n```\n\n" +
    "## Complete bidirectional comparison\n\n```json\n" +
    printableJson(comparison) +
    "\n```\n\n" +
    "## Complete blocking and unknown findings (including SQL)\n\n```json\n" +
    printableJson(findings) +
    "\n```\n\n" +
    "## Every row-safety check (including SQL and skipped checks)\n\n```json\n" +
    printableJson(checks) +
    "\n```\n\n" +
    "Post-apply verification: **N/A — inspect-only**. Review all unsupported objects and operator provenance independently.\n"
  );
}

export function writeReports(report, reportPath) {
  const jsonPath = reportPath.replace(/\.md$/, ".json");
  if (jsonPath === reportPath) throw new Error("Report path must end in .md.");
  if (existsSync(reportPath) || existsSync(jsonPath))
    throw new Error(
      "Report files already exist. Use new paths; never overwrite prior evidence.",
    );
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(reportPath, renderReport(report), { flag: "wx", mode: 0o600 });
}

export async function main(argv, env = process.env) {
  const options = parseOptions(argv, env);
  if (options.help) {
    console.log(`Inspect an independently verified disposable staging clone; no apply mode exists.
Inject REHEARSAL_DATABASE_URL using the approved secret mechanism. Never print it.
Required arguments:
  --mode inspect --i-have-a-clone
  --expected-host <canonical-host> --expected-database <disposable-name> --expected-role <role>
  --migration <reviewed-migration.sql> --migration-sha256 <independently-verified-sha256>
  --source-revision <tool-full-git-sha> --migration-revision <sql-full-git-sha>
  --clone-source <non-secret-backup-reference>
  --report <new-private-directory/report.md>
Writes complete .md and .json evidence, mode 0600; never overwrites files.
Exit 0 = REVIEW_REQUIRED (not approved), 2 = HOLD, 1 = execution/configuration failed.
Provisioning/restoring a clone needs separate operator approval. Never substitute live staging or production.`);
    return 0;
  }
  const jsonPath = options.reportPath.replace(/\.md$/, ".json");
  if (
    existsSync(options.reportPath) ||
    existsSync(jsonPath) ||
    !existsSync(path.dirname(options.reportPath))
  )
    throw new Error(
      "Choose new report paths in an existing private evidence directory.",
    );
  const sql = readFileSync(options.migrationPath, "utf8");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (sha256 !== options.migrationSha256)
    throw new Error(
      "Migration artifact checksum mismatch; no connection attempted.",
    );
  const migration = {
    ...parseMigration(sql),
    path: options.migrationPath,
    sha256,
  };
  if (!migration.tables.length || !sql.trim())
    throw new Error(
      "Expected a reviewed initial CREATE-schema artifact; no connection attempted.",
    );
  const client = new pg.Client({
    connectionString: options.url,
    connectionTimeoutMillis: 15000,
    query_timeout: 35000,
    application_name: "flowops-inspect-only",
  });
  let report;
  try {
    await client.connect();
    report = await inspectDatabase(client, migration, options);
  } finally {
    await client.end();
  }
  writeReports(report, options.reportPath);
  console.log(
    `Inspection ${report.status}; verdict ${report.decision.verdict}; blocking ${report.findingCounts.blocking}; unknown ${report.findingCounts.unknown}. No apply or release approval.`,
  );
  return report.status === "HOLD" ? 2 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      // Never reflect raw driver errors or DSNs. Config errors below originate in
      // this tool; native/SQL errors receive only a safe code. Detailed database
      // check evidence is already redacted and stored in the private report.
      const safe = error?.code
        ? `Execution failed (${sqlError(error)}).`
        : /^(Required argument:|Unsupported or duplicate|Missing argument|Only --mode|Confirm approved|Inject REHEARSAL|Source revision|Reviewed migration|Report path|Invalid or unsupported|Refusing target|Database name|A non-local|Connection target|Choose new report|Migration artifact|Expected a reviewed|Connected identity)/.test(
              error?.message ?? "",
            )
          ? error.message
          : "Inspection failed; no approval or successful evidence should be inferred.";
      console.error(safe);
      process.exitCode = 1;
    });
}
