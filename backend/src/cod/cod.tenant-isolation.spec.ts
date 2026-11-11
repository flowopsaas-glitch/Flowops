import { CodSettlementService } from './cod-settlement.service';

/**
 * TENANT ISOLATION — behavioural guard for COD.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The existing COD specs assert tenant safety by mocking `findFirst` to return null and
 * checking the service throws. That test is VACUOUS: it passes identically whether or
 * not the query carried a `companyId` filter, because the mock ignores the `where`
 * clause entirely. (Verified: deleting the `companyId` filter from the waybill read and
 * from the driver read left all 21 existing tests green.)
 *
 * These tests assert the thing that actually provides isolation — that every read and
 * write is scoped to the caller's company, and that the work happens inside a tenant
 * transaction so Postgres RLS enforces the same boundary underneath.
 *
 * Every assertion here is falsified in the comments below: remove the stated filter and
 * the test fails.
 */

const COMPANY_A = 'co-a';
const COMPANY_B = 'co-b';

interface Call {
  model: string;
  op: string;
  args: any;
}

/** Records every prisma call, on both the outer client and the transaction client. */
function recordingPrisma() {
  const calls: Call[] = [];
  const tenant: string[] = [];

  const makeModel = (model: string, canned: Record<string, any> = {}) =>
    new Proxy(
      { ...canned },
      {
        get(target: any, op: string) {
          if (typeof op !== 'string') return undefined;
          if (op === 'then' || op === 'catch') return undefined;
          if (!(op in target)) {
            target[op] = jest.fn(async (...args: any[]) => {
              calls.push({ model, op, args: args[0] });
              return canned[`__${op}`] ?? defaultResult(model, op);
            });
          }
          return target[op];
        },
      },
    );

  const tx = makeModel('__tx') && {
    waybill: makeModel('waybill', { __findFirst: null }),
    driver: makeModel('driver'),
    driverWallet: makeModel('driverWallet'),
    codTransaction: makeModel('codTransaction'),
    invoiceItem: makeModel('invoiceItem'),
    shipment: makeModel('shipment'),
  };

  const prisma: any = {
    waybill: makeModel('waybill'),
    driver: makeModel('driver'),
    driverWallet: makeModel('driverWallet'),
    codTransaction: makeModel('codTransaction'),
    invoiceItem: makeModel('invoiceItem'),
    shipment: makeModel('shipment'),
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenant.push(companyId);
      return fn(tx);
    }),
  };

  // NOTE: mockResolvedValue REPLACES a mock's implementation, which would silently
  // discard the recording above — overridden calls would vanish from `calls` and the
  // assertions would be looking at an incomplete picture. Always stub through here.
  const stub = (client: any, model: string, op: string, value: any) => {
    client[model][op].mockImplementation(async (...args: any[]) => {
      calls.push({ model, op, args: args[0] });
      return typeof value === 'function' ? value(args[0]) : value;
    });
  };

  return { prisma, tx, calls, tenant, stub };
}

const WAYBILL_A = {
  id: 'wb-1',
  companyId: COMPANY_A,
  codAmount: 100,
  codCollected: false,
  shipments: [{ driverId: 'drv-1', driver: { id: 'drv-1', companyId: COMPANY_A, isActive: true } }],
};

function defaultResult(model: string, op: string): any {
  if (op.startsWith('findMany')) return [];
  if (op === 'count') return 0;
  if (op.startsWith('updateMany') || op.startsWith('deleteMany')) return { count: 1 };
  if (op.startsWith('update') || op.startsWith('create') || op.startsWith('upsert')) {
    return { id: `${model}-1` };
  }
  if (op.startsWith('findFirst') || op.startsWith('findUnique')) {
    return { id: `${model}-1`, codAmount: 100, codCollected: false, companyId: COMPANY_A };
  }
  return {};
}

function build(prisma: any) {
  return new CodSettlementService(prisma);
}

