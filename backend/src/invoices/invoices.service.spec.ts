import { Test } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { EmailService } from '../email/email.service';
import { PaystackService } from '../paystack/paystack.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Financial-integrity tests:
 *  - create() recomputes totals from line items and ignores client totals
 *  - markPaid() validates the payment amount against the invoice total
 *  - monthly billing pages candidates and inserts bounded invoice-item batches
 */

function makePrisma(overrides: Record<string, unknown> = {}) {
  // `markPaid` runs inside withTenant(), so its writes go through `tx`, not
  // `prisma`. These three are SHARED between the two objects on purpose: the
  // existing markPaid specs assert on `prisma.payment.create`, and sharing the
  // mock means they keep testing the real call now that it has moved into the
  // transaction, instead of being quietly re-pointed at a mock nothing calls.
  const paymentCreate = jest.fn().mockResolvedValue({ id: 'pay1' });
  const invoiceUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const invoiceFindUnique = jest.fn().mockResolvedValue({ id: 'inv1', status: 'PAID' });

  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) =>
      Promise.resolve(strings[0].includes('pg_advisory_xact_lock') ? [] : [{ lastNumber: 0 }]),
    ),
    invoice: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'inv1', ...data })),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'inv1', ...data })),
      updateMany: invoiceUpdateMany,
      findUnique: invoiceFindUnique,
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ id: 'inv1', status: 'PAID', items: [], payments: [] }),
    },
    invoiceItem: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    waybill: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payment: { create: paymentCreate },
  };
  const prisma = {
    invoice: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'inv1', status: 'PAID' }),
      updateMany: invoiceUpdateMany,
      findUnique: invoiceFindUnique,
      findFirst: jest.fn(),
    },
    payment: {
      create: paymentCreate,
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    },
    company: {
      findUnique: jest.fn().mockResolvedValue({ id: 'co1', name: 'Acme' }),
    },
    $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
    // withTenant forwards to $transaction (including the { maxWait, timeout } options),
    // so the specs that assert on transaction options keep testing the real thing.
    withTenant: jest.fn(async (companyId: string, callback: (client: any) => unknown, opts?: any) =>
      (prisma as any).$transaction(callback, opts),
    ),
    __tx: tx,
    ...overrides,
  } as unknown as PrismaService & { __tx: typeof tx };
  return prisma;
}

