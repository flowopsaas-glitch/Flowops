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
    __integrations: integrations,
    __waybills: waybills,
    __logs: logs,
    __tenants: tenants,
  };
  return prisma;
}

const build = (prisma: any) => new OrderFlowService(prisma);

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