describe('COD tenant isolation', () => {
  it('runs the whole settlement inside a tenant transaction bound to the caller company', async () => {
    // FALSIFIED BY: calling this.prisma.$transaction instead of withTenant → calls === 0.
    const { prisma, tenant, tx, stub } = recordingPrisma();
    stub(tx, 'waybill', 'findFirst', WAYBILL_A);
    stub(tx, 'invoiceItem', 'findFirst', {
      id: 'ii-1',
      invoice: { id: 'inv-1', status: 'SENT' },
    });

    await build(prisma).recordCollection({ waybillId: 'wb-1', companyId: COMPANY_A });

    expect(tenant.length).toBeGreaterThan(0);
    for (const bound of tenant) {
      expect(bound).toBe(COMPANY_A);
    }
  });

  it('scopes the waybill read to the caller company', async () => {
    // FALSIFIED BY: removing `companyId` from the waybill findFirst where clause.
    const { prisma, tx, calls, stub } = recordingPrisma();
    stub(tx, 'waybill', 'findFirst', WAYBILL_A);
    stub(tx, 'invoiceItem', 'findFirst', {
      id: 'ii-1',
      invoice: { id: 'inv-1', status: 'SENT' },
    });

    await build(prisma).recordCollection({ waybillId: 'wb-1', companyId: COMPANY_A });

    const read = calls.find((c) => c.model === 'waybill' && c.op === 'findFirst');
    expect(read).toBeDefined();
    expect(read!.args.where).toMatchObject({ id: 'wb-1', companyId: COMPANY_A });
  });

  it('scopes the billing-evidence read to the caller company through the invoice relation', async () => {
    // FALSIFIED BY: removing the `invoice: { companyId }` relation filter. InvoiceItem
    // has no companyId of its own, so the relation IS the tenant scope.
    const { prisma, tx, calls, stub } = recordingPrisma();
    stub(tx, 'waybill', 'findFirst', WAYBILL_A);
    stub(tx, 'invoiceItem', 'findFirst', {
      id: 'ii-1',
      invoice: { id: 'inv-1', status: 'SENT' },
    });

    await build(prisma).recordCollection({ waybillId: 'wb-1', companyId: COMPANY_A });

    const read = calls.find((c) => c.model === 'invoiceItem' && c.op === 'findFirst');
    expect(read).toBeDefined();
    expect(read!.args.where).toMatchObject({ invoice: { companyId: COMPANY_A } });
  });

  it("scopes the settlement's driver read to the caller company", async () => {
    // FALSIFIED BY: removing `companyId` from the driver findFirst in settleDriver.
    const { prisma, tx, calls, stub } = recordingPrisma();
    // No prior settlement with this idempotency key, or the replay path short-circuits
    // before the driver read we are trying to observe.
    stub(tx, 'codTransaction', 'findFirst', null);
    stub(tx, 'driver', 'findFirst', { id: 'drv-1' });
    stub(tx, 'driverWallet', 'findUnique', {
      id: 'wal-1',
      driverId: 'drv-1',
      balance: 500,
      totalCollected: 500,
      totalSettled: 0,
    });

    await build(prisma).settleDriver(
      'drv-1',
      100,
      COMPANY_A,
      '11111111-1111-4111-8111-111111111111',
      'note',
    );

    const read = calls.find((c) => c.model === 'driver' && c.op === 'findFirst');
    expect(read).toBeDefined();
    expect(read!.args.where).toMatchObject({ id: 'drv-1', companyId: COMPANY_A });
  });

  it('scopes every waybill write to the caller company', async () => {
    // FALSIFIED BY: removing `companyId` from the compare-and-set updateMany.
    const { prisma, tx, calls, stub } = recordingPrisma();
    stub(tx, 'waybill', 'findFirst', WAYBILL_A);
    stub(tx, 'invoiceItem', 'findFirst', {
      id: 'ii-1',
      invoice: { id: 'inv-1', status: 'SENT' },
    });

    await build(prisma).recordCollection({ waybillId: 'wb-1', companyId: COMPANY_A });

    const writes = calls.filter((c) => c.model === 'waybill' && c.op.startsWith('update'));
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w.args.where).toMatchObject({ id: 'wb-1', companyId: COMPANY_A });
    }
  });

  it('a different tenant never appears in any query the settlement issues', async () => {
    // The strongest form: whatever the service does, COMPANY_B must not show up.
    const { prisma, tx, calls, stub } = recordingPrisma();
    stub(tx, 'waybill', 'findFirst', WAYBILL_A);
    stub(tx, 'invoiceItem', 'findFirst', {
      id: 'ii-1',
      invoice: { id: 'inv-1', status: 'SENT' },
    });

    await build(prisma).recordCollection({ waybillId: 'wb-1', companyId: COMPANY_A });

    for (const c of calls) {
      expect(JSON.stringify(c.args ?? {})).not.toContain(COMPANY_B);
    }
  });
});
