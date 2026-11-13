import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChargesService } from './charges.service';

describe('ChargesService invoice generation', () => {
  const file = { id: 'file-1', fileNumber: 'F-001', consigneeName: 'Consignee Ltd' };
  const charges = [
    { currency: 'ZAR', sell: 100, invoiceTo: 'Customer Ltd' },
    { currency: 'ZAR', sell: 50, invoiceTo: 'Customer Ltd' },
  ];

  function makeHarness(chargeRows: any[] = charges) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'F-001-INV' }),
      },
      shipmentCharge: { findMany: jest.fn().mockResolvedValue(chargeRows) },
    };
    const prisma = {
      shipmentFile: { findFirst: jest.fn().mockResolvedValue(file) },
      shipmentCharge: {
        findMany: jest.fn().mockResolvedValue(chargeRows),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback: (client: any) => unknown) => callback(tx)),
    } as unknown as PrismaService & { __tx: typeof tx };
    (prisma as any).__tx = tx;
    return { service: new ChargesService(prisma), prisma, tx };
  }

  it('serializes and creates a file invoice using its stable number', async () => {
    const { service, tx } = makeHarness();
    await service.generateInvoice('company-1', 'file-1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.invoice.findFirst).toHaveBeenCalledWith({
      where: { companyId: 'company-1', invoiceNumber: 'F-001-INV' },
    });
    expect(tx.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceNumber: 'F-001-INV',
        clientName: 'Customer Ltd',
        subtotal: 150,
        tax: 0,
        total: 150,
        companyId: 'company-1',
      }),
    });
  });

  it('returns the existing file invoice on retry without creating a duplicate', async () => {
    const { service, tx } = makeHarness();
    const existing = { id: 'invoice-existing', invoiceNumber: 'F-001-INV' };
    tx.invoice.findFirst.mockResolvedValue(existing);

    await expect(service.generateInvoice('company-1', 'file-1')).resolves.toBe(existing);
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('does not generate an invoice for a file outside the caller tenant', async () => {
    const { service, prisma } = makeHarness();
    (prisma.shipmentFile.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.generateInvoice('company-2', 'file-1')).rejects.toThrow(NotFoundException);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it('reads the charges inside the lock, not before it', async () => {
    const { service, tx, prisma } = makeHarness();
    await service.generateInvoice('company-1', 'file-1');

    // The pre-lock read must be gone: a charge created between the old outer
    // read and the lock would have been missing from the total.
    expect((prisma.shipmentCharge.findMany as jest.Mock).mock.calls).toHaveLength(0);
    expect(tx.shipmentCharge.findMany).toHaveBeenCalledTimes(1);
  });

  it('scopes the charge read through the file relation, not fileId alone', async () => {
    const { service, tx } = makeHarness();
    await service.generateInvoice('company-1', 'file-1');

    expect(tx.shipmentCharge.findMany).toHaveBeenCalledWith({
      where: { fileId: 'file-1', file: { companyId: 'company-1' } },
    });
  });

  describe('mixed-currency files', () => {
    const mixed = [
      { currency: 'ZAR', sell: 12000, invoiceTo: 'Customer Ltd' },
      { currency: 'ZAR', sell: 3000, invoiceTo: 'Customer Ltd' },
      { currency: 'USD', sell: 850, invoiceTo: 'Customer Ltd' },
    ];

    it('refuses to invoice rather than silently dropping the non-primary currency', async () => {
      const { service, tx } = makeHarness(mixed);

      await expect(service.generateInvoice('company-1', 'file-1')).rejects.toThrow(ConflictException);
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it('names every currency and its amount so the operator can act on it', async () => {
      const { service } = makeHarness(mixed);

      await expect(service.generateInvoice('company-1', 'file-1')).rejects.toThrow(
        /USD 850\.00 \(1 line\).*ZAR 15000\.00 \(2 lines\)/s,
      );
    });

    it('explains that no exchange rate is stored, because none is', async () => {
      const { service } = makeHarness(mixed);

      await expect(service.generateInvoice('company-1', 'file-1')).rejects.toThrow(
        /no exchange rate is stored/,
      );
    });

    // The previous behaviour totalled only the most common currency, so this
    // file invoiced 15000 of the 15850 actually owed. It looked complete.
    it('never under-bills a mixed-currency file by totalling one currency', async () => {
      const { service, tx } = makeHarness(mixed);

      await expect(service.generateInvoice('company-1', 'file-1')).rejects.toThrow(ConflictException);
      const createCalls = (tx.invoice.create as jest.Mock).mock.calls;
      expect(createCalls.some((c) => c[0].data.subtotal === 15000)).toBe(false);
    });

    it('still invoices a single-currency file', async () => {
      const { service, tx } = makeHarness([
        { currency: 'USD', sell: 850, invoiceTo: 'Customer Ltd' },
        { currency: 'USD', sell: 150, invoiceTo: 'Customer Ltd' },
      ]);

      await expect(service.generateInvoice('company-1', 'file-1')).resolves.toBeDefined();
      expect(tx.invoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ subtotal: 1000, total: 1000 }),
      });
    });

    it('reports no charges to invoice when the file is empty', async () => {
      const { service, tx } = makeHarness([]);

      await expect(service.generateInvoice('company-1', 'file-1')).rejects.toThrow(NotFoundException);
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });
  });
});

describe('ChargesService charge removal', () => {
  const file = { id: 'file-1', fileNumber: 'F-001', consigneeName: 'Consignee Ltd' };

  function makeHarness(deleteCount: number) {
    const prisma = {
      shipmentFile: { findFirst: jest.fn().mockResolvedValue(file) },
      shipmentCharge: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: deleteCount }) },
    } as unknown as PrismaService;
    return { service: new ChargesService(prisma), prisma };
  }

  it('reports a deletion when the charge existed', async () => {
    const { service } = makeHarness(1);
    await expect(service.removeCharge('company-1', 'file-1', 'charge-1')).resolves.toEqual({ deleted: true });
  });

  // deleteMany resolves with count 0 when nothing matched, and the old code
  // returned { deleted: true } regardless — deleting nothing looked like a
  // deletion.
  it('does not report success when nothing was deleted', async () => {
    const { service } = makeHarness(0);
    await expect(service.removeCharge('company-1', 'file-1', 'charge-missing')).rejects.toThrow(NotFoundException);
  });

  it('scopes the delete to the tenant through the file relation', async () => {
    const { service, prisma } = makeHarness(1);
    await service.removeCharge('company-1', 'file-1', 'charge-1');

    expect(prisma.shipmentCharge.deleteMany).toHaveBeenCalledWith({
      where: { id: 'charge-1', fileId: 'file-1', file: { companyId: 'company-1' } },
    });
  });
});

