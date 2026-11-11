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
  const tx = {
    railScheduleImport: {
      create: jest.fn().mockResolvedValue({ ...createdImport, rowCount: 0 }),
      update: jest.fn().mockResolvedValue(createdImport),
    },
    railScheduleRow: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
    $transaction: jest.fn(async (callback: (client: any) => Promise<unknown>) => callback(tx)),
    withTenant: jest.fn(async (_companyId: string, callback: (client: any) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;
  const billing = { hasFeature: jest.fn().mockResolvedValue(true) } as unknown as BillingService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { prisma, billing, audit, createdImport, tx };
}

describe('RailTimetableService', () => {
  it('imports the parsed rows atomically and audits the tenant actor', async () => {
    const { prisma, billing, audit, createdImport, tx } = makeDependencies();
    const service = new RailTimetableService(prisma, billing, audit);
    const file = { originalname: 'rail.tsv', mimetype: 'text/tab-separated-values', buffer: Buffer.from(makeRow(), 'utf8') };

    await expect(service.importFile('tenant-1', 'user-1', file)).resolves.toEqual(createdImport);
    expect(tx.railScheduleRow.createMany).toHaveBeenCalledTimes(1);
    expect(tx.railScheduleImport.update).toHaveBeenCalledWith({ where: { id: 'import-1' }, data: { rowCount: 1 } });
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
      mimetype: 'text/tab-separated-values',
      buffer: Buffer.from(makeRow(), 'utf8'),
    })).rejects.toThrow(ConflictException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
    expect(prisma.railScheduleImport.findFirst).toHaveBeenCalledWith({
      // companyId is now part of the dedupe key, so one tenant's import of a file
      // cannot be blocked by — or leak — another tenant's import of the same file.
      where: { scopeKey: 'tenant-1', sourceHash: expect.any(String), companyId: 'tenant-1' },
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
      mimetype: 'text/tab-separated-values',
      buffer: Buffer.from(makeRow(), 'utf8'),
    });

    expect(prisma.railScheduleImport.findFirst).toHaveBeenCalledWith({
      // Owner path: companyId is null, and `companyId: null` correctly matches only
      // the shared rows the owner path also writes.
      where: { scopeKey: 'shared-transnet', sourceHash: expect.any(String), companyId: null },
      select: { id: true },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rail.timetable.shared_published',
      actorType: 'owner',
      actorId: 'owner-1',
      metadata: expect.objectContaining({ companyId: null, scopeKey: 'shared-transnet' }),
    }));
  });

  it('rejects malformed source atomically before any schedule rows are written', async () => {
    const { prisma, billing, audit, tx } = makeDependencies();
    const service = new RailTimetableService(prisma, billing, audit);

    await expect(service.importFile('tenant-1', 'user-1', {
      originalname: 'rail.tsv',
      mimetype: 'text/tab-separated-values',
      buffer: Buffer.from('one\ttwo'),
    })).rejects.toThrow(BadRequestException);
    expect(prisma.withTenant).toHaveBeenCalledTimes(1);
    expect(tx.railScheduleImport.create).toHaveBeenCalledTimes(1);
    expect(tx.railScheduleRow.createMany).not.toHaveBeenCalled();
    expect(tx.railScheduleImport.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects a non-text MIME type before parsing or importing the file', async () => {
    const { prisma, billing, audit } = makeDependencies();
    const service = new RailTimetableService(prisma, billing, audit);

    await expect(service.importFile('tenant-1', 'user-1', {
      originalname: 'rail.tsv',
      mimetype: 'application/pdf',
      buffer: Buffer.from(makeRow(), 'utf8'),
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

  it('lets tenants read only rows owned by the requested tenant import', async () => {
    const { prisma, billing, audit } = makeDependencies();
    (prisma.railScheduleImport.findFirst as jest.Mock).mockResolvedValue({
      id: 'tenant-import',
      companyId: 'tenant-2',
    });
    const service = new RailTimetableService(prisma, billing, audit);

    await service.listRows('tenant-2', 'tenant-import', { train: '1417' });

    expect(prisma.railScheduleRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { importId: 'tenant-import', companyId: 'tenant-2', train: '1417' },
    }));
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
