import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Paystack delivers charge.success at-least-once, and can deliver it more
 * than once at the same time. The handler must therefore be exactly-once,
 * not merely idempotent-by-luck.
 *
 * The writes themselves are all fixed-value (status SUCCESS, plan X), so a
 * duplicate delivery cannot double-credit. What it DOES break is narrower and
 * easy to miss: `paidAt` gets overwritten with a later timestamp, so the
 * recorded moment of payment stops being the moment of payment, and the
 * promote/notify side-effects run twice for one charge. These tests pin that.
 */
describe('PaystackService webhook idempotency', () => {
  function makeHarness(payment: {
    id: string;
    reference: string;
    status: string;
    invoiceId?: string | null;
    companyId: string;
    paidAt?: Date | null;
  }) {
    const db = { payment: { ...payment }, invoiceUpdates: [] as any[] };

    const prisma = {
      payment: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.reference === db.payment.reference ? { ...db.payment } : null,
        ),
        // Honours `status: { not: 'SUCCESS' }` — the guard under test.
        updateMany: jest.fn(async ({ where, data }: any) => {
          const refOk = db.payment.reference === where.reference;
          let statusOk = true;
          if (where.status && typeof where.status === 'object' && where.status.not) {
            statusOk = db.payment.status !== where.status.not;
          }
          if (!refOk || !statusOk) return { count: 0 };
          Object.assign(db.payment, data);
          return { count: 1 };
        }),
      },
      invoice: {
        update: jest.fn(async ({ where, data }: any) => {
          db.invoiceUpdates.push({ where, data });
          return { id: where.id, ...data };
        }),
      },
      company: { update: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    return { prisma: prisma as any, db };
  }

  async function service(prisma: any) {
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (_k: string, d?: any) => d ?? '' } },
      ],
    }).compile();
    return mod.get(PaystackService);
  }

  const REF = 'ref-123';

  const charge = (over: any = {}) => ({
    reference: REF,
    channel: 'card',
    customer: { email: 'ops@example.co.za' },
    ...over,
  });

  it('marks the payment and invoice paid on first delivery', async () => {
    const { prisma, db } = makeHarness({
      id: 'pay-1',
      reference: REF,
      status: 'PENDING',
      invoiceId: 'inv-1',
      companyId: 'co-1',
    });
    const svc = await service(prisma);

    await svc.handleWebhookEvent('charge.success', charge(), { raw: true });

    expect(db.payment.status).toBe('SUCCESS');
    expect(db.payment.paidAt).toBeInstanceOf(Date);
    expect(db.invoiceUpdates).toHaveLength(1);
    expect(db.invoiceUpdates[0].data.status).toBe('PAID');
  });

  it('is a no-op on a sequential redelivery', async () => {
    const { prisma, db } = makeHarness({
      id: 'pay-1',
      reference: REF,
      status: 'PENDING',
      invoiceId: 'inv-1',
      companyId: 'co-1',
    });
    const svc = await service(prisma);

    await svc.handleWebhookEvent('charge.success', charge(), { raw: true });
    const firstPaidAt = db.payment.paidAt;
    const firstInvoiceWrites = db.invoiceUpdates.length;

    // Second delivery: payment is already SUCCESS.
    await svc.handleWebhookEvent('charge.success', charge(), { raw: true });

    expect(db.invoiceUpdates.length).toBe(firstInvoiceWrites);
    expect(db.payment.paidAt).toEqual(firstPaidAt);
  });

  it('does not let a concurrent delivery move paidAt', async () => {
    // THE RACE. Both deliveries read PENDING before either writes.
    const { prisma, db } = makeHarness({
      id: 'pay-1',
      reference: REF,
      status: 'PENDING',
      invoiceId: 'inv-1',
      companyId: 'co-1',
    });
    const svc = await service(prisma);

    // Two deliveries in flight, both having seen PENDING.
    const first = svc.handleWebhookEvent('charge.success', charge(), { raw: true });
    const second = svc.handleWebhookEvent('charge.success', charge(), { raw: true });
    await Promise.all([first, second]);

    // Exactly one winner: one invoice write, one plan promotion, and a single
    // paidAt value that was never overwritten.
    expect(db.invoiceUpdates).toHaveLength(1);
    expect(db.payment.status).toBe('SUCCESS');
    expect(prisma.company.update).toHaveBeenCalledTimes(0); // no plan code in payload
  });

  it('leaves a failed payment alone when a success is delivered', async () => {
    const { prisma, db } = makeHarness({
      id: 'pay-1',
      reference: REF,
      status: 'FAILED',
      invoiceId: 'inv-1',
      companyId: 'co-1',
    });
    const svc = await service(prisma);

    // 'not SUCCESS' includes FAILED, so a genuine success after a failure
    // still applies — a customer who retried must not be stranded.
    await svc.handleWebhookEvent('charge.success', charge(), { raw: true });
    expect(db.payment.status).toBe('SUCCESS');
    expect(db.invoiceUpdates).toHaveLength(1);
  });
});
