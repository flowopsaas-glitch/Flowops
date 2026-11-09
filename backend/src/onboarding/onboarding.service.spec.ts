import { OnboardingService } from './onboarding.service';

/**
 * Tenant defaults provisioning.
 *
 * The properties that matter here are the ones that make provisioning safe to
 * retry. Provisioning runs right after an approval, and a re-run has to be
 * harmless — it is the obvious first thing support does when a tenant reports
 * missing costing numbers, and a deploy can interrupt the first attempt.
 *
 * So every test below runs the work at least twice on purpose.
 */

type Store = {
  commercialConfig: Map<string, any>;
  skuSequence: Map<string, any>;
  withTenantCalls: string[];
};

function makeHarness(existing: { commercialConfig?: any; skuSequence?: any } = {}) {
  const db: Store = {
    commercialConfig: new Map(),
    skuSequence: new Map(),
    withTenantCalls: [],
  };
  if (existing.commercialConfig) db.commercialConfig.set(existing.commercialConfig.companyId, { ...existing.commercialConfig });
  if (existing.skuSequence) db.skuSequence.set(existing.skuSequence.companyId, { ...existing.skuSequence });

  const upsert = (map: Map<string, any>) => async ({ where, create, update }: any) => {
    const row = map.get(where.companyId);
    if (row) {
      // Never overwrite what a tenant has already tuned.
      Object.assign(row, update ?? {});
      return row;
    }
    const made = { id: `${where.companyId}-row`, ...create };
    map.set(where.companyId, made);
    return made;
  };

  const findUnique = (map: Map<string, any>) => async ({ where }: any) => map.get(where.companyId) ?? null;

  const tx = {
    commercialConfig: { upsert: jest.fn(upsert(db.commercialConfig)), findUnique: jest.fn(findUnique(db.commercialConfig)) },
    skuSequence: { upsert: jest.fn(upsert(db.skuSequence)), findUnique: jest.fn(findUnique(db.skuSequence)) },
  };

  const prisma: any = {
    withTenant: jest.fn(async (companyId: string, fn: (t: any) => Promise<any>) => {
      db.withTenantCalls.push(companyId);
      return fn(tx);
    }),
  };

  return { prisma, db, service: new OnboardingService(prisma) };
}

const COMPANY = 'co-new';

describe('OnboardingService.provisionDefaults', () => {
  it('creates both default rows for a brand-new tenant', async () => {
    const { db, service } = makeHarness();

    const result = await service.provisionDefaults(COMPANY);

    expect(result).toEqual({ commercialConfig: true, skuSequence: true });
    expect(db.commercialConfig.has(COMPANY)).toBe(true);
    expect(db.skuSequence.has(COMPANY)).toBe(true);
  });

  it('is idempotent — a second run changes nothing', async () => {
    const { db, service } = makeHarness();

    await service.provisionDefaults(COMPANY);
    const first = { ...db.commercialConfig.get(COMPANY) };

    await service.provisionDefaults(COMPANY);
    const second = { ...db.commercialConfig.get(COMPANY) };

    expect(second).toEqual(first);
    expect(db.commercialConfig.size).toBe(1);
    expect(db.skuSequence.size).toBe(1);
  });

  it('never overwrites a tenant that has tuned its own numbers', async () => {
    // The whole point of `update: {}` — support re-running provisioning must
    // not reset a client's carefully set costing model back to defaults.
    const { db, service } = makeHarness({
      commercialConfig: { companyId: COMPANY, fuelCostPerKm: 9.99, targetMarginPct: 51 },
    });

    await service.provisionDefaults(COMPANY);

    const row = db.commercialConfig.get(COMPANY);
    expect(row.fuelCostPerKm).toBe(9.99);
    expect(row.targetMarginPct).toBe(51);
  });

  it('provisions only the tenant it was given', async () => {
    const { db, service } = makeHarness();

    await service.provisionDefaults(COMPANY);
    await service.provisionDefaults('co-other');

    expect([...db.commercialConfig.keys()].sort()).toEqual(['co-new', 'co-other']);
  });

  it('runs inside withTenant, so RLS covers these writes', async () => {
    const { db, service } = makeHarness();

    await service.provisionDefaults(COMPANY);

    // The tenant-context coverage gate counts these operations as protected
    // only because the companyId is set for the transaction.
    expect(db.withTenantCalls).toEqual([COMPANY]);
  });
});

describe('OnboardingService.provisionDefaultsSafely', () => {
  it('reports success without throwing', async () => {
    const { service } = makeHarness();
    await expect(service.provisionDefaultsSafely(COMPANY)).resolves.toBe(true);
  });

  it('swallows a failure and reports false, so approval still succeeds', async () => {
    // A tenant without defaults is an inconvenience. A lost approval is a lost
    // client. So a database hiccup here must not fail the approval.
    const { prisma, service } = makeHarness();
    prisma.withTenant.mockRejectedValueOnce(new Error('connection reset'));

    await expect(service.provisionDefaultsSafely(COMPANY)).resolves.toBe(false);
  });
});
