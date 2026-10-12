import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { RailSlotService } from './rail-slot.service';
import { evaluateCompliance } from './rail-compliance';
import {
  optimizeSlotSchedule, OptimizerCapacity, OptimizerInput, OptimizerResult,
} from './rail-optimizer.policy';
import { ApplyOptimizerDto, RunOptimizerDto } from './dto/rail-optimizer.dto';
import { RailActor } from './rail-audit';

/**
 * Schedule Optimizer service — gathers the real domain state (applications,
 * possessions, compliance documents), runs the pure policy, and applies human
 * decisions through the EXISTING allocation workflow (so every guard rail,
 * audit entry and webhook event of allocate/reject still fires).
 */
@Injectable()
export class RailOptimizerService {
  private readonly logger = new Logger(RailOptimizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly slots: RailSlotService,
  ) {}

  private async assertEntitled(companyId: string): Promise<void> {
    if (!(await this.billing.hasFeature(companyId, 'rail'))) {
      throw new ForbiddenException('Rail & Intermodal is an Enterprise feature. Upgrade your plan to use the schedule optimizer.');
    }
  }

  async run(companyId: string, dto: RunOptimizerDto, now = new Date()): Promise<OptimizerResult> {
    await this.assertEntitled(companyId);
    const capacity: OptimizerCapacity[] = dto.capacity.map((c) => ({ corridorCode: c.corridorCode, trainsPerWeek: c.trainsPerWeek }));

    const [pending, allocated, possessions, docs] = await Promise.all([
      this.prisma.railSlotApplication.findMany({
        where: { companyId, status: { in: ['SUBMITTED', 'UNDER_ASSESSMENT', 'CAPACITY_CONFLICT'] } },
        orderBy: { applicationNumber: 'asc' },
      }),
      this.prisma.railSlotApplication.findMany({
        where: { companyId, status: 'ALLOCATED' },
        select: { applicationNumber: true, corridorCode: true, trainsPerWeek: true },
      }),
      this.prisma.railPossessionWindow.findMany({
        where: { companyId, status: { in: ['PLANNED', 'ACTIVE'] } },
        select: { id: true, corridorCode: true, title: true, startsAt: true, endsAt: true },
      }),
      this.prisma.railOperatorComplianceDoc.findMany({ where: { companyId } }),
    ]);

    const input: OptimizerInput = {
      candidates: pending.map((app) => {
        const compliance = evaluateCompliance(docs, 'SUBMIT', { carriesDangerousGoods: app.isDangerousGoods }, now);
        return {
          id: app.id,
          applicationNumber: app.applicationNumber,
          corridorCode: app.corridorCode,
          requestedFrom: app.requestedFrom,
          requestedUntil: app.requestedUntil,
          trainsPerWeek: app.trainsPerWeek,
          envelopeCheckStatus: (app.envelopeCheckStatus as 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNVERIFIED' | null) ?? null,
          complianceOk: compliance.ok,
          complianceBlockers: compliance.blockers,
          isDangerousGoods: app.isDangerousGoods,
        };
      }),
      capacity,
      possessions: possessions.map((p) => ({
        windowId: p.id, corridorCode: p.corridorCode, title: p.title, startsAt: p.startsAt, endsAt: p.endsAt,
      })),
      existingAllocations: allocated.map((a) => ({
        applicationNumber: a.applicationNumber, corridorCode: a.corridorCode, trainsPerWeek: a.trainsPerWeek,
      })),
      now,
    };

    return optimizeSlotSchedule(input);
  }

  /**
   * Apply human decisions. ALLOCATE on a SUBMITTED application walks it through
   * UNDER_ASSESSMENT first (the state machine allows SUBMITTED → UNDER_ASSESSMENT
   * → ALLOCATED only); every step is the normal audited workflow. Batch-tolerant:
   * one invalid item does not abandon the rest — outcomes are returned per item.
   */
  async apply(companyId: string, dto: ApplyOptimizerDto, actor: RailActor) {
    await this.assertEntitled(companyId);
    const results: Array<{ applicationId: string; applicationNumber?: string; ok: boolean; action: string; error?: string; result?: unknown }> = [];

    for (const d of dto.decisions) {
      try {
        const app = await this.prisma.railSlotApplication.findFirst({
          where: { id: d.applicationId, companyId },
          select: { id: true, applicationNumber: true, status: true },
        });
        if (!app) throw new BadRequestException('Application not found for this tenant.');

        if (d.action === 'ALLOCATE') {
          if (app.status === 'SUBMITTED') {
            await this.slots.startAssessment(companyId, app.id, actor);
          }
          const result = await this.slots.allocate(companyId, app.id, {
            ...(d.validFrom ? { validFrom: d.validFrom } : {}),
            ...(d.validUntil ? { validUntil: d.validUntil } : {}),
            ...(d.imReference ? { imReference: d.imReference } : {}),
          }, actor);
          results.push({ applicationId: app.id, applicationNumber: app.applicationNumber, ok: true, action: 'ALLOCATE', result });
        } else {
          const reason = d.reason?.trim();
          if (!reason || reason.length < 3) {
            throw new BadRequestException('A rejection reason of at least 3 characters is required.');
          }
          const result = await this.slots.reject(companyId, app.id, { reason }, actor);
          results.push({ applicationId: app.id, applicationNumber: app.applicationNumber, ok: true, action: 'REJECT', result });
        }
      } catch (err) {
        const message = (err as Error)?.message ?? 'Apply failed';
        this.logger.warn(`Optimizer apply failed for ${d.applicationId} (${d.action}): ${message}`);
        results.push({ applicationId: d.applicationId, ok: false, action: d.action, error: message });
      }
    }
    return { applied: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }
}
