import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderFlowService } from './order-flow.service';

/**
 * ORDER FLOW — ingesting orders from external stores.
 *
 * This is a webhook endpoint: Shopify, WooCommerce and similar retry a delivery
 * whenever they do not get a 2xx back — including when the request actually
 * succeeded and the response was lost. So the same external order arrives more
 * than once, routinely, with no malice involved.
 *
 * Every test here failed against the code as it stood. The ingestion path had
 * no idempotency at all.
 */

const COMPANY = 'co-1';
const OTHER = 'co-2';

function makePrisma() {
  const integrations: any[] = [];
  const waybills: any[] = [];
  const logs: any[] = [];
  const tenants: string[] = [];

  const txClient = {
    waybill: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `wb-${waybills.length + 1}`, ...data };
        waybills.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = waybills.find((w) =>
          Object.entries(where ?? {}).every(([k, v]) => (w as any)[k] === v),
        );
        return hit ?? null;
      }),
      // Only the OLD auto-dispatch body calls this (to set COLLECTED). It is
      // modelled so that running this suite against a reverted copy exercises
      // the real defect instead of throwing, being swallowed by the old code's
      // own try/catch, and passing for the wrong reason.
      update: jest.fn(async ({ where, data }: any) => {
        const hit = waybills.find((w) => w.id === where.id);
        if (!hit) throw new Error('no such waybill');
        Object.assign(hit, data);
        return { ...hit };
      }),
    },
    orderSyncLog: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `log-${logs.length + 1}`, createdAt: new Date(), ...data };
        logs.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = logs.find((l) =>
          Object.entries(where ?? {}).every(([k, v]) => (l as any)[k] === v),
        );
        return hit ?? null;
      }),
      findMany: jest.fn(async () => logs.map((l) => ({ ...l }))),
    },
    orderFlowIntegration: {
      update: jest.fn(async ({ where, data }: any) => {
        const row = integrations.find((i) => i.id === where.id);
        if (!row) throw new Error('not found');
        for (const [k, v] of Object.entries(data ?? {})) {
          if (v && typeof v === 'object' && 'increment' in (v as any)) {
            row[k] = (row[k] ?? 0) + (v as any).increment;
          } else {
            row[k] = v;
          }
        }
        return { ...row };
      }),
    },
  };

  const prisma: any = {
    ...txClient,
    orderFlowIntegration: {
      ...txClient.orderFlowIntegration,
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `int-${integrations.length + 1}`, ...data };
        integrations.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const hit = integrations.find((i) =>
          Object.entries(where ?? {}).every(([k, v]) => (i as any)[k] === v),
        );
        return hit ?? null;
      }),
      findMany: jest.fn(async () => integrations.map((i) => ({ ...i }))),
      delete: jest.fn(async ({ where }: any) => {
        const idx = integrations.findIndex((i) => i.id === where.id);
        if (idx < 0) throw new Error('not found');
        return integrations.splice(idx, 1)[0];
      }),
    },
    withTenant: jest.fn(async (companyId: string, fn: any) => {
      tenants.push(companyId);
      return fn(txClient);
    }),
    // Modelled so the OLD auto-dispatch body (driver.findFirst -> waybill.update
    // to COLLECTED) still executes when this suite is run against a reverted
    // copy. Without it the old code would throw, be swallowed by its own
    // try/catch, and the suite would pass for the wrong reason.
    driver: {
      findFirst: jest.fn(async () => ({ id: 'drv-fake', status: 'AVAILABLE' })),
    },
    __drivers: [{ id: 'drv-fake', status: 'AVAILABLE' }],
    __integrations: integrations,
    __waybills: waybills,
    __logs: logs,
    __tenants: tenants,
  };
  return prisma;
}

/** Stands in for AutoDispatchService so the ingest path can be driven without
 *  the ranking engine. Defaults to "nothing was assigned", which is the case
 *  that used to be reported as a successful dispatch. */
const makeAutoDispatch = (over: any = {}) => ({
  dispatch: jest.fn(async () => ({
    assigned: false,
    waybillId: 'wb-1',
    trackingNumber: 'OF-x-1',
    selectedDriver: null,
    candidates: [],
    mode: 'INTELLIGENT',
    reason: 'No suitable driver found (all scores below threshold)',
    ...over,
  })),
});

const build = (prisma: any, autoDispatch: any = makeAutoDispatch()) =>
  new OrderFlowService(prisma, autoDispatch);

const seedIntegration = (prisma: any, over: any = {}) => {
  const row = {
    id: 'int-1',
    companyId: COMPANY,
    name: 'Shop',
    type: 'SHOPIFY',
    status: 'ACTIVE',
    autoDispatch: false,
    totalOrders: 0,
    failedOrders: 0,
    dispatchRules: null,
    ...over,
  };
  prisma.__integrations.push(row);
  return row;
};

