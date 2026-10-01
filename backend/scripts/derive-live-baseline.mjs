#!/usr/bin/env node
/**
 * One-time provenance tool: split the reviewed 133-table init migration into
 *   (a) the baseline that matches the production database (116 tables), and
 *   (b) the additive Process Book / Product Master delta (17 tables).
 *
 * Why this exists
 * ---------------
 * The production database was created and maintained with `prisma db push` — the
 * release-hardening work removed that, but the database it built has no
 * `_prisma_migrations` ledger (verified on a restored clone: the table is absent).
 * The reviewed init migration in this repository describes 133 tables because it
 * also contains the unreleased Process Book and Product Master models, while the
 * live database has 116.
 *
 * Adoption is therefore a two-step Prisma flow, and neither step may run the other's
 * SQL:
 *   1. on the live database, record the init migration as applied WITHOUT executing
 *      it (`prisma migrate resolve --applied 20260926130650_init`), and
 *   2. let `prisma migrate deploy` add the 17 missing tables in a second, additive
 *      migration.
 *
 * For step 1 to be honest, the init migration must describe the live schema exactly.
 * If it described 133 tables, the ledger would claim a baseline the database does not
 * have, and every later drift check (`migrations:review`, CI's "migrations match the
 * schema" guard) would compare the wrong thing.
 *
 * This tool performs that split without a single hand-written statement: every line
 * of both outputs was emitted by the real Prisma toolchain when
 * 20260926130650_init was generated from `prisma/schema.prisma`. The only edit is the
 * removal of the `inventory_items."productVariantId"` column line from its CREATE
 * TABLE body, which the delta re-adds as the equivalent `ALTER TABLE ... ADD COLUMN`
 * that `prisma migrate diff` generates for an existing table.
 *
 * Usage
 * -----
 *   # read the input from git history, so the input can never change under you:
 *   git show <pre-baseline-commit>:backend/prisma/migrations/20260926130650_init/migration.sql > /tmp/init-full.sql
 *   node scripts/derive-live-baseline.mjs \
 *     --from /tmp/init-full.sql \
 *     --out-baseline prisma/migrations/20260926130650_init/migration.sql \
 *     --out-delta prisma/migrations/20260930143000_add_process_book_product_master/migration.sql
 *
 * Exit codes: 0 = both files written, 1 = an invariant failed and nothing was written.
 *
 * The invariants are the point of the tool:
 *   - the source must be the reviewed full-schema migration (sha256-pinned),
 *   - the object sets below must partition the source exactly (counts add up),
 *   - every removed foreign key must reference a removed table or the added column,
 *   - no removed enum may still be referenced by the baseline,
 *   - `baseline + delta` must equal `source` statement for statement,
 *   - neither output may contain a destructive statement.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findDestructive, splitStatements } from './review-migration.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, '..');

/** The reviewed full-schema migration this tool is allowed to split. */
const SOURCE_SHA256 = '1cc98427487d8363792eace3337066da4efeb206d4ee3a27c2202e6efc2c4e7b';

/** Enums that exist in `prisma/schema.prisma` but not in the live database. */
const NEW_ENUMS = [
  'ProcessLifecycleStatus',
  'ProcessStepType',
  'ProcessInstanceStatus',
  'ProcessStepInstanceStatus',
  'ProcessIncidentSeverity',
  'ProcessIncidentStatus',
  'ProcessSolutionStatus',
  'ProcessOutcomeStatus',
  'ChangeProposalStatus',
  'ProductApprovalStatus',
  'VariantApprovalStatus',
];

/** Tables that exist in `prisma/schema.prisma` but not in the live database. */
const NEW_TABLES = [
  'process_definitions',
  'process_versions',
  'process_step_definitions',
  'process_automation_rules',
  'process_instances',
  'process_step_instances',
  'process_incidents',
  'process_solutions',
  'process_outcomes',
  'process_change_proposals',
  'automation_runs',
  'process_audit_events',
  'products',
  'product_variants',
  'product_aliases',
  'sku_sequences',
  'master_data_audit_events',
];

