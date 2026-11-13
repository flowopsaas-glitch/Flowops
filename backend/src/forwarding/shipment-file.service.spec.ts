import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FakePrisma } from '../testing/fake-prisma';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { ShipmentFileService } from './shipment-file.service';

/**
 * The shipment file is the record of where a consignment is. Its milestone log
 * and its status must never disagree, and a cancelled file must stay cancelled
 * however many scans arrive after the fact.
 */
describe('ShipmentFileService', () => {
  const COMPANY_A = 'company-a';
  const COMPANY_B = 'company-b';

  let prisma: FakePrisma;
  let billing: { hasFeature: jest.Mock };
  let service: ShipmentFileService;

  beforeEach(() => {
    prisma = new FakePrisma();
    billing = { hasFeature: jest.fn().mockResolvedValue(true) };
    service = new ShipmentFileService(
      prisma as unknown as PrismaService,
      billing as unknown as BillingService,
    );
  });

  async function makeFile(companyId = COMPANY_A, status = 'DRAFT') {
    return prisma.shipmentFile.create({
      data: {
        companyId,
        status,
        fileNumber: `IMP-2026-${companyId}`,
        mode: 'SEA',
        direction: 'IMPORT',
        loadType: 'FCL',
        consigneeName: 'Consignee Ltd',
        pod: 'Durban',
      },
    });
  }

  describe('entitlement', () => {
    it('refuses when the tenant is not on the forwarding plan', async () => {
      billing.hasFeature.mockResolvedValue(false);
      await expect(
        service.create(COMPANY_A, { direction: 'IMPORT' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('milestones', () => {
    it('records the milestone and moves the status together', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      await service.advanceMilestone(COMPANY_A, file.id, 'CARGO_RECEIVED', 'Cargo at depot');

      const milestones = prisma
        .all('shipmentMilestone')
        .filter((m: any) => m.fileId === file.id);
      expect(milestones).toHaveLength(1);
      expect(milestones[0].status).toBe('CARGO_RECEIVED');

      const updated = prisma.all('shipmentFile').find((f: any) => f.id === file.id) as any;
      expect(updated.status).toBe('CARGO_RECEIVED');
    });

    it('runs the milestone write inside a tenant context', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      const spy = jest.spyOn(prisma, 'withTenant');
      await service.advanceMilestone(COMPANY_A, file.id, 'CARGO_RECEIVED');
      expect(spy).toHaveBeenCalledWith(COMPANY_A, expect.any(Function));
      spy.mockRestore();
    });

    it('scopes the status write to the calling company', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      const spy = jest.spyOn(prisma.shipmentFile, 'updateMany');
      await service.advanceMilestone(COMPANY_A, file.id, 'CARGO_RECEIVED');
      expect((spy.mock.calls[0][0] as any).where).toMatchObject({
        id: file.id,
        companyId: COMPANY_A,
      });
      spy.mockRestore();
    });

    it('constrains the advance on the status it read, not on the id alone', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      const spy = jest.spyOn(prisma.shipmentFile, 'updateMany');
      await service.advanceMilestone(COMPANY_A, file.id, 'CARGO_RECEIVED');
      expect((spy.mock.calls[0][0] as any).where).toMatchObject({ status: 'BOOKED' });
      spy.mockRestore();
    });

    it('leaves no milestone behind when it loses the race', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      // Someone else advanced the file between our read and our write.
      jest.spyOn(prisma.shipmentFile, 'updateMany').mockResolvedValueOnce({ count: 0 });

      await expect(
        service.advanceMilestone(COMPANY_A, file.id, 'CARGO_RECEIVED'),
      ).rejects.toBeInstanceOf(ConflictException);

      // The milestone must not survive: the timeline must not claim the cargo
      // moved when the file says it did not.
      expect(
        prisma.all('shipmentMilestone').filter((m: any) => m.fileId === file.id),
      ).toHaveLength(0);
      jest.restoreAllMocks();
    });

    it('refuses to advance a cancelled file', async () => {
      const file = await makeFile(COMPANY_A, 'CANCELLED');
      await expect(
        service.advanceMilestone(COMPANY_A, file.id, 'DELIVERED'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(
        prisma.all('shipmentMilestone').filter((m: any) => m.fileId === file.id),
      ).toHaveLength(0);
    });

    it('will not advance another tenant’s file', async () => {
      const file = await makeFile(COMPANY_B, 'BOOKED');
      await expect(
        service.advanceMilestone(COMPANY_A, file.id, 'CARGO_RECEIVED'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancelling', () => {
    it('cancels an open file', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      const cancelled = await service.cancel(COMPANY_A, file.id);
      expect(cancelled.status).toBe('CANCELLED');
    });

    it('is idempotent when the file is already cancelled', async () => {
      const file = await makeFile(COMPANY_A, 'CANCELLED');
      const again = await service.cancel(COMPANY_A, file.id);
      expect(again.status).toBe('CANCELLED');
    });

    it('scopes the cancel to the calling company', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      const spy = jest.spyOn(prisma.shipmentFile, 'updateMany');
      await service.cancel(COMPANY_A, file.id);
      expect((spy.mock.calls[0][0] as any).where).toMatchObject({
        id: file.id,
        companyId: COMPANY_A,
      });
      spy.mockRestore();
    });

    it('refuses to cancel a file that went terminal underneath it', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      jest.spyOn(prisma.shipmentFile, 'updateMany').mockResolvedValueOnce({ count: 0 });
      await expect(service.cancel(COMPANY_A, file.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      jest.restoreAllMocks();
    });

    it('will not cancel another tenant’s file', async () => {
      const file = await makeFile(COMPANY_B, 'BOOKED');
      await expect(service.cancel(COMPANY_A, file.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updating', () => {
    it('scopes the update to the calling company', async () => {
      const file = await makeFile(COMPANY_A, 'BOOKED');
      const spy = jest.spyOn(prisma.shipmentFile, 'updateMany');
      await service.update(COMPANY_A, file.id, { consigneeName: 'New Consignee' } as any);
      expect((spy.mock.calls[0][0] as any).where).toMatchObject({ companyId: COMPANY_A });
      spy.mockRestore();
    });
  });

  describe('file numbers', () => {
    it('allocates the next number in the tenant’s sequence', async () => {
      const first = await service.create(COMPANY_A, {
        direction: 'IMPORT',
        mode: 'SEA',
        loadType: 'FCL',
      } as any);
      expect(first.fileNumber).toMatch(/^IMP-\d{4}-00001$/);
    });

    it('keeps each tenant’s sequence separate', async () => {
      await service.create(COMPANY_A, {
        direction: 'IMPORT',
        mode: 'SEA',
        loadType: 'FCL',
      } as any);
      const otherTenant = await service.create(COMPANY_B, {
        direction: 'IMPORT',
        mode: 'SEA',
        loadType: 'FCL',
      } as any);
      // Company B starts its own count; it does not inherit company A's.
      expect(otherTenant.fileNumber).toMatch(/^IMP-\d{4}-00001$/);
    });
  });
});
