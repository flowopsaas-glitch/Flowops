import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PaystackService } from './paystack.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

/**
 * The HTTP verify path — `GET /paystack/verify/:reference`.
 *
 * Paystack redirects the browser here after checkout, and the frontend polls
 * it, so repeat calls for the same reference are the NORMAL case, not an edge
 * case. The handler must therefore be idempotent and tenant-scoped.
 *
 * Three defects lived here at once, and the reason they survived is worth
 * recording: the webhook path two hundred lines up ALREADY had the idempotency
 * guard (`status: { not: 'SUCCESS' }`) and a skip for already-SUCCESS payments.
 * Reading the file, the feature looked covered. It was covered on one of its
 * two entry points.
 *
 *   1. No tenant filter: `reference` is globally @unique, so an unscoped lookup
 *      always resolves to exactly one row — just not necessarily the caller's.
 *      A COMPANY_ADMIN could verify another tenant's payment and flip that
 *      tenant's invoice to PAID.
 *   2. Not idempotent: every call rewrote `paidAt`, so the recorded moment of
 *      payment became the moment we last asked. Disbursement aging reads it.
 *   3. No status guard: a CANCELLED invoice could be resurrected.
 *
 * The harness honours `where.companyId` and `status: { notIn: [...] }` rather
 * than applying every write blindly — otherwise these tests would pass against
 * the broken code, which is the failure mode this file has to avoid.
 */
describe('PaystackService.verifyPayment (HTTP callback path)', () => {
  const REF = 'ref-abc';
  const CO = 'co-1';
  const OTHER_CO = 'co-2';

  function makeHarness(opts: {
    paymentCompanyId: string;
    status?: string;
    invoiceStatus?: string;
    invoiceId?: string | null;
  }) {
    const db = {
      payment: {
        id: 'pay-1',
        reference: REF,
        status: opts.status ?? 'PENDING',
        invoiceId: opts.invoiceId === undefined ? 'inv-1' : opts.invoiceId,
        companyId: opts.paymentCompanyId,
        paidAt: null as Date | null,
      },
      invoice: {
        id: 'inv-1',
        companyId: opts.paymentCompanyId,
        status: opts.invoiceStatus ?? 'SENT',
        paidAt: null as Date | null,
      },
      paymentWrites: [] as any[],
      invoiceWrites: [] as any[],
    };

    const prisma = {
      payment: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.reference !== REF) return null;
          if (where.companyId && where.companyId !== db.payment.companyId) return null;
          return { ...db.payment };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          if (where.id !== db.payment.id) throw new Error('no such payment');
          db.paymentWrites.push(data);
          Object.assign(db.payment, data);
          return { ...db.payment };
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      invoice: {
        update: jest.fn(async ({ where, data }: any) => {
          db.invoiceWrites.push({ where, data });
          Object.assign(db.invoice, data);
          return { ...db.invoice };
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const idOk = where.id === db.invoice.id;
          const tenantOk = !where.companyId || where.companyId === db.invoice.companyId;
          let statusOk = true;
          if (where.status && (where.status as any).notIn) {
            statusOk = !(where.status as any).notIn.includes(db.invoice.status);
          }
          if (!idOk || !tenantOk || !statusOk) return { count: 0 };
          db.invoiceWrites.push({ where, data });
          Object.assign(db.invoice, data);
          return { count: 1 };
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockResolvedValue({
      data: {
        status: true,
        data: {
          status: 'success',
          reference: REF,
          amount: 50_000,
          channel: 'card',
          customer: { email: 'ops@example.co.za' },
        },
      },
    });
  });

  it('marks the payment and its invoice paid on first verification', async () => {
    const { prisma, db } = makeHarness({ paymentCompanyId: CO });
    const svc = await service(prisma);

    await svc.verifyPayment(REF, CO);

    expect(db.payment.status).toBe('SUCCESS');
    expect(db.payment.paidAt).toBeInstanceOf(Date);
    expect(db.invoiceWrites).toHaveLength(1);
    expect(db.invoice.status).toBe('PAID');
  });

  it('refuses to verify a payment belonging to another tenant', async () => {
    // THE TENANT DEFECT. `reference` is @unique, so this unscoped lookup would
    // have resolved to co-2's payment and flipped co-2's invoice to PAID.
    const { prisma, db } = makeHarness({ paymentCompanyId: OTHER_CO });
    const svc = await service(prisma);

    await expect(svc.verifyPayment(REF, CO)).rejects.toThrow(NotFoundException);

    expect(db.payment.status).toBe('PENDING');
    expect(db.paymentWrites).toHaveLength(0);
    expect(db.invoiceWrites).toHaveLength(0);
    expect(db.invoice.status).toBe('SENT');
  });

  it('does not move paidAt when the callback is re-verified', async () => {
    // THE IDEMPOTENCY DEFECT. This is a GET the browser hits on the Paystack
    // callback, so a second call is the normal case, not a stray retry.
    const { prisma, db } = makeHarness({ paymentCompanyId: CO });
    const svc = await service(prisma);

    await svc.verifyPayment(REF, CO);
    const firstPaidAt = db.payment.paidAt;
    const firstInvoicePaidAt = db.invoice.paidAt;

    await new Promise((r) => setTimeout(r, 5));
    await svc.verifyPayment(REF, CO);

    expect(db.payment.paidAt).toEqual(firstPaidAt);
    expect(db.invoice.paidAt).toEqual(firstInvoicePaidAt);
    expect(db.paymentWrites).toHaveLength(1);
    expect(db.invoiceWrites).toHaveLength(1);
  });

  it('does not resurrect a CANCELLED invoice', async () => {
    const { prisma, db } = makeHarness({
      paymentCompanyId: CO,
      invoiceStatus: 'CANCELLED',
    });
    const svc = await service(prisma);

    await svc.verifyPayment(REF, CO);

    // The payment really did succeed — that is recorded. What must not happen
    // is a cancelled invoice coming back to life because money arrived.
    expect(db.payment.status).toBe('SUCCESS');
    expect(db.invoice.status).toBe('CANCELLED');
    expect(db.invoiceWrites).toHaveLength(0);
  });

  it('leaves an already-PAID invoice untouched', async () => {
    const { prisma, db } = makeHarness({
      paymentCompanyId: CO,
      status: 'SUCCESS',
      invoiceStatus: 'PAID',
    });
    const svc = await service(prisma);

    await svc.verifyPayment(REF, CO);

    expect(db.invoiceWrites).toHaveLength(0);
    expect(db.paymentWrites).toHaveLength(0);
  });

  it('scopes the invoice write to the payment tenant, not the caller', async () => {
    const { prisma } = makeHarness({ paymentCompanyId: CO });
    const svc = await service(prisma);

    await svc.verifyPayment(REF, CO);

    const where = prisma.invoice.updateMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(CO);
  });
});
