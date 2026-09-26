#!/usr/bin/env node
/**
 * Summarise a migration before anyone trusts it.
 *
 * A migration is the one artefact in this repository that can destroy data
 * irreversibly, so "it applies cleanly" is not enough: every operation has to be
 * seen. This tool classifies the operations in a migration.sql, flags every
 * destructive statement, and — given the schema — reports whether the migration
 * and the datamodel agree on the set of tables.
 *
 * Usage:
 *   node scripts/review-migration.mjs prisma/migrations/<ts>_<name>/migration.sql
 *                                   [--schema prisma/schema.prisma]
 *                                   [--allow-destructive]
 *
 * Exit codes: 0 = no destructive operations, 1 = flagged (or the file is unreadable).
 */

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Statements that can remove or rewrite existing data. Order matters: the more
 * specific ALTER forms are tested before the generic DROP, so a report says
 * "ALTER TABLE ... DROP" rather than just "DROP".
 */
const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bALTER\s+TABLE\b[^;]*\bDROP\b/i, what: 'ALTER TABLE ... DROP' },
  { pattern: /\bALTER\s+(TYPE|DOMAIN)\b[^;]*\bDROP\b/i, what: 'ALTER TYPE/DOMAIN ... DROP' },
  { pattern: /\bALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, what: 'ALTER COLUMN ... TYPE (rewrite)' },
  { pattern: /\bALTER\s+TABLE\b[^;]*\bSET\s+NOT\s+NULL\b/i, what: 'SET NOT NULL (can fail on existing rows)' },
  { pattern: /\bRENAME\s+(TABLE|COLUMN|CONSTRAINT)\b/i, what: 'RENAME' },
  { pattern: /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX|CONSTRAINT|SCHEMA|DATABASE|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|FUNCTION|TRIGGER)\b/i, what: 'DROP' },
  { pattern: /\bTRUNCATE\b/i, what: 'TRUNCATE' },
  { pattern: /^\s*DELETE\s+FROM\b/im, what: 'DELETE FROM' },
];

/**
 * Split a migration into statements without a full SQL parser: Prisma emits one
 * statement per line, except CREATE TABLE blocks, which end at `);`.
 */
export function splitStatements(sql) {
  const statements = [];
  let current = [];

  for (const rawLine of sql.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('--')) continue;
    if (current.length > 0) {
      current.push(line);
      if (/\);$/.test(line)) {
        statements.push(current.join(' '));
        current = [];
      }
      continue;
    }
    if (/^CREATE TABLE\b/i.test(line) && !/\);$/.test(line)) {
      current = [line];
      continue;
    }
    statements.push(line);
  }
  if (current.length > 0) statements.push(current.join(' '));

  return statements;
}

/** Classify statements into review buckets. */
export function summariseStatements(statements) {
  const counts = {};
  const bump = (bucket) => {
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  };

  for (const statement of statements) {
    if (/^CREATE TYPE\b/i.test(statement)) bump('CREATE TYPE (enum)');
    else if (/^CREATE TABLE\b/i.test(statement)) bump('CREATE TABLE');
    else if (/^CREATE UNIQUE INDEX\b/i.test(statement)) bump('CREATE UNIQUE INDEX');
    else if (/^CREATE INDEX\b/i.test(statement)) bump('CREATE INDEX');
    else if (/^ALTER TABLE[\s\S]*ADD CONSTRAINT[\s\S]*PRIMARY KEY/i.test(statement))
      bump('ADD PRIMARY KEY');
    else if (/^ALTER TABLE[\s\S]*ADD CONSTRAINT[\s\S]*FOREIGN KEY/i.test(statement))
      bump('ADD FOREIGN KEY');
    else if (/^ALTER TABLE[\s\S]*ADD CONSTRAINT[\s\S]*UNIQUE/i.test(statement))
      bump('ADD UNIQUE CONSTRAINT');
    else if (/^ALTER TABLE\b/i.test(statement)) bump('ALTER TABLE (other)');
    else if (/^CREATE\b/i.test(statement)) bump('CREATE (other)');
    else bump(`UNCLASSIFIED: ${statement.slice(0, 70)}`);
  }

  return counts;
}