describe('InvoicesService (financial integrity)', () => {
  let svc: InvoicesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: PaystackService, useValue: {} },
      ],
    }).compile();
    svc = module.get(InvoicesService);
  });

  describe('create', () => {
    it('recomputes totals from line items and ignores client-supplied totals', async () => {
      await svc.create('co1', {
        clientName: 'Acme',
        subtotal: 0, tax: 0, total: 0,
        items: [
          { description: 'A', quantity: 2, unitPrice: 100 },
          { description: 'B', quantity: 1, unitPrice: 50 },
        ],
      });
      const tx = prisma.__tx;
      const arg = (tx.invoice.create as jest.Mock).mock.calls[0][0];
      expect(arg.data.subtotal).toBe(250);
      expect(arg.data.tax).toBe(37.5);
      expect(arg.data.total).toBe(287.5);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('honours a custom VAT rate when provided', async () => {
      await svc.create('co1', {
        clientName: 'Acme', taxRate: 0,
        items: [{ description: 'A', quantity: 1, unitPrice: 100 }],
      });
      const arg = (prisma.__tx.invoice.create as jest.Mock).mock.calls[0][0];
      expect(arg.data.subtotal).toBe(100);
      expect(arg.data.tax).toBe(0);
      expect(arg.data.total).toBe(100);
    });

    it('persists only allowlisted invoice fields and always generates identity/status/totals server-side', async () => {
      await svc.create('co1', {
        clientName: ' Acme ',
        clientEmail: ' billing@acme.example ',
        dueDate: '2026-11-01',
        notes: ' Net 30 ',
        taxRate: 0,
        subtotal: -1,
        tax: -2,
        total: -3,
        id: 'attacker-id',
        companyId: 'attacker-company',
        invoiceNumber: 'ATTACKER-1',
        status: 'PAID',
        paidAt: '2020-01-01T00:00:00.000Z',
        sentAt: '2020-01-01T00:00:00.000Z',
        publicToken: 'attacker-token',
        createdAt: '2020-01-01T00:00:00.000Z',
        items: [{ description: 'Service', quantity: 1, unitPrice: 100, total: 9000 }],
      });

      const data = (prisma.__tx.invoice.create as jest.Mock).mock.calls[0][0].data;
      expect(data).toMatchObject({
        clientName: 'Acme',
        clientEmail: 'billing@acme.example',
        dueDate: new Date('2026-11-01'),
        notes: ' Net 30 ',
        companyId: 'co1',
        subtotal: 100,
        tax: 0,
        total: 100,
        items: { create: [{ description: 'Service', quantity: 1, unitPrice: 100, total: 100 }] },
      });
      expect(data.invoiceNumber).not.toBe('ATTACKER-1');
      for (const field of ['id', 'status', 'paidAt', 'sentAt', 'publicToken', 'createdAt', 'taxRate']) {
        expect(data).not.toHaveProperty(field);
      }
    });

    it('validates and persists tenant-scoped waybill links from batch invoice lines', async () => {
      const tx = prisma.__tx;
      (tx.waybill.findMany as jest.Mock).mockResolvedValue([{ id: 'waybill-1' }]);
      await svc.create('co1', {
        clientName: 'Acme',
        items: [{ description: 'Delivery', quantity: 1, unitPrice: 125.5, waybillId: 'waybill-1', total: 999 }],
      });

      expect(tx.waybill.findMany).toHaveBeenCalledWith({
        where: { companyId: 'co1', id: { in: ['waybill-1'] }, invoiceItem: { is: null } },
        select: { id: true },
      });
      expect((tx.invoice.create as jest.Mock).mock.calls[0][0].data.items.create).toEqual([{
        description: 'Delivery', quantity: 1, unitPrice: 125.5, total: 125.5, waybillId: 'waybill-1',
      }]);
    });

    it('rejects invoices without at least one line item', async () => {
      await expect(svc.create('co1', { clientName: 'Acme' })).rejects.toThrow('at least one line item');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('marks only a draft as sent and ignores caller-supplied payment, amount, identity, and timestamp fields', async () => {
      const draft = { id: 'inv1', companyId: 'co1', status: 'DRAFT', items: [], payments: [] };
      const sent = { ...draft, status: 'SENT', sentAt: new Date() };
      (prisma.invoice.findFirst as jest.Mock)
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(sent);

      await svc.update('inv1', 'co1', {
        status: 'SENT',
        sentAt: '2000-01-01T00:00:00.000Z',
        paidAt: '2000-01-01T00:00:00.000Z',
        total: 0.01,
        companyId: 'attacker-company',
        publicToken: 'attacker-token',
      });

      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv1', companyId: 'co1', status: 'DRAFT' },
        data: { status: 'SENT', sentAt: expect.any(Date) },
      });
    });

    it('does not allow a generic update to mark an invoice PAID', async () => {
      (prisma.invoice.findFirst as jest.Mock).mockResolvedValue({
        id: 'inv1', companyId: 'co1', status: 'DRAFT', items: [], payments: [],
      });
      await expect(svc.update('inv1', 'co1', { status: 'PAID', paidAt: new Date() }))
        .rejects.toThrow('payment approval flow');
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('monthly invoice generation', () => {
    it('pages candidates and inserts one bounded 500-line batch at a time', async () => {
      const tx = prisma.__tx;
      const firstPage = Array.from({ length: 500 }, (_, i) => ({
        id: `wb-${String(i).padStart(3, '0')}`,
        trackingNumber: `TRK-${i}`,
        recipientName: `Recipient ${i}`,
        totalAmount: 1,
      }));
      const lastPage = [{ id: 'wb-500', trackingNumber: 'TRK-500', recipientName: 'Recipient 500', totalAmount: 1 }];
      (tx.waybill.findMany as jest.Mock)
        .mockResolvedValueOnce(firstPage)
        .mockResolvedValueOnce(lastPage);

      const invoice = await svc.generateMonthlyInvoiceForCompany({ id: 'co1', name: 'Acme' });

      expect(tx.waybill.findMany).toHaveBeenCalledTimes(2);
      expect(tx.waybill.findMany.mock.calls[0][0].take).toBe(500);
      expect(tx.waybill.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'wb-499' }, skip: 1 });
      expect(tx.invoiceItem.createMany).toHaveBeenCalledTimes(2);
      expect(tx.invoiceItem.createMany.mock.calls.map(([arg]) => arg.data.length)).toEqual([500, 1]);
      expect(tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { subtotal: 501, tax: 75.15, total: 576.15, notes: 'Auto-generated monthly statement — 501 deliveries' },
      }));
      expect(invoice).toMatchObject({ subtotal: 501, tax: 75.15, total: 576.15, deliveryCount: 501 });
      expect((prisma.$transaction as jest.Mock).mock.calls[0][1]).toEqual({ maxWait: 10_000, timeout: 180_000 });
    });
  });

  describe('markPaid', () => {
    beforeEach(() => {
      (prisma.invoice.findFirst as jest.Mock).mockResolvedValue({
        id: 'inv1', companyId: 'co1', status: 'SENT', total: 1000, items: [], payments: [],
      });
    });

    it('rejects a payment amount greater than the invoice total', async () => {
      await expect(svc.markPaid('inv1', 'co1', { amount: 5000 })).rejects.toThrow(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('rejects a non-positive amount', async () => {
      await expect(svc.markPaid('inv1', 'co1', { amount: 0 })).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid amount and records the payment', async () => {
      await svc.markPaid('inv1', 'co1', { amount: 1000 });
      const payArg = (prisma.payment.create as jest.Mock).mock.calls[0][0];
      expect(payArg.data.amount).toBe(1000);
    });

    it('defaults the payment amount to the invoice total when none is given', async () => {
      await svc.markPaid('inv1', 'co1', {});
      const payArg = (prisma.payment.create as jest.Mock).mock.calls[0][0];
      expect(payArg.data.amount).toBe(1000);
    });

    it('records exactly ONE payment when two approvals race', async () => {
      // THE COMPARE-AND-SET DEFECT. Both callers read a non-PAID invoice before
      // either writes, so a read-time `status === 'PAID'` check clears both of
      // them. Only the caller that WINS the claim may create the Payment —
      // otherwise one invoice collects two payment rows and the audit trail
      // double-counts the money.
      prisma.__tx.invoice.updateMany
        .mockResolvedValueOnce({ count: 1 }) // first caller wins
        .mockResolvedValueOnce({ count: 0 }); // second finds it already PAID
      prisma.__tx.invoice.findUnique.mockResolvedValue({ id: 'inv1', status: 'PAID' });

      await Promise.all([
        svc.markPaid('inv1', 'co1', { amount: 1000 }),
        svc.markPaid('inv1', 'co1', { amount: 1000 }),
      ]);

      expect((prisma.payment.create as jest.Mock).mock.calls).toHaveLength(1);
    });

    it('refuses to mark a CANCELLED invoice paid', async () => {
      // Money arriving for a cancelled invoice must not quietly resurrect it.
      prisma.__tx.invoice.updateMany.mockResolvedValue({ count: 0 });
      prisma.__tx.invoice.findUnique.mockResolvedValue({ id: 'inv1', status: 'CANCELLED' });

      await expect(svc.markPaid('inv1', 'co1', { amount: 1000 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('is idempotent on a repeat approval and records no second payment', async () => {
      prisma.__tx.invoice.updateMany.mockResolvedValue({ count: 0 });
      prisma.__tx.invoice.findUnique.mockResolvedValue({ id: 'inv1', status: 'PAID' });

      await svc.markPaid('inv1', 'co1', { amount: 1000 });

      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('scopes the claim to the company so one tenant cannot pay another invoice', async () => {
      await svc.markPaid('inv1', 'co1', { amount: 1000 });

      const where = (prisma.__tx.invoice.updateMany as jest.Mock).mock.calls[0][0].where;
      expect(where.companyId).toBe('co1');
      expect(where.id).toBe('inv1');
    });
  });
});