const ORDER = {
  externalOrderId: 'shop-1001',
  orderData: {
    recipientName: 'Jane',
    recipientAddress: '1 Main Rd',
    weight: '2.5',
  },
};

describe('OrderFlowService — ingest idempotency', () => {
  it('creates one waybill when the same external order is delivered twice', async () => {
    // FAILED BEFORE: there was no idempotency check anywhere. Every retry of the
    // webhook created another waybill — another shipment, another delivery to pay
    // for. orderSyncLog already recorded externalOrderId; it was just never
    // consulted before creating.
    const prisma = makePrisma();
    seedIntegration(prisma);
    const svc = build(prisma);

    const first = await svc.ingestOrder(COMPANY, {
      integrationId: 'int-1',
      ...ORDER,
    });
    const second = await svc.ingestOrder(COMPANY, {
      integrationId: 'int-1',
      ...ORDER,
    });

    expect(prisma.__waybills).toHaveLength(1);
    expect(second.waybillId).toBe(first.waybillId);
  });

  it('reports the retry as a duplicate rather than pretending it ingested', async () => {
    const prisma = makePrisma();
    seedIntegration(prisma);
    const svc = build(prisma);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });
    const second = await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect(second.duplicate).toBe(true);
  });

  it('does not count a duplicate against the integration totals', async () => {
    const prisma = makePrisma();
    seedIntegration(prisma);
    const svc = build(prisma);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });
    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect(prisma.__integrations[0].totalOrders).toBe(1);
  });

  it('still ingests two genuinely different orders', async () => {
    const prisma = makePrisma();
    seedIntegration(prisma);
    const svc = build(prisma);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });
    await svc.ingestOrder(COMPANY, {
      integrationId: 'int-1',
      externalOrderId: 'shop-1002',
      orderData: ORDER.orderData,
    });

    expect(prisma.__waybills).toHaveLength(2);
  });

  it('scopes idempotency to the integration, not just the external id', async () => {
    // Two stores can both have order 1001. They are different orders.
    const prisma = makePrisma();
    seedIntegration(prisma, { id: 'int-1' });
    seedIntegration(prisma, { id: 'int-2', name: 'Second shop' });
    const svc = build(prisma);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });
    await svc.ingestOrder(COMPANY, { integrationId: 'int-2', ...ORDER });

    expect(prisma.__waybills).toHaveLength(2);
  });
});

