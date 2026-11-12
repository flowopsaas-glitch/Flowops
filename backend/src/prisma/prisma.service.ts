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
   * policy bound to that setting (migration `20261012210000_rls_tenant_isolation`),
   * so within this scope the DATABASE refuses cross-tenant rows — defence in
   * depth beneath the app-level filters.
   *
   * Use it on the most sensitive paths (device-facing ingest, cross-tenant
   * lookups that resolve an external identity to a tenant). It composes with
   * outbox writes: pass the `tx` through so everything stays one transaction.
   *
   * FAILS CLOSED ON AN EMPTY TENANT ID — the reason is worth reading.
   *
   * The policy is `app_tenant_guard("companyId")`, and `app_tenant()` is
   * `NULLIF(current_setting('app.company_id', true), '')`. So an empty string
   * makes `app_tenant()` NULL, which lands on the guard's second branch:
   *
   *     app_tenant() IS NULL AND NOT rls_strict IN ('on','true','1')
   *
   * Under Phase 1 that is TRUE for every row — the policy steps aside and the
   * database stops isolating anything. `withTenant('', ...)` therefore did not
   * fail, did not warn, and silently disabled the very protection it is the
   * only entry point for. Worse, `scripts/tenant-context-coverage.mjs` counts
   * operations by their position inside a `withTenant(` call span, so the
   * scanner still reported them as `contextualised`: the audit would say a path
   * was protected on the strength of a call that established no tenant at all.
   *
   * That is the failure mode this guard exists to prevent: not a leak, but
   * going blind while believing you are covered.
   *
   * WHY IT DOES NOT TRIM THE VALUE IT ACCEPTS
   *
   * `set_config` is given the id verbatim. Trimming here would set a context
   * that no longer matches the `where: { companyId }` the caller passes to its
   * own queries, and every row would be filtered out by RLS — a silent
   * empty-result bug, from a "helpful" normalisation. Whitespace-only is
   * rejected below instead, so it surfaces as an error rather than as nothing.
   * (Left untrimmed it would also fail closed, since no row equals '   ' — but
   * an error names the problem and an empty result set does not.)
   */
  async withTenant<T>(
    companyId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    if (typeof companyId !== 'string' || companyId.trim() === '') {
      // A security primitive that cannot establish the tenant must refuse to
      // run, never proceed with isolation switched off.
      throw new Error(
        `withTenant requires a non-empty companyId, received ${JSON.stringify(companyId)}. ` +
          'An empty tenant id leaves app.company_id unset, which makes the RLS policy ' +
          'step aside — every tenant\'s rows become visible, and the coverage audit ' +
          'still reports the call as protected.',
      );
    }
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    }, options);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
    await this.warnIfRlsIsInert();
  }

  /**
   * Say out loud when row-level security is present but not in force.
   *
   * PostgreSQL exempts superusers — and roles with BYPASSRLS — from RLS
   * entirely. `FORCE ROW LEVEL SECURITY` binds the table owner; it does not bind
   * a superuser. So a deployment that connects as `POSTGRES_USER` on the
   * official image has every policy in
   * `20261012210000_rls_tenant_isolation` installed, correct, and never
   * consulted: `withTenant()` sets `app.company_id`, and nothing reads it.
   *
   * That is silent. The coverage audit still reports how much of the codebase
   * calls `withTenant`, which makes the deployment look protected when the
   * database is not isolating anything. Failing closed here would take the API
   * down over a configuration issue, so this warns instead — but warns in the
   * startup log, where someone deploying will see it, rather than in a document
   * nobody reads.
   *
   * Never throws: a startup probe must not be able to stop the API booting.
   */
  private async warnIfRlsIsInert(): Promise<void> {
    try {
      const rows = await this.$queryRawUnsafe<Array<{ is_superuser: string; has_bypassrls: string }>>(
        `SELECT current_setting('is_superuser') AS is_superuser,
                (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user)::text AS has_bypassrls`,
      );
      const row = rows?.[0];

      // A row that is missing, or whose answers are not the two shapes this
      // asks for, means "not determined" — which must be reported, not treated
      // as a clean bill of health. Silence here reads as "checked, it's fine".
      if (!row || !['on', 'off'].includes(row.is_superuser) || !['true', 'false'].includes(row.has_bypassrls)) {
        this.logger.warn(
          'Could not determine whether row-level security is in force; treating it as ' +
            'unknown rather than safe. If this connection is a superuser or holds ' +
            'BYPASSRLS, every tenant isolation policy is installed but bypassed. ' +
            'See docs/RLS-PHASE2-READINESS-2026-11-12.md.',
        );
        return;
      }

      const bypasses = row.is_superuser === 'on' || row.has_bypassrls === 'true';
      if (!bypasses) return;

      this.logger.warn(
        `Connected as "${row.is_superuser === 'on' ? 'a superuser' : 'a BYPASSRLS role'}" — ` +
          'row-level security is NOT in force on this connection. Every tenant isolation ' +
          'policy is installed but being bypassed, so withTenant() sets app.company_id that ' +
          'nothing reads, and cross-tenant isolation rests on application filters alone. ' +
          'Point DATABASE_URL at a role that is neither a superuser nor BYPASSRLS. ' +
          'See docs/RLS-PHASE2-READINESS-2026-11-12.md.',
      );
    } catch (e) {
      // A probe that cannot run must not stop the boot, and must not pretend the
      // answer was "fine" either — say what happened and move on.
      this.logger.warn(
        `Could not determine whether RLS is in force (${(e as Error)?.message ?? e}); ` +
          'treating it as unknown rather than safe.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
