/**
 * Prisma client for the database-backed integration suite.
 *
 * Two engines can serve these tests, and the suite always prefers the one the
 * application actually runs:
 *
 *   1. the generated native library engine (`libquery_engine-*.node`) — what
 *      CI and production use. `prisma generate` produces it whenever the engine
 *      binaries can be downloaded.
 *   2. the WebAssembly query engine driven through `@prisma/adapter-pg` — used
 *      only when no native engine is present (locked-down or offline
 *      workstations, where `binaries.prisma.sh` is unreachable). The wasm
 *      engine ships inside `@prisma/client`, so the *same* generated client and
 *      the *same* Prisma query semantics apply; only the engine transport
 *      differs. `support/wasm-runtime-shim.ts` supplies the module loader that
 *      Node needs and bundlers normally provide.
 *
 * Both paths talk to a real PostgreSQL over a real connection pool, which is
 * the point of this suite: row locks, unique-constraint races and cascades are
 * the things the in-memory unit-test double cannot prove.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { resolveIntegrationDatabaseUrl } from './env';

/** `<backend>/node_modules/.prisma/client` — where `prisma generate` writes. */
export const GENERATED_CLIENT_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'node_modules',
  '.prisma',
  'client',
);

export interface IntegrationDatabase {
  prisma: PrismaClient;
  /** Which engine transport this client is using — asserted by the suite. */
  engine: 'native' | 'wasm';
  shutdown: () => Promise<void>;
}

export function nativeEngineFile(): string | undefined {
  if (!fs.existsSync(GENERATED_CLIENT_DIR)) return undefined;
  return fs
    .readdirSync(GENERATED_CLIENT_DIR)
    .find((file) => /^libquery_engine-.*\.(node|so\.node|dylib\.node|dll\.node)$/.test(file));
}

export async function createIntegrationDatabase(): Promise<IntegrationDatabase> {
  const url = resolveIntegrationDatabaseUrl();

  if (nativeEngineFile()) {
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    return {
      prisma,
      engine: 'native',
      shutdown: () => prisma.$disconnect(),
    };
  }

  // ── Offline fallback: wasm query engine + node-postgres ────────────────────
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { PrismaPg } = require('@prisma/adapter-pg');
  const pg = require('pg');
  const wasmClient = require(path.join(GENERATED_CLIENT_DIR, 'wasm.js'));
  const PrismaClientWasm = wasmClient.PrismaClient;

  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const prisma = new PrismaClientWasm({ adapter: new PrismaPg(pool) }) as PrismaClient;

  return {
    prisma,
    engine: 'wasm',
    shutdown: async () => {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
