#!/usr/bin/env node
/**
 * Validate prisma/schema.prisma with Prisma's own WASM schema engine.
 *
 * `npm run prisma:stub` parses the schema with REGEX to build a local client
 * stub — it deliberately does not validate, because it runs before the query
 * engine exists. That means a malformed schema sails through every local check
 * (`tsc`, jest, the stub) and only fails in CI, at `prisma generate`, several
 * minutes later.
 *
 * This script closes that gap: the WASM schema engine needs no network and no
 * query engine, so it can validate locally and offline — the same parser
 * `prisma generate` starts from. Run it before committing a schema change.
 *
 * Caught in the wild: Prisma supports only `//` and `///` comments. A single
 * `/* *\/` block comment — valid in TypeScript, and therefore invisible to
 * every other check in the repo — failed both the Backend and Schema SQL CI
 * jobs with P1012.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as wasm from '@prisma/prisma-schema-wasm';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'prisma', 'schema.prisma');
const migrationsDir = join(here, '..', 'prisma', 'migrations');
const schema = readFileSync(schemaPath, 'utf8');

// validate() takes a JSON *string*, not an object — passing an object crashes
// the WASM module with "memory access out of bounds" instead of reporting an
// error, which is its own small trap.
const params = JSON.stringify({ prismaSchema: schema, noColor: true, maxWidth: 100 });

let message;
try {
  wasm.validate(params);
} catch (e) {
  // The thrown value is an Error whose message holds the JSON diagnostics.
  message = String(e?.message ?? e);
}

/**
 * Postgres caps identifiers at 63 bytes and silently truncates on creation,
 * while Prisma truncates differently (it keeps the _idx / _key suffix). So a
 * migration that spells a long generated name out in full no longer reconstructs
 * the schema, and only the CI drift guard notices. Flag it here instead.
 */
const POSTGRES_MAX_IDENTIFIER = 63;
function overlongIdentifiers() {
  if (!existsSync(migrationsDir)) return [];
  const found = [];
  for (const dir of readdirSync(migrationsDir).sort()) {
    const file = join(migrationsDir, dir, 'migration.sql');
    if (!existsSync(file)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/"([^"]{64,})"/g)) {
        found.push(`${dir}/migration.sql:${i + 1}  ${m[1]}  (${m[1].length} chars)`);
      }
    });
  }
  return found;
}

// Advisory, not fatal: an over-long name is fine as long as the schema pins the
// truncated form with `map:` (see terminal_truck_window_changes). Only the CI
// drift guard can confirm the two actually agree, so warn and carry on.
const tooLong = overlongIdentifiers();
if (tooLong.length) {
  console.warn(`\nWarning: identifiers longer than ${POSTGRES_MAX_IDENTIFIER} bytes:`);
  for (const f of tooLong) console.warn(`  ${f}`);
  console.warn(
    'Postgres truncates these on creation and Prisma truncates differently.\n' +
    'If the schema does not pin the truncated name with `map:`, the drift guard\n' +
    'will reject the migrations. Prefer pinning a short name in both places.\n'
  );
}

if (!message) {
  console.log('prisma/schema.prisma is valid (Prisma WASM schema engine).');
  process.exit(0);
}

// The message is a JSON envelope: { error_code, message }. Print the inner
// diagnostics so the offending lines are readable in a terminal.
let body = message;
try {
  const parsed = JSON.parse(message);
  if (parsed?.message) body = parsed.message;
  if (parsed?.error_code) console.error(`\nPrisma schema invalid [${parsed.error_code}]\n`);
} catch {
  console.error('\nPrisma schema invalid\n');
}
console.error(body);
process.exit(1);
