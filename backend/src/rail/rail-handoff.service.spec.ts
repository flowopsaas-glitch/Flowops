import {
  HandoffEvidenceStatus,
  HandoffEvidenceType,
  HandoffReadinessStatus,
  IntermodalLegMode,
} from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RailHandoffService } from './rail-handoff.service';
import { AddHandoffEvidenceDto, CreateHandoffReadinessDto } from './dto/handoff.dto';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';

function setup(overrides: Record<string, unknown> = {}) {
  const readiness = {
    id: 'readiness-1',
    companyId: 'tenant-1',
    consignmentId: 'consignment-1',
    status: HandoffReadinessStatus.DRAFT,
    evidence: [],
    consignment: { id: 'consignment-1', status: 'OFFLOADED', waybills: [] },
    leg: null,
    warehouse: null,
    ...overrides,
  };
  const prisma = {
    withTenant: jest.fn(async (_companyId: string, fn: any) => fn(prisma)),
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    railConsignment: { findFirst: jest.fn().mockResolvedValue({ id: 'consignment-1' }) },
    intermodalLeg: { findFirst: jest.fn().mockResolvedValue({ id: 'leg-1' }) },
    warehouse: { findFirst: jest.fn().mockResolvedValue({ id: 'warehouse-1' }) },
    waybill: { findFirst: jest.fn().mockResolvedValue({ id: 'waybill-1' }) },
    railHandoffReadiness: {
      findFirst: jest.fn().mockResolvedValue(readiness),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ ...readiness, evidence: [] }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...readiness, ...data })),
    },
    railHandoffEvidence: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'evidence-1',
        type: HandoffEvidenceType.RAIL_RELEASE,
        status: HandoffEvidenceStatus.PENDING,
        waybillId: null,
      }),
      create: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
      update: jest.fn().mockResolvedValue({ id: 'evidence-1', status: HandoffEvidenceStatus.VERIFIED }),
      findFirstOrThrow: jest.fn().mockResolvedValue({
        id: 'evidence-1', status: HandoffEvidenceStatus.VERIFIED,
      }),
      /**
       * Honours the whole where-clause, including `status`. A double that
       * matched on the id alone would make every compare-and-set succeed and
       * the concurrency cases below could not fail.
       */
      updateMany: jest.fn(async ({ where }: any) => {
        const row = { id: 'evidence-1', readinessId: 'readiness-1', companyId: 'tenant-1', status: 'PENDING' };
        const ok = Object.entries(where ?? {}).every(([k, v]) => row[k] === v);
        return { count: ok ? 1 : 0 };
      }),
    },
  } as unknown as PrismaService;
  const billing = { hasFeature: jest.fn().mockResolvedValue(true) } as unknown as BillingService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return { service: new RailHandoffService(prisma, billing, audit), prisma, billing, audit, readiness };
}

