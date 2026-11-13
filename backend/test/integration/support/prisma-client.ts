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

import { Prisma, PrismaClient } from '@prisma/client';
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
  prisma: TenantAwarePrismaClient;
  /** Which engine transport this client is using — asserted by the suite. */
  engine: 'native' | 'wasm';
  shutdown: () => Promise<void>;
}

/**
 * A `PrismaClient` that also carries `withTenant`.
 *
 * Services are written against `PrismaService` — that is what Nest injects at
 * runtime — but this suite constructs them by hand and passes a bare
 * `PrismaClient` cast to `PrismaService`. The cast is only sound if the client
 * also has the one method `PrismaService` adds that services actually call:
 * `withTenant`.
 *
 * Without it, a service that establishes tenant context works in production
 * and dies here with `withTenant is not a function`. That failure mode is
 * worse than an inconvenience: it exerts quiet pressure to leave services
 * unwrapped so they stay testable — the harness arguing against the very
 * isolation it is meant to verify. So the double supplies the method, and
 * `withTenantContext` below implements it the same way the real service does.
 */
export type TenantAwarePrismaClient = PrismaClient & {
  withTenant<T>(
    companyId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

/**
 * Mirror of `PrismaService.withTenant`, including the empty-tenant guard.
 *
 * Deliberately a faithful copy rather than a stub that just delegates to
 * `$transaction`: the point of this suite is that the database decides. The
 * guard is copied too, because a service that passes an empty tenant must
 * fail here exactly as it fails in production.
 */
export function withTenantContext<TClient extends PrismaClient>(
  prisma: TClient,
): TClient & TenantAwarePrismaClient {
  const client = prisma as TClient & TenantAwarePrismaClient;
  if (typeof client.withTenant === 'function') return client;

  client.withTenant = async function withTenant<T>(
    companyId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    if (typeof companyId !== 'string' || companyId.trim() === '') {
      throw new Error(
        `withTenant requires a non-empty companyId, received ${JSON.stringify(companyId)}. ` +
          'An empty tenant id leaves app.company_id unset, which makes the RLS policy ' +
          "step aside — every tenant's rows become visible.",
      );
    }
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx as Prisma.TransactionClient);
    }, options);
  };

  return client;
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
    const prisma = withTenantContext(new PrismaClient({ datasources: { db: { url } } }));
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
  const prisma = withTenantContext(
    new PrismaClientWasm({ adapter: new PrismaPg(pool) }) as PrismaClient,
  );

  return {
    prisma,
    engine: 'wasm',
    shutdown: async () => {
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
