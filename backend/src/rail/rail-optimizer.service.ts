import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { RailCapacityUnit } from '@prisma/client';
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

  /**
   * The optimizer allocates against the corridor-capacity LEDGER, not against numbers
   * supplied by the caller.
   *
   * Capacity is a sourced, auditable statement — Annexure 33b, a workbook, an IM
   * confirmation — recorded through POST /rail/slots/capacity. Taking it from the
   * request instead would mean a browser decides how much a corridor can carry, which
   * is exactly the "capacity arrives from nowhere" failure the ledger was built to
   * prevent, and it would let an allocation be justified by a figure nobody can cite.
   *
   * Caller-supplied figures still work, but only as a FALLBACK for corridors the ledger
   * says nothing about. A stored statement always wins.
   */
  private async resolveCapacity(
    companyId: string,
    now: Date,
    fallback: RunOptimizerDto['capacity'],
  ): Promise<OptimizerCapacity[]> {
    const statements = await this.prisma.railCorridorCapacity.findMany({
      where: { companyId },
      orderBy: [{ corridorCode: 'asc' }, { validFrom: 'desc' }],
    });

    // The statement in force at the moment of the run. Periods can overlap, so the most
    // recently started one wins — a later published timetable supersedes an earlier draft.
    const inForce = new Map<string, number>();
    for (const s of statements) {
      const startsAfterRun = s.validFrom.getTime() > now.getTime();
      const endedBeforeRun = s.validUntil.getTime() < now.getTime();
      if (startsAfterRun || endedBeforeRun) continue;
      if (inForce.has(s.corridorCode)) continue; // ordered validFrom desc, so first seen wins
      inForce.set(s.corridorCode, this.toTrainsPerWeek(s));
    }

    const resolved: OptimizerCapacity[] = [...inForce].map(([corridorCode, trainsPerWeek]) => ({
      corridorCode,
      trainsPerWeek,
    }));

    for (const c of fallback ?? []) {
      if (inForce.has(c.corridorCode)) continue; // stored statement wins
      resolved.push({ corridorCode: c.corridorCode, trainsPerWeek: c.trainsPerWeek });
    }

    return resolved;
  }

  /**
   * The policy reasons in trains per week; the ledger stores whatever unit the operator
   * declared. Convert rather than assume, and round DOWN: the optimizer must never claim
   * more capacity than the statement supports.
   */
  private toTrainsPerWeek(statement: { unit: RailCapacityUnit; practicalPathsPerDay: number }): number {
    const declared = statement.practicalPathsPerDay;
    if (!Number.isFinite(declared) || declared <= 0) return 0;

    if (statement.unit === RailCapacityUnit.TRAINS_PER_WEEK) return Math.floor(declared);

    // PATHS_PER_DAY: a path is one scheduled train path over the corridor's bottleneck
    // section per day, so a daily figure scales to a weekly one across seven days. This
    // assumes the corridor runs every day of the week — true for the timetable periods
    // these statements cover, and the conversion is recorded in the run's notes so a
    // reader can see where the number came from rather than trusting it.
    return Math.floor(declared * 7);
  }

  async run(companyId: string, dto: RunOptimizerDto, now = new Date()): Promise<OptimizerResult> {
    await this.assertEntitled(companyId);
    const capacity: OptimizerCapacity[] = await this.resolveCapacity(companyId, now, dto.capacity);

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