/** The one column that exists in the datamodel but not in the live database. */
const ADDED_COLUMN = { table: 'inventory_items', column: 'productVariantId' };
/** Its index and foreign key, which live lacks for the same reason. */
const ADDED_INDEXES = ['inventory_items_productVariantId_idx'];
const ADDED_FOREIGN_KEYS = ['inventory_items_productVariantId_fkey'];

/**
 * Counts measured on the restored live clone and on the delta Prisma generated from
 * it (`prisma migrate diff --from-url <clone> --to-schema-datamodel`), which is what
 * makes this partition provable rather than arbitrary:
 *   full source 133/72/229/150  −  removed 17/11/50/34  =  live 116/61/179/116.
 */
const EXPECTED_SOURCE = { tables: 133, enums: 72, indexes: 229, foreignKeys: 150 };
const EXPECTED_BASELINE = { tables: 116, enums: 61, indexes: 179, foreignKeys: 116 };
const EXPECTED_DELTA = { tables: 17, enums: 11, indexes: 50, foreignKeys: 34 };

const VERIFICATION_DOC = 'docs/MIGRATION-BASELINE-ADOPTION-2026-09-30.md';

const BASELINE_PREAMBLE = [
  '-- FlowOps baseline schema: the schema of the production database on 2026-09-30',
  '-- (dump flowops_20260930_120047.sql.gz).',
  '--',
  '-- The production database was built and maintained with `prisma db push`, so it has no',
  '-- _prisma_migrations ledger: 116 tables, 61 enums, 179 indexes, 116 foreign keys.',
  '-- Prisma 5.22 generated the same statement set from a restored copy of that database:',
  '--   prisma migrate diff --from-empty --to-url <clone> --script',
  '-- (3430 lines, 116/61/179/116, sha256 4877218c148cf237140481e7a4e7fda6cf202eb44f90533fb453836ea407392f).',
  '-- The clone was also checked for objects Prisma cannot express — 0 views, 0 functions,',
  '-- 0 triggers, only the `plpgsql` extension — so replaying this file loses nothing.',
  '--',
  '-- This file is that same statement set, moved out of the pre-baseline',
  '-- 20260926130650_init by scripts/derive-live-baseline.mjs. No statement was written by',
  '-- hand, and the tool refuses to write unless baseline + delta equals that migration',
  '-- statement for statement.',
  '--',
  '-- Adoption: a database that already has this schema is adopted with',
  '--   prisma migrate resolve --applied 20260926130650_init',
  '-- which records the migration WITHOUT executing it. Fresh databases replay the file',
  '-- with `prisma migrate deploy`. The Process Book / Product Master tables that',
  '-- prisma/schema.prisma still expects are added by',
  '-- 20260930143000_add_process_book_product_master.',
  '-- Equivalence to the live database is re-established by building a database from this',
  '-- file and diffing it against the restored clone; evidence is in ' + VERIFICATION_DOC + '.',
  '--',
  '-- Contains no destructive operations: CREATE TYPE / CREATE TABLE / CREATE INDEX and',
  '-- ADD CONSTRAINT only.',
  '--',
  '-- Do not edit once this migration has been applied anywhere: Prisma stores a checksum',
  '-- in _prisma_migrations and refuses to deploy an edited file.',
];

const DELTA_PREAMBLE = [
  '-- Additive migration: the Process Book and Product Master models that',
  '-- prisma/schema.prisma expects and the production database does not have yet.',
  '--',
  '-- 11 enums, 17 tables, 50 indexes, 34 foreign keys and one new column',
  '-- (inventory_items."productVariantId"). Prisma 5.22 generated these statements from the',
  '-- live schema:',
  '--   prisma migrate diff --from-url <clone> --to-schema-datamodel prisma/schema.prisma --script',
  '-- (661 lines, sha256 791b62a4d832ea74e02b0f1a535172e83f2ad913e92a620372d5ffaa1c2f6927).',
  '-- Every statement here was emitted by that run; scripts/derive-live-baseline.mjs only',
  '-- moved the same statements out of the pre-baseline 20260926130650_init.',
  '--',
  '-- Applied to the live database by `prisma migrate deploy` after the baseline above is',
  '-- recorded with `prisma migrate resolve --applied 20260926130650_init`.',
  '--',
  '-- Verified additive: no DROP, no ALTER COLUMN ... TYPE, no SET NOT NULL and no data',
  '-- statement of any kind — only CREATE and ADD COLUMN / ADD CONSTRAINT.',
];

