import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  /**
   * Run `fn` inside a transaction with the tenant context established:
   * `SET LOCAL 'app.company_id'`. Every table with a companyId carries an RLS
   * policy bound to that setting (migration `20261012150000_rls_tenant_isolation`),
   * so within this scope the DATABASE refuses cross-tenant rows — defence in
   * depth beneath the app-level filters.
   *
   * Use it on the most sensitive paths (device-facing ingest, cross-tenant
   * lookups that resolve an external identity to a tenant). It composes with
   * outbox writes: pass the `tx` through so everything stays one transaction.
   */
  async withTenant<T>(
    companyId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    }, options);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
