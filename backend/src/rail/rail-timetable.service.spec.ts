import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RailTimetableService } from './rail-timetable.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';

const makeRow = () => [
  'BELLVILLE', '1417', '1', 'CAPE', 'BELLVILLE', '', '03:15:00', '', '',
  '', 'WOLSELEY', '03:15:00', '05:55:30', '3', 'YYYYYYY',
  'LIGHTAIRBRAKE/CONTAINER TRN', '02:40:00', '0', '0',
].join('\t');

function makeDependencies() {
  const createdImport = {
    id: 'import-1',
    companyId: 'tenant-1',
    scopeKey: 'tenant-1',
    sourceName: 'rail.tsv',
    sourceHash: 'hash',
    rowCount: 1,
    importedBy: 'user-1',
  };
  const prisma = {
    railScheduleImport: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    railScheduleRow: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback({
      railScheduleImport: { create: jest.fn().mockResolvedValue(createdImport) },
      railScheduleRow: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    })),
    withTenant: jest.fn(async (_companyId: string, callback: (tx: any) => Promise<unknown>) => callback({
      railScheduleImport: { create: jest.fn().mockResolvedValue(createdImport) },
      railScheduleRow: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    })),
  } as unknown as PrismaService;
  const billing = { hasFeature: jest.fn().mockResolvedValue(true) } as unknown as BillingService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { prisma, billing, audit, createdImport };
}

describe('RailTimetableService', () => {
  it('imports the parsed rows atomically and audits the tenant actor', async () => {
    const { prisma, billing, audit, createdImport } = makeDependencies();
    const service = new RailTimetableService(prisma, billing, audit);
    const file = { originalname: 'rail.tsv', buffer: Buffer.from(makeRow(), 'utf8') };

    await expect(service.importFile('tenant-1', 'user-1', file)).resolves.toEqual(createdImport);
    expect(prisma.withTenant).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rail.timetable.imported',
      actorType: 'tenant',
      actorId: 'user-1',
      metadata: expect.objectContaining({ companyId: 'tenant-1', rowCount: 1 }),
    }));
  });

  it('rejects a duplicate file only within the authenticated tenant', async () => {
    const { prisma, billing, audit } = makeDependencies();
    (prisma.railScheduleImport.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });
    const service = new RailTimetableService(prisma, billing, audit);

    await expect(service.importFile('tenant-1', 'user-1', {
      originalname: 'rail.tsv',
      buffer: Buffer.from(makeRow(), 'utf8'),
    })).rejects.toThrow(ConflictException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
    expect(prisma.railScheduleImport.findFirst).toHaveBeenCalledWith({
      where: { scopeKey: 'tenant-1', sourceHash: expect.any(String) },
      select: { id: true },
    });
  });

  it('publishes shared schedules under the platform scope and audits the owner', async () => {
    const { prisma, audit } = makeDependencies();
    const service = new RailTimetableService(
      prisma,
      { hasFeature: jest.fn() } as unknown as BillingService,
      audit,
    );

    await service.importSharedFile('owner-1', {
      originalname: 'network.tsv',
      buffer: Buffer.from(makeRow(), 'utf8'),
    });

    expect(prisma.railScheduleImport.findFirst).toHaveBeenCalledWith({
      where: { scopeKey: 'shared-transnet', sourceHash: expect.any(String) },
      select: { id: true },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rail.timetable.shared_published',
      actorType: 'owner',
      actorId: 'owner-1',
      metadata: expect.objectContaining({ companyId: null, scopeKey: 'shared-transnet' }),
    }));
  });

  it('rejects malformed source before creating an import', async () => {
    const { prisma, billing, audit } = makeDependencies();
    const service = new RailTimetableService(prisma, billing, audit);

    await expect(service.importFile('tenant-1', 'user-1', {
      originalname: 'rail.tsv',
      buffer: Buffer.from('one\ttwo'),
    })).rejects.toThrow(BadRequestException);
    expect(prisma.railScheduleImport.findFirst).not.toHaveBeenCalled();
    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('does not expose a timetable import owned by another tenant', async () => {
    const { prisma, billing, audit } = makeDependencies();
    const service = new RailTimetableService(prisma, billing, audit);

    await expect(service.listRows('tenant-2', 'import-1', {})).rejects.toThrow(NotFoundException);
    expect(prisma.railScheduleImport.findFirst).toHaveBeenCalledWith({
      where: { id: 'import-1', OR: [{ companyId: 'tenant-2' }, { companyId: null }] },
      select: { id: true, companyId: true },
    });
    expect(prisma.railScheduleRow.findMany).not.toHaveBeenCalled();
  });

  it('lets entitled tenants read shared rows while querying only the shared dataset', async () => {
    const { prisma, billing, audit } = makeDependencies();
    (prisma.railScheduleImport.findFirst as jest.Mock).mockResolvedValue({
      id: 'shared-import',
      companyId: null,
    });
    const service = new RailTimetableService(prisma, billing, audit);

    await service.listRows('tenant-2', 'shared-import', { train: '1417' });

    expect(prisma.railScheduleRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { importId: 'shared-import', companyId: null, train: '1417' },
    }));
  });
});