const CREATE_TYPE = /^CREATE TYPE "([^"]+)" AS ENUM/;
const CREATE_TABLE = /^CREATE TABLE "([^"]+)" \(/;
const CREATE_INDEX = /^CREATE (?:UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"/;
const ADD_FOREIGN_KEY = /^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY/;

/**
 * Split a Prisma migration into units of (leading comments/blank lines + statement).
 * The file's own leading comment block is returned separately as `preamble` so each
 * output can carry a preamble that describes what that file now is.
 */
export function parseUnits(source) {
  const lines = source.split('\n');
  const units = [];
  const preamble = [];
  let header = [];
  let seenStatement = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.startsWith('--')) {
      header.push(line);
      continue;
    }
    const sql = [line];
    if (CREATE_TABLE.test(line)) {
      while (!/\);$/.test(sql[sql.length - 1])) {
        i += 1;
        if (i >= lines.length) throw new Error('Unterminated CREATE TABLE block.');
        sql.push(lines[i]);
      }
    }
    if (!seenStatement) {
      preamble.push(...header);
      header = [];
      seenStatement = true;
    }
    // Blank lines around a statement are separators between units, not part of this
    // unit's header (units are joined with a blank line).
    while (header.length > 0 && header[header.length - 1].trim() === '') header.pop();
    while (header.length > 0 && header[0].trim() === '') header.shift();
    units.push({ header, sql });
    header = [];
  }
  return { preamble, units };
}

