#!/usr/bin/env node
/**
 * Offline Prisma schema validation.
 *
 * Why this exists
 * ---------------
 * `npx prisma validate` / `prisma generate` download engine binaries from
 * https://binaries.prisma.sh on first use. In locked-down build sandboxes that
 * host is unreachable, so the CLI fails *before* it ever parses the schema:
 *
 *   Error: request to https://binaries.prisma.sh/.../libquery_engine.so.node.gz.sha256
 *          failed, reason: Client network socket disconnected before secure TLS
 *          connection was established
 *
 * The schema parser Prisma uses for `validate` is `prisma-fmt`, which ships as a
 * WASM module and is published to npm as `@prisma/prisma-schema-wasm`. That
 * package needs no engine download, so schema syntax + semantic validation
 * (relations, ambiguous relations, missing back-relations, attribute arguments,
 * enum usage, native types, …) can still be verified offline.
 *
 * What this is NOT
 * ----------------
 * This is not a replacement for `prisma validate` / `prisma generate` in CI or
 * on a developer machine, and it does not validate migrations, generate a
 * client, or touch a database. Treat it as a syntax/semantic gate for
 * environments that cannot reach the Prisma engine CDN.
 *
 * Usage
 * -----
 *   node scripts/prisma-validate-offline.mjs [path/to/schema.prisma]
 *
 * Exits 0 when the schema is valid, 1 with the formatted Prisma error otherwise.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);

const schemaPath = path.resolve(process.argv[2] ?? 'prisma/schema.prisma');

function loadWasm() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@prisma/prisma-schema-wasm');
  } catch (err) {
    console.error(
      'Could not load @prisma/prisma-schema-wasm.\n' +
        'Install it as a dev dependency (version must match the `prisma` CLI, e.g. 5.22.0-44.<engine-commit>):\n' +
        '  npm i -D @prisma/prisma-schema-wasm@<matching-version>\n',
    );
    throw err;
  }
}

function stripAnsi(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

const wasm = loadWasm();
const schema = readFileSync(schemaPath, 'utf8');

try {
  wasm.validate(JSON.stringify({ prismaSchema: schema }));
} catch (err) {
  let payload = err?.message ?? String(err);
  try {
    const parsed = JSON.parse(payload);
    payload = parsed.message ?? payload;
  } catch {
    /* error was not a JSON payload — print as-is */
  }

  console.error(`✗ ${path.relative(process.cwd(), schemaPath)} is NOT valid:\n`);
  console.error(stripAnsi(payload));
  process.exit(1);
}

console.log(`✓ ${path.relative(process.cwd(), schemaPath)} is valid (offline prisma-fmt WASM validation)`);