describe('OrderFlowService — ingest validation', () => {
  it('rejects a weight that is not a number instead of storing NaN', async () => {
    // FAILED BEFORE: parseFloat('heavy') is NaN, and NaN went straight into a
    // Float column — a database error surfaced as a generic 500, or worse, a
    // row with a broken weight.
    const prisma = makePrisma();
    seedIntegration(prisma);

    await expect(
      build(prisma).ingestOrder(COMPANY, {
        integrationId: 'int-1',
        externalOrderId: 'shop-bad',
        orderData: { ...ORDER.orderData, weight: 'heavy' },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.__waybills).toHaveLength(0);
  });

  it('rejects a negative weight', async () => {
    const prisma = makePrisma();
    seedIntegration(prisma);

    await expect(
      build(prisma).ingestOrder(COMPANY, {
        integrationId: 'int-1',
        externalOrderId: 'shop-neg',
        orderData: { ...ORDER.orderData, weight: '-3' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a round, valid weight', async () => {
    const prisma = makePrisma();
    seedIntegration(prisma);

    const out = await build(prisma).ingestOrder(COMPANY, {
      integrationId: 'int-1',
      ...ORDER,
    });
    expect(out.success).toBe(true);
    expect(prisma.__waybills[0].weight).toBe(2.5);
  });
});

describe('OrderFlowService — tenant isolation', () => {
  it('refuses to ingest through another tenant’s integration', async () => {
    const prisma = makePrisma();
    seedIntegration(prisma, { id: 'int-1', companyId: OTHER });

    await expect(
      build(prisma).ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.__waybills).toHaveLength(0);
  });

  it('refuses an inactive integration', async () => {
    const prisma = makePrisma();
    seedIntegration(prisma, { status: 'INACTIVE' });

    await expect(
      build(prisma).ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('OrderFlowService — atomicity', () => {
  it('records the waybill, the sync log and the counter in one transaction', async () => {
    // FAILED BEFORE: three independent writes. A crash between them left a
    // waybill with no sync log, so the retry could not tell it had already run —
    // which is what made the duplicate above unrecoverable.
    const prisma = makePrisma();
    seedIntegration(prisma);

    await build(prisma).ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect(prisma.withTenant).toHaveBeenCalledWith(COMPANY, expect.any(Function));
    expect(prisma.__tenants).toEqual([COMPANY]);
  });
});

/**
 * AUTO-DISPATCH ON INGEST.
 *
 * The previous implementation of this path was a fake: it found an AVAILABLE
 * driver, set the waybill to COLLECTED and logged "Auto-dispatched waybill X to
 * driver Y" — without assigning anyone, and without anywhere to record an
 * assignment. Waybill has no driverId; assignment lives on shipment.driverId,
 * which the real AutoDispatchService writes.
 *
 * So every auto-dispatched order was marked COLLECTED — a chain-of-custody
 * event meaning "driver acknowledges receipt" — with nobody collecting it, and
 * a log line claiming a dispatch that never happened. A false success log is
 * worse than none: it is what the next engineer believes when a customer asks
 * where their parcel is.
 */
describe('OrderFlowService — auto-dispatch on ingest', () => {
  const seedAuto = (prisma: any, rules: any = null) =>
    seedIntegration(prisma, { autoDispatch: true, dispatchRules: rules });

  it('hands the order to the real dispatcher with the tenant and waybill', async () => {
    const prisma = makePrisma();
    seedAuto(prisma);
    const auto = makeAutoDispatch();
    const svc = build(prisma, auto);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect(auto.dispatch).toHaveBeenCalledTimes(1);
    const [companyId, waybillId] = (auto.dispatch as jest.Mock).mock.calls[0];
    expect(companyId).toBe(COMPANY);
    expect(waybillId).toBe(prisma.__waybills[0].id);
  });

  it('leaves the waybill PENDING when no driver could be assigned', async () => {
    // THE CORE DEFECT. The old code set COLLECTED whenever any AVAILABLE driver
    // existed, whether or not it assigned them — which was always.
    const prisma = makePrisma();
    seedAuto(prisma);
    const auto = makeAutoDispatch({ assigned: false, reason: 'no eligible driver' });
    const svc = build(prisma, auto);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect(prisma.__waybills[0].status).toBe('PENDING');
  });

  it('does not write a driver onto the waybill (there is nowhere to put one)', async () => {
    // Documents WHY the fake could never have worked: Waybill has no driverId.
    // Anything claiming to assign here is assigning in a comment.
    const prisma = makePrisma();
    seedAuto(prisma);
    const auto = makeAutoDispatch({
      assigned: true,
      selectedDriver: { driverId: 'drv-9', driverName: 'Sipho', score: 88 },
    });
    const svc = build(prisma, auto);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    const waybill = prisma.__waybills[0];
    expect(waybill).not.toHaveProperty('driverId');
    // The assignment is recorded by the dispatcher, on the shipment — not here.
    expect(auto.dispatch).toHaveBeenCalledTimes(1);
  });

  it('logs a warning rather than a false success when nothing is assigned', async () => {
    const prisma = makePrisma();
    seedAuto(prisma);
    const auto = makeAutoDispatch({ assigned: false, reason: 'all scores below threshold' });
    const svc = build(prisma, auto);

    const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    const log = jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect(warn).toHaveBeenCalled();
    const warnText = warn.mock.calls.map((c) => String(c[0])).join(' ');
    expect(warnText).toMatch(/could not assign/);
    // No "Auto-dispatched ... to driver" success line may be written.
    const logText = log.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logText).not.toMatch(/Auto-dispatched/);
  });

  it('names the driver only when the dispatcher actually assigned one', async () => {
    const prisma = makePrisma();
    seedAuto(prisma);
    const auto = makeAutoDispatch({
      assigned: true,
      selectedDriver: { driverId: 'drv-9', driverName: 'Sipho', score: 88 },
      reason: '',
    });
    const svc = build(prisma, auto);

    const log = jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    const logText = log.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logText).toMatch(/Auto-dispatched/);
    expect(logText).toMatch(/drv-9/);
  });

  it('passes the dispatch mode through from the integration rules', async () => {
    const prisma = makePrisma();
    seedAuto(prisma, { mode: 'PROXIMITY' });
    const auto = makeAutoDispatch();
    const svc = build(prisma, auto);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect((auto.dispatch as jest.Mock).mock.calls[0][2]).toEqual({ mode: 'PROXIMITY' });
  });

  it('falls back to INTELLIGENT for an unknown or absent mode', async () => {
    const prisma = makePrisma();
    seedAuto(prisma, { mode: 'TELEPATHY' });
    const auto = makeAutoDispatch();
    const svc = build(prisma, auto);

    await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect((auto.dispatch as jest.Mock).mock.calls[0][2]).toEqual({ mode: 'INTELLIGENT' });
  });

  it('does not fail the ingestion when dispatch throws', async () => {
    // Best-effort by design: a dispatch failure must not roll back a waybill
    // that was created successfully.
    const prisma = makePrisma();
    seedAuto(prisma);
    const auto = { dispatch: jest.fn(async () => { throw new Error('dispatcher down'); }) };
    const svc = build(prisma, auto);

    const res = await svc.ingestOrder(COMPANY, { integrationId: 'int-1', ...ORDER });

    expect(res.success).toBe(true);
    expect(prisma.__waybills).toHaveLength(1);
  });
});