/** Classify a unit; returns the object it creates or undefined for unknown SQL. */
export function classify(sql) {
  const first = sql[0];
  let match = CREATE_TYPE.exec(first);
  if (match) return { kind: 'enum', name: match[1] };
  match = CREATE_TABLE.exec(first);
  if (match) return { kind: 'table', name: match[1] };
  match = CREATE_INDEX.exec(first);
  if (match) return { kind: 'index', name: match[1], table: match[2] };
  match = ADD_FOREIGN_KEY.exec(first);
  if (match) return { kind: 'foreignKey', table: match[1], name: match[2] };
  return { kind: 'unknown', name: first.slice(0, 60) };
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function textOf(unit) {
  return [...unit.header, ...unit.sql].join('\n');
}

function counts(units) {
  const totals = { tables: 0, enums: 0, indexes: 0, foreignKeys: 0, unknown: [] };
  for (const unit of units) {
    const c = classify(unit.sql);
    if (c.kind === 'table') totals.tables += 1;
    else if (c.kind === 'enum') totals.enums += 1;
    else if (c.kind === 'index') totals.indexes += 1;
    else if (c.kind === 'foreignKey') totals.foreignKeys += 1;
    else totals.unknown.push(c.name);
  }
  return totals;
}

export function derive({ source }) {
  const errors = [];
  const { units } = parseUnits(source);

  const sourceCounts = counts(units);
  for (const [key, expected] of Object.entries(EXPECTED_SOURCE)) {
    if (sourceCounts[key] !== expected) {
      errors.push(`source ${key}: expected ${expected}, found ${sourceCounts[key]}`);
    }
  }
  if (sourceCounts.unknown.length > 0) {
    errors.push(`source contains statements this tool cannot classify: ${sourceCounts.unknown.join(' | ')}`);
  }

  const newTables = new Set(NEW_TABLES);
  const newEnums = new Set(NEW_ENUMS);
  const addedIndexes = new Set(ADDED_INDEXES);
  const addedForeignKeys = new Set(ADDED_FOREIGN_KEYS);

  const baseline = [];
  const delta = { enums: [], tables: [], indexes: [], foreignKeys: [], columns: [] };

  for (const unit of units) {
    const c = classify(unit.sql);
    if (c.kind === 'enum' && newEnums.has(c.name)) {
      delta.enums.push(unit);
      continue;
    }
    if (c.kind === 'table' && newTables.has(c.name)) {
      delta.tables.push(unit);
      continue;
    }
    if (c.kind === 'index' && (newTables.has(c.table) || addedIndexes.has(c.name))) {
      delta.indexes.push(unit);
      continue;
    }
    if (c.kind === 'foreignKey' && (newTables.has(c.table) || addedForeignKeys.has(c.name))) {
      delta.foreignKeys.push(unit);
      continue;
    }
    if (c.kind === 'table' && c.name === ADDED_COLUMN.table) {
      // The one mutation: drop the added column from the baseline's CREATE TABLE body
      // and re-add it in the delta as ALTER TABLE ... ADD COLUMN, which is the form
      // Prisma generates when the table already exists.
      const columnLine = new RegExp(`^\\s*"${ADDED_COLUMN.column}"\\s+(.+?),?$`);
      const kept = unit.sql.filter((line) => !columnLine.test(line));
      if (kept.length !== unit.sql.length - 1) {
        errors.push(
          `expected exactly one "${ADDED_COLUMN.column}" line in ${c.name}, removed ${unit.sql.length - kept.length}`,
        );
      }
      const removedLine = unit.sql.find((line) => columnLine.test(line));
      const definition = removedLine && removedLine.trim().replace(/,$/, '');
      baseline.push({ header: unit.header, sql: kept });
      delta.columns.push({
        header: ['-- AlterTable'],
        sql: [`ALTER TABLE "${ADDED_COLUMN.table}" ADD COLUMN     ${definition};`],
      });
      continue;
    }
    baseline.push(unit);
  }

  const baselineCounts = counts(baseline);
  const deltaUnits = [
    ...delta.enums,
    ...delta.columns,
    ...delta.tables,
    ...delta.indexes,
    ...delta.foreignKeys,
  ];
  const deltaCounts = counts(deltaUnits);

  for (const [key, expected] of Object.entries(EXPECTED_BASELINE)) {
    if (baselineCounts[key] !== expected) {
      errors.push(`baseline ${key}: expected ${expected}, found ${baselineCounts[key]}`);
    }
  }
  for (const [key, expected] of Object.entries(EXPECTED_DELTA)) {
    if (deltaCounts[key] !== expected) {
      errors.push(`delta ${key}: expected ${expected}, found ${deltaCounts[key]}`);
    }
  }

  // Every removed foreign key must point at a table that is either removed with it
  // (the 17 new ones) or still present in the baseline.
  for (const unit of delta.foreignKeys) {
    const referenced = /REFERENCES "([^"]+)"/.exec(unit.sql.join(' '));
    const target = referenced && referenced[1];
    if (!target) {
      errors.push(`foreign key without a REFERENCES clause: ${unit.sql[0]}`);
    } else if (!newTables.has(target) && !baselineHasTable(baseline, target)) {
      errors.push(`foreign key references "${target}", which is in neither the baseline nor the delta`);
    }
  }

  // No enum removed from the baseline may still be used by it. The removed enums'
  // CREATE TYPE statements are gone from the baseline, so any remaining mention of the
  // name is a column type that would then reference a type that does not exist.
  const baselineText = baseline.map(textOf).join('\n');
  for (const enumName of NEW_ENUMS) {
    if (baselineText.includes(`"${enumName}"`)) {
      errors.push(`enum "${enumName}" is still referenced by the baseline`);
    }
  }

  // Statement-for-statement equality: baseline + delta == source (modulo the one
  // column moved from a CREATE TABLE body to an ADD COLUMN).
  const sourceNormalised = units
    .map((unit) => textOf(normaliseInventoryItems(unit, newTables, ADDED_COLUMN)))
    .sort();
  const combined = [...baseline, ...delta.enums, ...delta.tables, ...delta.indexes, ...delta.foreignKeys]
    .map(textOf)
    .sort();
  if (sourceNormalised.length !== combined.length) {
    errors.push(`statement count mismatch: source ${sourceNormalised.length}, baseline+delta ${combined.length}`);
  } else {
    for (let i = 0; i < sourceNormalised.length; i += 1) {
      if (sourceNormalised[i] !== combined[i]) {
        errors.push(`statement mismatch at ${i}: source "${sourceNormalised[i].slice(0, 70)}"`);
        break;
      }
    }
  }

  const baselineTextFinal = [BASELINE_PREAMBLE.join('\n'), baseline.map(textOf).join('\n\n')].join('\n\n') + '\n';
  const deltaTextFinal = [DELTA_PREAMBLE.join('\n'), deltaUnits.map(textOf).join('\n\n')].join('\n\n') + '\n';

  for (const [label, text] of [
    ['baseline', baselineTextFinal],
    ['delta', deltaTextFinal],
  ]) {
    const destructive = findDestructive(splitStatements(text));
    if (destructive.length > 0) {
      errors.push(`${label} contains destructive statements: ${destructive.map((d) => d.what).join(', ')}`);
    }
  }

  return {
    errors,
    baselineText: baselineTextFinal,
    deltaText: deltaTextFinal,
    sourceCounts,
    baselineCounts,
    deltaCounts: { ...deltaCounts, columns: delta.columns.length },
  };
}