/** Every destructive statement in the migration, with its bucket. */
export function findDestructive(statements) {
  const found = [];
  for (const statement of statements) {
    for (const { pattern, what } of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(statement)) {
        found.push({ what, statement: statement.slice(0, 160) });
        break;
      }
    }
  }
  return found;
}

/** Tables the migration creates. */
export function createdTables(statements) {
  return statements
    .map((statement) => /^CREATE TABLE "([^"]+)"/i.exec(statement))
    .filter(Boolean)
    .map((match) => match[1]);
}

/**
 * Tables the Prisma schema expects: `model X { ... }` → table from `@@map` or
 * the model name, skipping `@@ignore`d models.
 */
export function modelTables(schemaSource) {
  const models = [...schemaSource.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  return models
    .filter((model) => !/@@ignore/.test(model[2]))
    .map((model) => {
      const mapped = /@@map\("([^"]+)"\)/.exec(model[2]);
      return { model: model[1], table: mapped ? mapped[1] : model[1] };
    });
}

/** Compare migration tables with schema tables; both directions matter. */
export function compareTables(tables, models) {
  const tableSet = new Set(tables);
  const modelTableSet = new Set(models.map((m) => m.table));
  return {
    modelsWithoutTable: models.filter((m) => !tableSet.has(m.table)),
    tablesWithoutModel: tables.filter((t) => !modelTableSet.has(t)),
  };
}

function main(argv) {
  const file = argv.find((arg) => !arg.startsWith('--'));
  if (!file) {
    console.error(
      'Usage: node scripts/review-migration.mjs <migration.sql> [--schema prisma/schema.prisma] [--allow-destructive]',
    );
    return 1;
  }

  const filePath = path.resolve(file);
  if (!existsSync(filePath)) {
    console.error(`::error::No such migration file: ${filePath}`);
    return 1;
  }

  const schemaFlag = argv.indexOf('--schema');
  const schemaPath = path.resolve(
    schemaFlag === -1 ? 'prisma/schema.prisma' : argv[schemaFlag + 1],
  );
  const allowDestructive = argv.includes('--allow-destructive');

  const sql = readFileSync(filePath, 'utf8');
  const statements = splitStatements(sql);
  const counts = summariseStatements(statements);
  const destructive = findDestructive(statements);
  const tables = createdTables(statements);

  console.log(`Migration: ${path.relative(process.cwd(), filePath)}`);
  console.log(`Statements: ${statements.length}`);
  for (const [bucket, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${bucket}`);
  }

  if (existsSync(schemaPath)) {
    const models = modelTables(readFileSync(schemaPath, 'utf8'));
    const { modelsWithoutTable, tablesWithoutModel } = compareTables(tables, models);
    console.log(
      `Schema parity: ${models.length} model(s), ${tables.length} CREATE TABLE — ` +
        `${modelsWithoutTable.length} model(s) without a table, ` +
        `${tablesWithoutModel.length} table(s) without a model`,
    );
    for (const m of modelsWithoutTable) console.log(`  ! model ${m.model} has no CREATE TABLE`);
    for (const t of tablesWithoutModel) console.log(`  ! table ${t} has no model`);
    if (modelsWithoutTable.length > 0 || tablesWithoutModel.length > 0) {
      console.log('  (a mismatch here means the migration no longer matches the datamodel)');
    }
  } else {
    console.log(`Schema not found at ${schemaPath}; skipped parity check.`);
  }

  const unclassified = Object.keys(counts).filter((bucket) => bucket.startsWith('UNCLASSIFIED'));
  if (unclassified.length > 0) {
    console.log('Unclassified statements (review by hand):');
    for (const bucket of unclassified) console.log(`  ! ${bucket.slice('UNCLASSIFIED: '.length)}`);
  }

  if (destructive.length > 0) {
    console.log(`Destructive operations: ${destructive.length}`);
    for (const item of destructive) console.log(`  !! ${item.what}: ${item.statement}`);
    if (!allowDestructive) {
      console.error(
        '::error::Destructive SQL found. Confirm the data loss is intended, then re-run with ' +
          '--allow-destructive and record the decision in the PR.',
      );
      return 1;
    }
    console.log('  (allowed by --allow-destructive)');
    return 0;
  }

  console.log('Destructive operations: none');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('review-migration.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
