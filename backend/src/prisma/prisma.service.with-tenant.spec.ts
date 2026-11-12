/**
 * `PrismaService.withTenant` — the only entry point to database-enforced tenant
 * isolation.
 *
 * The hazard this file exists to pin is not a leak, it is going blind while
 * believing you are covered. The RLS policy is:
 *
 *     app_tenant_guard("companyId") =
 *         "companyId" = app_tenant()
 *      OR (app_tenant() IS NULL AND NOT rls_strict IN ('on','true','1'))
 *
 * and `app_tenant()` is `NULLIF(current_setting('app.company_id', true), '')`.
 * An empty tenant id therefore lands on the second branch, which under Phase 1
 * is TRUE for every row: the policy steps aside and the database stops
 * isolating anything. Before this guard, `withTenant('', ...)` did not throw,
 * did not warn, and disabled the protection it is the sole entry point for —
 * while `scripts/tenant-context-coverage.mjs` still counted the operations
 * inside it as `contextualised`.
 */
import { PrismaService } from './prisma.service';

/**
 * The service extends PrismaClient, whose constructor connects. Stub the
 * lifecycle hooks and capture what the transaction would have executed, so
 * these tests assert on behaviour without a database.
 */
function harness() {
  const executed: Array<{ companyId: unknown; fn: unknown; options?: unknown }> = [];

  const service = Object.create(PrismaService.prototype) as PrismaService & {
    $transaction: (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>;
  };

  Object.defineProperty(service, 'logger', {
    value: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });

  service.$transaction = (async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
    const tx = {
      $executeRaw: async (strings: TemplateStringsArray, companyId: unknown) => {
        executed.push({ companyId, fn: String(strings[0]) });
        return 1;
      },
    };
    void options;
    return fn(tx);
  }) as unknown as typeof service.$transaction;

  return { service, executed };
}

describe('withTenant', () => {
  it('sets app.company_id for the duration of the callback', async () => {
    const { service, executed } = harness();
    const result = await service.withTenant('acme', async () => 'done');

    expect(result).toEqual('done');
    expect(executed).toHaveLength(1);
    expect(executed[0].companyId).toEqual('acme');
    // is_local = true: the setting is transaction-scoped and cannot leak to the
    // next request that borrows this connection from the pool.
    expect(executed[0].fn).toContain("set_config('app.company_id'");
  });

  it('runs the callback with the transaction client', async () => {
    const { service } = harness();
    const seen: unknown[] = [];
    await service.withTenant('acme', async (tx) => {
      seen.push(tx);
    });
    expect(seen).toHaveLength(1);
    expect(typeof (seen[0] as { $executeRaw: unknown }).$executeRaw).toEqual('function');
  });

  it('forwards transaction options', async () => {
    let received: unknown;
    const svc = Object.create(PrismaService.prototype) as PrismaService & {
      $transaction: (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => Promise<unknown>;
    };
    Object.defineProperty(svc, 'logger', { value: { log: () => undefined } });
    svc.$transaction = (async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
      received = options;
      return fn({ $executeRaw: async () => 1 });
    }) as unknown as typeof svc.$transaction;
    await svc.withTenant('acme', async () => null, { timeout: 15_000 });
    expect(received).toEqual({ timeout: 15_000 });
  });

  // ── The failure that used to be silent ─────────────────────────────────────

  it.each([
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['a whitespace-only string', '   '],
    ['a number', 42],
  ])('refuses to run with %s, which would silently disable RLS', async (_label, bad) => {
    const { service, executed } = harness();
    await expect(service.withTenant(bad as unknown as string, async () => 'done')).rejects.toThrow(
      /non-empty companyId/,
    );
    // Crucially it must not have opened a transaction or run the callback.
    expect(executed).toHaveLength(0);
  });

  it('names the consequence in the error, so the next reader understands the stakes', async () => {
    const { service } = harness();
    await expect(service.withTenant('', async () => 'done')).rejects.toThrow(/RLS policy/);
    await expect(service.withTenant('', async () => 'done')).rejects.toThrow(
      /still reports the call as protected/,
    );
  });

  it('passes the id through verbatim rather than trimming it', async () => {
    // Trimming would be a "helpful" normalisation with a nasty failure mode:
    // set_config would receive 'acme' while the caller's own queries filter on
    // 'where: { companyId: " acme " }', so RLS and the WHERE clause would
    // disagree and every row would be hidden. The bug would present as missing
    // data, which is far harder to trace than a wrong-looking id.
    //
    // A padded id still fails closed — no row's companyId equals ' acme ' — so
    // passing it through is safe; it is merely not silently repaired.
    const { service, executed } = harness();
    await service.withTenant(' acme ', async () => null);
    expect(executed[0].companyId).toEqual(' acme ');
  });

  it('rejects a whitespace-only id, which carries no tenant at all', async () => {
    // Distinct from the case above: this is not a malformed id, it is the
    // absence of one, and it must not reach set_config.
    const { service } = harness();
    await expect(service.withTenant('   ', async () => null)).rejects.toThrow(/non-empty/);
  });
});