function baselineHasTable(baseline, table) {
  return baseline.some((unit) => {
    const c = classify(unit.sql);
    return c.kind === 'table' && c.name === table;
  });
}

function normaliseInventoryItems(unit, newTables, addedColumn) {
  const c = classify(unit.sql);
  if (c.kind !== 'table' || c.name !== addedColumn.table || newTables.has(c.name)) return unit;
  const columnLine = new RegExp(`^\\s*"${addedColumn.column}"\\s+`);
  const kept = unit.sql.filter((line) => !columnLine.test(line));
  return { header: unit.header, sql: kept };
}

function argOf(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function main(argv) {
  const from = argOf(argv, '--from');
  const outBaseline = argOf(argv, '--out-baseline');
  const outDelta = argOf(argv, '--out-delta');
  if (!from || !outBaseline || !outDelta) {
    console.error('Usage: derive-live-baseline.mjs --from <full-init.sql> --out-baseline <path> --out-delta <path>');
    return 1;
  }

  const source = readFileSync(from, 'utf8');
  const digest = sha256(source);
  if (digest !== SOURCE_SHA256) {
    console.error(`::error::${from} is not the reviewed full-schema migration.`);
    console.error(`  expected sha256 ${SOURCE_SHA256}`);
    console.error(`  found    sha256 ${digest}`);
    return 1;
  }

  const result = derive({ source });
  if (result.errors.length > 0) {
    console.error('::error::Invariants failed; nothing written.');
    for (const error of result.errors) console.error(`  - ${error}`);
    return 1;
  }

  mkdirSync(path.dirname(path.resolve(outBaseline)), { recursive: true });
  mkdirSync(path.dirname(path.resolve(outDelta)), { recursive: true });
  writeFileSync(outBaseline, result.baselineText);
  writeFileSync(outDelta, result.deltaText);

  const report = (label, c) =>
    `${label}: ${c.tables} tables, ${c.enums} enums, ${c.indexes} indexes, ${c.foreignKeys} foreign keys` +
    (c.columns === undefined ? '' : `, ${c.columns} added column`);
  console.log(report('source  ', result.sourceCounts));
  console.log(report('baseline', result.baselineCounts));
  console.log(report('delta   ', result.deltaCounts));
  console.log(`wrote ${path.relative(BACKEND_ROOT, path.resolve(outBaseline))} sha256 ${sha256(result.baselineText)}`);
  console.log(`wrote ${path.relative(BACKEND_ROOT, path.resolve(outDelta))} sha256 ${sha256(result.deltaText)}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('derive-live-baseline.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
