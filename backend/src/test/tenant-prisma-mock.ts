/**
 * TEST HELPER — give a hand-rolled Prisma mock a working `withTenant`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `PrismaService.withTenant(companyId, fn)` sets `app.company_id` and then hands `fn` a
 * transaction client. It is how production code asks Postgres to enforce tenant
 * isolation (RLS). Most older specs build their Prisma mock as a bare object literal
 * with a `$transaction` and no `withTenant`, so the moment a service is converted to
 * `withTenant` those specs die with "withTenant is not a function".
 *
 * This helper adds a faithful `withTenant` to any such mock, and — more importantly —
 * RECORDS the tenant context it was called with, so a spec can assert that RLS was
 * actually engaged rather than merely assuming it.
 *
 * IT IS DELIBERATELY NOT A SILENT SHIM
 * ------------------------------------
 * A helper that made `withTenant` transparently alias `$transaction` would let a spec
 * pass while proving nothing about tenancy. So `tenantContext()` returns the last
 * company id the service bound, and `expectTenant()` fails loudly if the service never
 * entered a tenant context at all. A converted service must be seen to bind its tenant.
 *
 * @see backend/docs/TENANT_CONTEXT.md
 */

/** The recorded state of the most recent `withTenant` call. */
export interface TenantContextLog {
  /** Ordered list of company ids passed to `withTenant`. */
  companies: string[];
  /** How many times `withTenant` was entered. */
  calls: number;
}

/**
 * Attach `withTenant` to an existing mock.
 *
 * @param prisma  The mock object (mutated in place, also returned for chaining).
 * @param tx      The transaction client to hand to the callback. REQUIRED.
 * @returns       A log object the spec can assert against.
 *
 * `tx` is deliberately REQUIRED rather than inferred from `prisma.$transaction`.
 * Inferring it means *calling* `$transaction` to capture the client, which silently
 * CONSUMES any `mockImplementationOnce` a test has queued — so the very next real
 * transaction in that test gets the wrong client and the spec fails for a reason that
 * has nothing to do with what it is testing. Hoist the tx object into a variable and
 * pass it; it costs one line and removes the trap.
 */
export function withTenantMock<T extends Record<string, any>>(
  prisma: T,
  tx: any,
  config: { delegate?: boolean } = {},
): TenantContextLog {
  if (tx === undefined && !config.delegate) {
    throw new Error(
      'withTenantMock requires an explicit tx client, or { delegate: true }. ' +
        'See the docs comment above: inferring the tx from $transaction consumes ' +
        'queued mockImplementationOnce entries.',
    );
  }
  const log: TenantContextLog = { companies: [], calls: 0 };

  (prisma as any).withTenant = jest.fn(
    async (
      companyId: string,
      callback: (client: any) => unknown,
      // PrismaService.withTenant takes { maxWait, timeout } and forwards them to
      // $transaction. Forward them here too, or a spec asserting on transaction
      // options silently tests nothing.
      opts?: { maxWait?: number; timeout?: number },
    ) => {
      log.calls += 1;
      log.companies.push(companyId);
      // `delegate: true` routes the callback through prisma.$transaction, so any
      // mockImplementationOnce a spec queued to model a specific transaction outcome
      // (a lost compare-and-set, a missing wallet, an insufficient balance) still
      // applies now that the service calls withTenant instead of $transaction.
      // It consumes exactly one queued implementation, which is correct: the service
      // is performing exactly one transaction.
      if (config.delegate) {
        return (prisma as any).$transaction(
          (client: any) => callback(delegatingTxClient({}, client ?? {}, prisma)),
          opts,
        );
      }
      return callback(tx);
    },
  );

  return log;
}

/**
 * Assert that the service really bound a tenant context.
 *
 * Fails — rather than silently passing — when `withTenant` was never called, so a
 * service that quietly regressed back to a bare `this.prisma.*` query is caught.
 */
export function expectTenant(log: TenantContextLog, companyId: string): void {
  if (log.calls === 0) {
    throw new Error(
      'Expected the service to run inside withTenant(), but withTenant was never called. ' +
        'Either the code path regressed to a bare this.prisma.* query, or the spec is ' +
        'asserting against the wrong mock.',
    );
  }
  for (const bound of log.companies) {
    if (bound !== companyId) {
      throw new Error(
        `Tenant context mismatch: withTenant was bound to ${JSON.stringify(bound)}, ` +
          `expected ${JSON.stringify(companyId)}. A cross-tenant context is a breach, ` +
          'not a warning.',
      );
    }
  }
}

/**
 * Build a transaction client that OVERRIDES only what a test cares about and
 * DELEGATES everything else to the outer Prisma mock.
 *
 * WHY
 * ---
 * Converting a service to `withTenant` moves its reads from `this.prisma.<model>`
 * onto `tx.<model>`. Existing specs mock the models on the outer client and often
 * override them per-test (e.g. "return null so the tenant check fails"). A hand-built
 * `tx` that only lists the models the service used to touch then explodes with
 * "tx.waybill.findFirst is not a function" — or worse, silently returns a canned value
 * and ignores the override, so the test passes without testing anything.
 *
 * This proxy prefers an explicitly-supplied mock and otherwise falls through to the
 * outer client, so per-test overrides keep working unchanged.
 *
 * Mock identity is preserved on the explicit side: `expect(tx.waybill.updateMany)`
 * still sees the same `jest.fn()` a spec installed.
 */
export function delegatingTxClient(
  explicit: Record<string, any>,
  ...fallbacks: Record<string, any>[]
): any {
  const cache = new Map<string | symbol, any>();

  return new Proxy(
    {},
    {
      get(_target, model: string | symbol) {
        if (typeof model !== 'string') return undefined;
        if (cache.has(model)) return cache.get(model);

        const modelName = model;
        const overrides = explicit[model] ?? {};

        // Model-level proxy: prefer the explicit mock for a method, else the outer one.
        const modelProxy: any = new Proxy(
          {},
          {
            get(_t, method: string | symbol) {
              if (typeof method !== 'string') return undefined;
              if (method in overrides) return (overrides as any)[method];
              // Walk the fallback chain for this method, not just the winning model.
              for (const source of fallbacks) {
                const model = source?.[modelName];
                if (!model) continue;
                const fn = model[method];
                if (fn !== undefined) {
                  // Bind so `this` inside the mock is its own model object.
                  return typeof fn === 'function' ? fn.bind(model) : fn;
                }
              }
              return undefined;
            },
            has(_t, method: string | symbol) {
              if (typeof method !== 'string') return false;
              if (method in overrides) return true;
              return fallbacks.some(
                (source) => source?.[modelName] && method in source[modelName],
              );
            },
          },
        );

        cache.set(model, modelProxy);
        return modelProxy;
      },
    },
  );
}