describe('RailHandoffService', () => {
  /**
   * Evidence is verified once. A second verification used to overwrite
   * `verifiedAt` and emit a second event, so the handover record showed the
   * document verified after the fact.
   */
  describe('verifying handoff evidence', () => {
    it('claims PENDING, the state the guard was checked against', async () => {
      const { service, prisma } = setup();
      await service.verifyEvidence('tenant-1', 'readiness-1', 'evidence-1');

      const call = (prisma.railHandoffEvidence.updateMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toMatchObject({
        id: 'evidence-1', readinessId: 'readiness-1', companyId: 'tenant-1',
        status: HandoffEvidenceStatus.PENDING,
      });
    });

    it('runs the verification inside a tenant context', async () => {
      const { service, prisma } = setup();
      await service.verifyEvidence('tenant-1', 'readiness-1', 'evidence-1');
      expect(prisma.withTenant).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    });

    it('refuses when the evidence was already verified', async () => {
      const { service, prisma } = setup();
      (prisma.railHandoffEvidence.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

      await expect(
        service.verifyEvidence('tenant-1', 'readiness-1', 'evidence-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });


  it('scopes consignment lookup to the tenant and rejects a foreign consignment', async () => {
    const { service, prisma } = setup();
    (prisma.railConsignment.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.create('tenant-2', 'consignment-1', new CreateHandoffReadinessDto()))
      .rejects.toThrow(NotFoundException);
    expect(prisma.railConsignment.findFirst).toHaveBeenCalledWith({
      where: { id: 'consignment-1', companyId: 'tenant-2' },
      select: { id: true },
    });
    expect(prisma.railHandoffReadiness.create).not.toHaveBeenCalled();
  });

  it('accepts only a road leg belonging to the requested consignment', async () => {
    const { service, prisma } = setup();
    (prisma.intermodalLeg.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(service.create('tenant-1', 'consignment-1', Object.assign(
      new CreateHandoffReadinessDto(), { legId: 'foreign-leg' },
    ))).rejects.toThrow(BadRequestException);
    expect(prisma.intermodalLeg.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-leg', consignmentId: 'consignment-1', mode: IntermodalLegMode.ROAD },
      select: { id: true },
    });
  });

  it('requires the rail entitlement before reading tenant handoffs', async () => {
    const { service, prisma, billing } = setup();
    (billing.hasFeature as jest.Mock).mockResolvedValue(false);

    await expect(service.list('tenant-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.railHandoffReadiness.findMany).not.toHaveBeenCalled();
  });

  it('prevents evidence from referencing a waybill outside the consignment', async () => {
    const { service, prisma } = setup();
    (prisma.waybill.findFirst as jest.Mock).mockResolvedValue(null);
    const dto = Object.assign(new AddHandoffEvidenceDto(), {
      type: HandoffEvidenceType.WAYBILL_SCAN,
      waybillId: 'foreign-waybill',
    });

    await expect(service.addEvidence('tenant-1', 'readiness-1', dto))
      .rejects.toThrow(BadRequestException);
    expect(prisma.waybill.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-waybill', companyId: 'tenant-1', railConsignmentId: 'consignment-1' },
      select: { id: true },
    });
    expect(prisma.railHandoffEvidence.create).not.toHaveBeenCalled();
  });

  it('rejects malformed evidence metadata rather than storing it', async () => {
    const { service, prisma } = setup();
    const dto = Object.assign(new AddHandoffEvidenceDto(), {
      type: HandoffEvidenceType.RAIL_RELEASE,
      metadataJson: '[]',
    });

    await expect(service.addEvidence('tenant-1', 'readiness-1', dto))
      .rejects.toThrow(BadRequestException);
    expect(prisma.railHandoffEvidence.create).not.toHaveBeenCalled();
  });

  it('requires verified COD and billing evidence when linked waybills require them', async () => {
    const waybills = [{ id: 'waybill-1', codAmount: 50, totalAmount: 100 }];
    const { service, prisma } = setup({
      consignment: { id: 'consignment-1', status: 'OFFLOADED', waybills },
    });

    await service.evaluate('tenant-1', 'readiness-1');

    expect(prisma.railHandoffReadiness.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'readiness-1' },
      data: expect.objectContaining({
        status: HandoffReadinessStatus.BLOCKED,
        blockedReasons: expect.arrayContaining([
          'Verified cod reconciliation evidence is required',
          'Verified billing release evidence is required',
        ]),
      }),
    }));
  });

  it('requires readiness before completing a handoff and audits a successful transition', async () => {
    const { service, prisma, audit, readiness } = setup();
    await expect(service.complete('tenant-1', 'readiness-1', 'user-1'))
      .rejects.toThrow(BadRequestException);
    expect(prisma.railHandoffReadiness.update).not.toHaveBeenCalled();

    (prisma.railHandoffReadiness.findFirst as jest.Mock).mockResolvedValue({
      ...readiness,
      status: HandoffReadinessStatus.READY,
    });
    await service.complete('tenant-1', 'readiness-1', 'user-1');
    expect(prisma.railHandoffReadiness.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'readiness-1', companyId: 'tenant-1', status: HandoffReadinessStatus.READY },
      data: expect.objectContaining({
        status: HandoffReadinessStatus.HANDED_OVER,
        handedOverBy: 'user-1',
      }),
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rail.handoff.completed',
      actorType: 'tenant',
      targetId: 'readiness-1',
      metadata: expect.objectContaining({ companyId: 'tenant-1', handedOverBy: 'user-1' }),
    }));
  });
});
