import { Test } from '@nestjs/testing';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { EmailService } from '../email/email.service';
import { PaystackService } from '../paystack/paystack.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Financial-integrity tests:
 *  - create() recomputes subtotal/tax/total server-side (ignores client totals)
 *  - markPaid() validates the payment amount against the invoice total
 */

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    invoice: {
      count:     jest.fn().mockResolvedValue(0),
      create:    jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'inv1', ...data })),
      update:    jest.fn().mockResolvedValue({ id: 'inv1', status: 'PAID' }),
      findFirst: jest.fn(),
    },
    payment: {
      create: jest.fn().mockResolvedValue({ id: 'pay1' }),
    },
    ...overrides,
  } as unknown as PrismaService;
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
    it('recomputes totals from line items and IGNORES client-supplied totals', async () => {
      // Client tries to sneak a total of 0 on a real invoice.
      await svc.create('co1', {
        clientName: 'Acme',
        subtotal: 0, tax: 0, total: 0, // malicious client values — must be ignored
        items: [
          { description: 'A', quantity: 2, unitPrice: 100 }, // 200
          { description: 'B', quantity: 1, unitPrice: 50 },  // 50
        ],
      });
      const arg = (prisma.invoice.create as jest.Mock).mock.calls[0][0];
      expect(arg.data.subtotal).toBe(250);      // 200 + 50
      expect(arg.data.tax).toBe(37.5);          // 15% of 250
      expect(arg.data.total).toBe(287.5);       // 250 + 37.5
    });

    it('honours a custom VAT rate when provided', async () => {
      await svc.create('co1', {
        clientName: 'Acme', taxRate: 0,
        items: [{ description: 'A', quantity: 1, unitPrice: 100 }],
      });
      const arg = (prisma.invoice.create as jest.Mock).mock.calls[0][0];
      expect(arg.data.subtotal).toBe(100);
      expect(arg.data.tax).toBe(0);
      expect(arg.data.total).toBe(100);
    });
  });

  describe('markPaid', () => {
    beforeEach(() => {
      // findOne() reads invoice with items+payments
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
  });
});
