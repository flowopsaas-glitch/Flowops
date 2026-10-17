import { BadRequestException } from '@nestjs/common';
import { DisbursementsService } from './disbursements.service';

function makeHarness() {
  const prisma = {
    disbursement: {
      findFirst: jest.fn().mockResolvedValue({ id: 'disb-1', companyId: 'company-1' }),
      update: jest.fn().mockResolvedValue({ id: 'disb-1', status: 'RECOVERED' }),
    },
    invoice: {
      findFirst: jest.fn(),
    },
  };
  return { service: new DisbursementsService(prisma as any), prisma };
}

describe('DisbursementsService invoice integrity', () => {
  it('refuses a recovery invoice from another company', async () => {
    const { service, prisma } = makeHarness();
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(service.markRecovered('company-1', 'disb-1', 'foreign-invoice')).rejects.toThrow(BadRequestException);
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-invoice', companyId: 'company-1' },
      select: { id: true },
    });
    expect(prisma.disbursement.update).not.toHaveBeenCalled();
  });

  it('links an existing same-company invoice when recovering a disbursement', async () => {
    const { service, prisma } = makeHarness();
    prisma.invoice.findFirst.mockResolvedValue({ id: 'invoice-1' });

    await service.markRecovered('company-1', 'disb-1', 'invoice-1');

    expect(prisma.disbursement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'disb-1' },
      data: expect.objectContaining({ status: 'RECOVERED', invoiceId: 'invoice-1' }),
    }));
  });

  it('validates invoiceId through the generic update route too', async () => {
    const { service, prisma } = makeHarness();
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(service.update('company-1', 'disb-1', { invoiceId: 'foreign-invoice' }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.disbursement.update).not.toHaveBeenCalled();
  });
});
