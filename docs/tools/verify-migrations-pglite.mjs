#!/usr/bin/env node
/**
 * Independent migration check on a REAL PostgreSQL engine (PGlite — Postgres compiled to WASM, in-process, no server).
 *
 *   1. applies every `backend/prisma/migrations/<name>/migration.sql`, in order, to an empty database;
 *   2. compares the resulting catalog with the Prisma datamodel — tables, columns, types, nullability, defaults,
 *      enum labels, primary keys, unique constraints and @@index lists;
 *   3. prints the object counts (tables | enums | indexes | foreign keys) after each migration, with the same SQL as
 *      `deploy/live-migration-adoption.sh`, so they can be compared with the live database.
 *
 * WHY IT EXISTS. `prisma migrate diff` needs Prisma's schema engine, which cannot always be downloaded (the authoring
 * sandbox of the RASA release could not). This is NOT a replacement for CI's drift guard, which uses the real engine and
 * remains the authority; it is a second, independent witness that the committed SQL builds the schema in schema.prisma.
 * It is able to fail: a dropped index, a changed column type and an extra column were each reported when tried.
 *
 * Two rules mirror Prisma's own DDL (checked against the baseline migration the real engine wrote): a scalar list
 * (`String[]`) is a NULLABLE array, and numeric defaults compare as numbers (`DEFAULT 2.50` is `2.5`).
 *
 * USAGE (from the repository root):
 *   mkdir -p /tmp/pglite && (cd /tmp/pglite && npm init -y >/dev/null && npm i @electric-sql/pglite)
 *   cd backend && npx prisma generate            # needs the generated client (engines may be placeholders; types only)
 *   PGLITE_MODULE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node ../docs/tools/verify-migrations-pglite.mjs
 * Exit code 0 = no differences; 1 = a migration failed to apply or the catalog differs from the datamodel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const backend = process.cwd().endsWith('backend') ? process.cwd() : path.join(process.cwd(), 'backend');
const require = createRequire(path.join(backend, 'package.json'));
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const { Prisma } = require('@prisma/client');
const dm = Prisma.dmmf.datamodel;
const schemaText = fs.readFileSync(path.join(backend, 'prisma/schema.prisma'), 'utf8');

const COUNTS = `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_prisma_migrations') || '|' ||
  (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname='public') || '|' ||
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations') || '|' ||
  (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE c.contype='f' AND n.nspname='public') AS c`;

// ── 1. apply every migration, in order ─────────────────────────────────────────────────────────────
const migDir = path.join(backend, 'prisma/migrations');
const migrations = fs.readdirSync(migDir).filter((d) => fs.existsSync(path.join(migDir, d, 'migration.sql'))).sort();
const db = new PGlite();
const q = async (sql) => (await db.query(sql)).rows;
const progression = [];
for (const m of migrations) {
  try {
    await db.exec(fs.readFileSync(path.join(migDir, m, 'migration.sql'), 'utf8'));
  } catch (e) {
    console.error(`✗ migration ${m} FAILED to apply: ${e.message}`);
    process.exit(1);
  }
  progression.push([m, (await q(COUNTS))[0].c]);
}
console.log(`✓ applied ${migrations.length} migrations in order`);

// ── 2. compare the catalog with the datamodel ──────────────────────────────────────────────────────
const cols = await q(`select table_name, column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema='public'`);
const colMap = new Map(cols.map((c) => [`${c.table_name}.${c.column_name}`, c]));
const tablesInDb = new Set((await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).map((r) => r.table_name));
const enumsInDb = new Map();
for (const r of await q(`select t.typname, e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid order by t.typname, e.enumsortorder`)) enumsInDb.set(r.typname, [...(enumsInDb.get(r.typname) ?? []), r.enumlabel]);
const idxByTable = new Map();
for (const r of await q(`select tablename, indexname, indexdef from pg_indexes where schemaname='public'`)) {
  const m = /\((.*)\)\s*$/.exec(r.indexdef.replace(/\s+WHERE .*$/, ''));
  idxByTable.set(r.tablename, [...(idxByTable.get(r.tablename) ?? []), {
    name: r.indexname, unique: /CREATE UNIQUE INDEX/.test(r.indexdef), cols: (m ? m[1] : '').split(',').map((s) => s.trim().replace(/"/g, '')),
  }]);
}

const problems = [];
const bad = (m) => problems.push(m);
const PG_TYPE = { String: ['text'], Int: ['integer'], Float: ['double precision'], Boolean: ['boolean'], DateTime: ['timestamp without time zone'], Json: ['jsonb'], Decimal: ['numeric'], BigInt: ['bigint'], Bytes: ['bytea'] };
const normDefault = (d) => (d == null ? null : String(d).replace(/::[a-z" ]+(\[\])?/gi, '').replace(/^'|'$/g, '').replace(/^\(|\)$/g, ''));

for (const e of dm.enums) {
  const want = e.values.map((v) => v.dbName ?? v.name);
  const have = enumsInDb.get(e.dbName ?? e.name);
  if (!have) bad(`enum ${e.name}: missing in the database`);
  else if (JSON.stringify(want) !== JSON.stringify(have)) bad(`enum ${e.name}: labels differ — schema [${want}] vs db [${have}]`);
}
const wantedEnums = new Set(dm.enums.map((e) => e.dbName ?? e.name));
for (const n of enumsInDb.keys()) if (!wantedEnums.has(n)) bad(`enum ${n}: in the database but not in the schema`);

let columnsChecked = 0;
for (const m of dm.models) {
  const table = m.dbName ?? m.name;
  if (!tablesInDb.has(table)) { bad(`model ${m.name}: table ${table} missing`); continue; }
  const expected = new Set();
  for (const f of m.fields) {
    if (f.kind === 'object') continue;
    const col = f.dbName ?? f.name;
    expected.add(col);
    columnsChecked += 1;
    const c = colMap.get(`${table}.${col}`);
    if (!c) { bad(`${table}.${col}: column missing`); continue; }
    if (f.kind === 'enum') {
      if (f.isList) { if (c.data_type !== 'ARRAY') bad(`${table}.${col}: expected an enum array, got ${c.data_type}`); }
      else if (c.data_type !== 'USER-DEFINED' || c.udt_name !== f.type) bad(`${table}.${col}: expected enum ${f.type}, got ${c.data_type}/${c.udt_name}`);
    } else if (f.isList) {
      if (c.data_type !== 'ARRAY') bad(`${table}.${col}: expected an array, got ${c.data_type}`);
    } else {
      const nt = f.nativeType?.[0];
      const want = nt === 'VarChar' ? ['character varying'] : nt === 'Text' ? ['text'] : PG_TYPE[f.type];
      if (!want) bad(`${table}.${col}: no mapping for Prisma type ${f.type}`);
      else if (!want.includes(c.data_type)) bad(`${table}.${col}: expected ${want.join('|')}, got ${c.data_type}`);
    }
    if (!f.isList && (c.is_nullable === 'YES') !== !f.isRequired) bad(`${table}.${col}: nullable should be ${!f.isRequired}, db says ${c.is_nullable}`);
    const def = f.default;
    if (f.hasDefaultValue && def !== undefined && !f.isList) {
      if (typeof def === 'object' && def !== null && 'name' in def) {
        if (def.name === 'now' && !/CURRENT_TIMESTAMP|now\(\)/i.test(c.column_default ?? '')) bad(`${table}.${col}: default now() missing (db: ${c.column_default})`);
        if (['cuid', 'uuid'].includes(def.name) && c.column_default != null) bad(`${table}.${col}: ${def.name}() is client-side but the db has default ${c.column_default}`);
        if (def.name === 'autoincrement' && !/nextval/.test(c.column_default ?? '')) bad(`${table}.${col}: autoincrement default missing`);
      } else {
        const want = String(def);
        const have = normDefault(c.column_default);
        const num = (x) => (x != null && x !== '' && !Number.isNaN(Number(x)) ? Number(x) : null);
        const same = num(want) !== null && num(have) !== null ? num(want) === num(have) : have === want;
        if (!same) bad(`${table}.${col}: default should be ${want}, db has ${c.column_default}`);
      }
    } else if ((f.isUpdatedAt || (!f.hasDefaultValue && !f.isList)) && c.column_default != null && !f.isId) {
      bad(`${table}.${col}: unexpected default ${c.column_default}`);
    }
    if (f.hasDefaultValue && f.isList && f.default !== undefined && !/'\{\}'|ARRAY\[\]/.test(c.column_default ?? '')) bad(`${table}.${col}: list default [] missing (db: ${c.column_default})`);
  }
  for (const [k, c] of colMap) if (k.startsWith(`${table}.`) && !expected.has(c.column_name)) bad(`${table}.${c.column_name}: column in the database but not in the schema`);

  const have = idxByTable.get(table) ?? [];
  const find = (cs, unique) => have.some((i) => i.unique === unique && JSON.stringify(i.cols) === JSON.stringify(cs));
  const pk = m.primaryKey?.fields ?? m.fields.filter((f) => f.isId).map((f) => f.name);
  if (pk.length && !have.some((i) => i.name === `${table}_pkey`)) bad(`${table}: primary key missing`);
  for (const f of m.fields) if (f.isUnique && !f.isId && !find([f.dbName ?? f.name], true)) bad(`${table}: unique index on ${f.name} missing`);
  for (const u of m.uniqueFields ?? []) if (!find(u, true)) bad(`${table}: @@unique([${u}]) missing`);
  const block = new RegExp(`model\\s+${m.name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(schemaText)?.[1] ?? '';
  for (const mm of block.matchAll(/@@index\(\[([^\]]+)\]/g)) {
    const cs = mm[1].split(',').map((x) => x.trim().replace(/\(.*\)$/, ''));
    if (!find(cs, false)) bad(`${table}: @@index([${cs}]) missing`);
  }
}
const wantedTables = new Set(dm.models.map((m) => m.dbName ?? m.name));
for (const t of tablesInDb) if (!wantedTables.has(t) && t !== '_prisma_migrations') bad(`table ${t}: in the database but not in the schema`);

console.log(`✓ compared ${dm.models.length} models / ${columnsChecked} columns / ${dm.enums.length} enums against the catalog (${tablesInDb.size} tables)`);

// ── 3. object counts after each migration (tables | enums | indexes | foreign keys) ────────────────
console.log('\nobject counts after each migration (tables|enums|indexes|FKs):');
let prev = null;
for (const [m, c] of progression) {
  const n = c.split('|').map(Number);
  console.log(`  ${m}\n      ${c}${prev ? `   (+${n[0] - prev[0]} tables, +${n[1] - prev[1]} enums, +${n[2] - prev[2]} indexes, +${n[3] - prev[3]} FKs)` : ''}`);
  prev = n;
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} difference(s):\n  - ${problems.slice(0, 60).join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✓ 0 differences — the migrations build exactly the schema in schema.prisma');