describe('ChargesService totals', () => {
  const file = { id: 'file-1', fileNumber: 'F-001', consigneeName: 'Consignee Ltd' };

  function makeHarness(rows: any[]) {
    const prisma = {
      shipmentFile: { findFirst: jest.fn().mockResolvedValue(file) },
      shipmentCharge: { findMany: jest.fn().mockResolvedValue(rows), deleteMany: jest.fn() },
    } as unknown as PrismaService;
    return { service: new ChargesService(prisma), prisma };
  }

  it('scopes the totals read to the caller tenant', async () => {
    const { service, prisma } = makeHarness([]);
    await service.totals('company-1', 'file-1');

    expect(prisma.shipmentCharge.findMany).toHaveBeenCalledWith({
      where: { fileId: 'file-1', file: { companyId: 'company-1' } },
    });
  });

  it('reports each currency separately rather than summing across them', async () => {
    const { service } = makeHarness([
      { currency: 'ZAR', cost: 100, sell: 150 },
      { currency: 'USD', cost: 10, sell: 20 },
    ]);

    const result = await service.totals('company-1', 'file-1');
    const byCur = Object.fromEntries(result.currencies.map((c: any) => [c.currency, c]));

    // Summing these into one number is the mistake the invoice path refuses.
    expect(byCur.ZAR).toMatchObject({ cost: 100, sell: 150, margin: 50, marginPct: 33.3 });
    expect(byCur.USD).toMatchObject({ cost: 10, sell: 20, margin: 10, marginPct: 50 });
  });
});
