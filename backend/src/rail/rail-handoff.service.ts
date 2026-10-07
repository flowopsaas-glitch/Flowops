import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import {
  HandoffEvidenceStatus, HandoffEvidenceType, HandoffReadinessStatus, IntermodalLegMode,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';
import { AddHandoffEvidenceDto, CreateHandoffReadinessDto } from './dto/handoff.dto';

const BASE_REQUIREMENTS: HandoffEvidenceType[] = [
  HandoffEvidenceType.RAIL_RELEASE,
  HandoffEvidenceType.WAREHOUSE_RECEIPT,
  HandoffEvidenceType.WAYBILL_SCAN,
  HandoffEvidenceType.CARRIER_ACCEPTANCE,
];

@Injectable()
export class RailHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException(
        'Rail & Intermodal is an Enterprise feature. Upgrade your plan to manage final-mile handoffs.',
      );
    }
  }

  private async getReadiness(companyId: string, id: string) {
    const readiness = await this.prisma.railHandoffReadiness.findFirst({
      where: { id, companyId },
      include: {
        evidence: { orderBy: { capturedAt: 'asc' } },
        consignment: {
          include: {
            waybills: {
              select: { id: true, codAmount: true, totalAmount: true },
            },
          },
        },
        leg: true,
        warehouse: true,
      },
    });
    if (!readiness) throw new NotFoundException('Rail handoff readiness record not found');
    return readiness;
  }

  private requiredEvidence(readiness: Awaited<ReturnType<RailHandoffService['getReadiness']>>) {
    const required = [...BASE_REQUIREMENTS];
    if (readiness.consignment.waybills.some((waybill) => (waybill.codAmount ?? 0) > 0)) {
      required.push(HandoffEvidenceType.COD_RECONCILIATION);
    }
    if (readiness.consignment.waybills.some((waybill) => (waybill.totalAmount ?? 0) > 0)) {
      required.push(HandoffEvidenceType.BILLING_RELEASE);
    }
    return required;
  }

  private async auditTransition(
    action: string,
    companyId: string,
    readinessId: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.audit.record({
      action,
      actorType: 'tenant',
      targetType: 'rail_handoff_readiness',
      targetId: readinessId,
      metadata: { companyId, ...metadata },
    });
  }

  async create(companyId: string, consignmentId: string, dto: CreateHandoffReadinessDto) {
    await this.assertEntitled(companyId);
    const consignment = await this.prisma.railConsignment.findFirst({
      where: { id: consignmentId, companyId },
      select: { id: true },
    });
    if (!consignment) throw new NotFoundException('Rail consignment not found');

    if (dto.legId) {
      const leg = await this.prisma.intermodalLeg.findFirst({
        where: { id: dto.legId, consignmentId, mode: IntermodalLegMode.ROAD },
        select: { id: true },
      });
      if (!leg) throw new BadRequestException('Final-mile road leg not found for this consignment');
    }
    if (dto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: { id: dto.warehouseId, companyId, isActive: true },
        select: { id: true },
      });
      if (!warehouse) throw new NotFoundException('Warehouse not found');
    }

    const readiness = await this.prisma.railHandoffReadiness.create({
      data: {
        companyId,
        consignmentId,
        legId: dto.legId ?? null,
        warehouseId: dto.warehouseId ?? null,
        notes: dto.notes ?? null,
      },
      include: { evidence: true },
    });
    await this.auditTransition('rail.handoff.readiness.created', companyId, readiness.id, {
      consignmentId,
    });
    return readiness;
  }

  async list(companyId: string) {
    await this.assertEntitled(companyId);
    return this.prisma.railHandoffReadiness.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        consignment: { select: { consignmentNumber: true, status: true } },
        leg: { select: { id: true, mode: true, status: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        _count: { select: { evidence: true } },
      },
      take: 100,
    });
  }

  async get(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    return this.getReadiness(companyId, id);
  }

  async addEvidence(companyId: string, readinessId: string, dto: AddHandoffEvidenceDto) {
    await this.assertEntitled(companyId);
    const readiness = await this.getReadiness(companyId, readinessId);
    if (readiness.status === HandoffReadinessStatus.HANDED_OVER) {
      throw new BadRequestException('A handed-over readiness record cannot be changed');
    }
    if (dto.waybillId) {
      const waybill = await this.prisma.waybill.findFirst({
        where: { id: dto.waybillId, companyId, railConsignmentId: readiness.consignmentId },
        select: { id: true },
      });
      if (!waybill) throw new BadRequestException('Waybill is not linked to this rail consignment');
    }
    let metadata: Prisma.InputJsonObject | undefined;
    if (dto.metadataJson) {
      try {
        const parsed = JSON.parse(dto.metadataJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        metadata = parsed as Prisma.InputJsonObject;
      } catch {
        throw new BadRequestException('metadataJson must be a valid JSON object');
      }
    }
    const evidence = await this.prisma.railHandoffEvidence.create({
      data: {
        companyId,
        readinessId,
        waybillId: dto.waybillId ?? null,
        type: dto.type,
        reference: dto.reference ?? null,
        evidenceUrl: dto.evidenceUrl ?? null,
        metadata,
      },
    });
    await this.auditTransition('rail.handoff.evidence.added', companyId, readinessId, {
      evidenceId: evidence.id,
      type: evidence.type,
      waybillId: evidence.waybillId,
    });
    return evidence;
  }

  async verifyEvidence(companyId: string, readinessId: string, evidenceId: string) {
    await this.assertEntitled(companyId);
    const readiness = await this.getReadiness(companyId, readinessId);
    if (readiness.status === HandoffReadinessStatus.HANDED_OVER) {
      throw new BadRequestException('A handed-over readiness record cannot be changed');
    }
    const evidence = await this.prisma.railHandoffEvidence.findFirst({
      where: { id: evidenceId, readinessId, companyId },
    });
    if (!evidence) throw new NotFoundException('Handoff evidence not found');
    if (evidence.status !== HandoffEvidenceStatus.PENDING) {
      throw new BadRequestException('Only pending evidence can be verified');
    }
    const updated = await this.prisma.railHandoffEvidence.update({
      where: { id: evidenceId },
      data: { status: HandoffEvidenceStatus.VERIFIED, verifiedAt: new Date() },
    });
    await this.auditTransition('rail.handoff.evidence.verified', companyId, readinessId, {
      evidenceId,
      type: evidence.type,
    });
    return updated;
  }

  async evaluate(companyId: string, id: string) {
    await this.assertEntitled(companyId);
    const readiness = await this.getReadiness(companyId, id);
    if (readiness.status === HandoffReadinessStatus.HANDED_OVER) return readiness;
    const required = this.requiredEvidence(readiness);
    const verifiedTypes = new Set(
      readiness.evidence
        .filter((evidence) => evidence.status === HandoffEvidenceStatus.VERIFIED)
        .map((evidence) => evidence.type),
    );
    const blockedReasons: string[] = [];
    if (!['OFFLOADED', 'COMPLETED'].includes(readiness.consignment.status)) {
      blockedReasons.push('Rail consignment must be OFFLOADED before final-mile handoff');
    }
    for (const type of required) {
      if (!verifiedTypes.has(type)) blockedReasons.push(`Verified ${type.toLowerCase().replace(/_/g, ' ')} evidence is required`);
    }
    const status = blockedReasons.length ? HandoffReadinessStatus.BLOCKED : HandoffReadinessStatus.READY;
    const updated = await this.prisma.railHandoffReadiness.update({
      where: { id },
      data: { status, blockedReasons },
      include: { evidence: true },
    });
    await this.auditTransition('rail.handoff.readiness.evaluated', companyId, id, {
      status,
      blockedReasons,
    });
    return updated;
  }

  async complete(companyId: string, id: string, handedOverBy?: string) {
    await this.assertEntitled(companyId);
    const readiness = await this.getReadiness(companyId, id);
    if (readiness.status !== HandoffReadinessStatus.READY) {
      throw new BadRequestException('Only READY handoffs can be marked HANDED_OVER');
    }
    const updated = await this.prisma.railHandoffReadiness.update({
      where: { id, companyId, status: HandoffReadinessStatus.READY },
      data: {
        status: HandoffReadinessStatus.HANDED_OVER,
        handedOverAt: new Date(),
        handedOverBy: handedOverBy ?? null,
      },
      include: { evidence: true },
    });
    await this.auditTransition('rail.handoff.completed', companyId, id, { handedOverBy });
    return updated;
  }
}
