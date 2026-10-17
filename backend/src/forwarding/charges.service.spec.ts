import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChargesService } from './charges.service';

describe('ChargesService invoice generation', () => {
  const file = { id: 'file-1', fileNumber: 'F-001', consigneeName: 'Consignee Ltd' };
  const charges = [
    { currency: 'ZAR', sell: 100, invoiceTo: 'Customer Ltd' },
    { currency: 'ZAR', sell: 50, invoiceTo: 'Customer Ltd' },
  ];

  function makeHarness() {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'invoice-1', invoiceNumber: 'F-001-INV' }),
      },
    };
    const prisma = {
      shipmentFile: { findFirst: jest.fn().mockResolvedValue(file) },
      shipmentCharge: { findMany: jest.fn().mockResolvedValue(charges) },
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
});
