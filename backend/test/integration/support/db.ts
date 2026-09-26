/**
 * Database helpers for the integration suite: wipe between cases, and seed the
 * minimum a tenant needs.
 */

import { PrismaClient } from '@prisma/client';

/**
 * Truncate every table in `public` except Prisma's migration bookkeeping.
 *
 * The table list is read from the catalog rather than hard-coded, so a new
 * model cannot silently escape the wipe and leak state into the next test.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (rows.length === 0) {
    throw new Error(
      'The integration database has no tables. Apply the schema first — in CI that is ' +
        '`npx prisma db push`, locally `prisma db push` or the DDL artifact from CI ' +
        '(scripts/ephemeral-db.mjs sql <file>).',
    );
  }

  const quoted = rows.map((r) => `"public"."${r.tablename.replace(/"/g, '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

export interface SeededTenant {
  companyId: string;
  companyName: string;
}

/** Create a tenant. Everything else in the suite hangs off this. */
export async function seedTenant(
  prisma: PrismaClient,
  name = 'Integration Tenant',
): Promise<SeededTenant> {
  const company = await prisma.company.create({ data: { name } });
  return { companyId: company.id, companyName: company.name };
}

/** Count rows in a table through raw SQL — used where a model read would hide a problem. */
export async function countRows(
  prisma: PrismaClient,
  table: string,
  where = '',
  params: unknown[] = [],
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count(*)::bigint AS count FROM "${table}" ${where}`,
    ...params,
  );
  return Number(rows[0]?.count ?? 0);
}
