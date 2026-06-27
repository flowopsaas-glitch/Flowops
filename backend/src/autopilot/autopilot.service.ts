import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { ClawLogicEngine } from '../ai/claw-logic.engine';

// ── Types ────────────────────────────────────────────────────────────────────

export type SignalKind =
  | 'SLA_PRE_BREACH'
  | 'SLA_BREACH'
  | 'STALLED_DELIVERY'
  | 'COD_MISMATCH'
  | 'UNASSIGNED_COLLECTION';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface OpsSignal {
  kind: SignalKind;
  severity: Severity;
  confidence: number; // 0..1 — drives the auto-execute decision
  entity: { type: string; id: string; ref: string };
  summary: string;
  recommendedAction: string;
  autoActionable: boolean;
  // populated after a run with auto-execution
  executed?: boolean;
  executionResult?: string;
}

type Aggression = 'LOW' | 'MEDIUM' | 'HIGH';

const STALL_MINUTES = 90; // an in-transit shipment with no update for this long is "stalled"
const UNASSIGNED_MINUTES = 30; // a pickup unclaimed for this long should be auto-assigned

@Injectable()
export class AutopilotService {
  private readonly logger = new Logger('CLAW_AUTOPILOT');

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly clawLogic: ClawLogicEngine,
    private readonly config: ConfigService,
  ) {}

  // ── Feature gating ─────────────────────────────────────────────────────────

  private async assertEntitled(companyId: string): Promise<void> {
    const ok = await this.billing.hasFeature(companyId, 'clawAutopilot');
    if (!ok) {
      throw new ForbiddenException(
        'CLAW Autopilot for Operations is an Enterprise feature. Upgrade your plan to let FlowOps run your ops autonomously.',
      );
    }
  }

  private globalAggression(): Aggression {
    const v = String(this.config.get('CLAW_AGGRESSION_LEVEL', 'MEDIUM')).toUpperCase();
    return (v === 'LOW' || v === 'HIGH') ? (v as Aggression) : 'MEDIUM';
  }

  /**
   * Should we auto-execute at this confidence? When the tenant has no aggression
   * override we defer to the shared ClawLogicEngine (same engine that gates the
   * platform's code auto-repair). With an override we apply tier thresholds.
   */
  private shouldAct(confidence: number, override: string | null): boolean {
    if (!override) return this.clawLogic.shouldAutoRepair(confidence);
    const a = String(override).toUpperCase();
    if (a === 'HIGH') return confidence > 0.6;
    if (a === 'LOW') return confidence > 0.95;
    return confidence > 0.85; // MEDIUM
  }

  // ── Config ───────────────────────────────────────────────────────────────────

  async getConfig(companyId: string) {
    const c = (await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { autopilotEnabled: true, autopilotAggression: true } as any,
    })) as any;
    const available = await this.billing.hasFeature(companyId, 'clawAutopilot');
    return {
      available,
      enabled: Boolean(c?.autopilotEnabled),
      aggression: (c?.autopilotAggression ?? this.globalAggression()) as Aggression,
      globalAggression: this.globalAggression(),
    };
  }

  async setConfig(companyId: string, dto: { enabled?: boolean; aggression?: string | null }) {
    await this.assertEntitled(companyId);
    const data: any = {};
    if (typeof dto.enabled === 'boolean') data.autopilotEnabled = dto.enabled;
    if (dto.aggression !== undefined) {
      const a = dto.aggression == null ? null : String(dto.aggression).toUpperCase();
      if (a && !['LOW', 'MEDIUM', 'HIGH'].includes(a)) {
        throw new ForbiddenException('aggression must be LOW, MEDIUM or HIGH');
      }
      data.autopilotAggression = a;
    }
    await this.prisma.company.update({ where: { id: companyId }, data });
    return this.getConfig(companyId);
  }

  // ── Detection ────────────────────────────────────────────────────────────────

  /** Read-only scan: surface every operational signal for the tenant. */
  async detectSignals(companyId: string): Promise<OpsSignal[]> {
    await this.assertEntitled(companyId);
    const company = (await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { slaWarningMinutes: true, slaBreachMinutes: true } as any,
    })) as any;
    const slaWarn = company?.slaWarningMinutes ?? 30;
    const slaBreach = company?.slaBreachMinutes ?? 60;

    const [sla, stalled, cod, unassigned] = await Promise.all([
      this.detectSla(companyId, slaWarn, slaBreach),
      this.detectStalled(companyId),
      this.detectCodMismatch(companyId),
      this.detectUnassigned(companyId),
    ]);

    // Critical first
    const order: Severity[] = ['critical', 'high', 'medium', 'low'];
    return [...sla, ...stalled, ...cod, ...unassigned].sort(
      (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
    );
  }

  private minutesSince(d: Date | string | null | undefined): number {
    if (!d) return 0;
    return Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  }

  private async detectSla(companyId: string, slaWarn: number, slaBreach: number): Promise<OpsSignal[]> {
    const open = await this.prisma.shipment.findMany({
      where: { companyId, status: { in: ['PENDING', 'IN_TRANSIT'] } },
      include: { waybill: { select: { trackingNumber: true, recipientName: true } } },
      take: 200,
    });
    const out: OpsSignal[] = [];
    for (const s of open) {
      const age = this.minutesSince(s.createdAt);
      const ref = s.waybill?.trackingNumber ?? s.id.slice(-8);
      if (age >= slaBreach) {
        out.push({
          kind: 'SLA_BREACH',
          severity: 'critical',
          confidence: 0.95,
          entity: { type: 'shipment', id: s.id, ref },
          summary: `Shipment ${ref} has breached its SLA (${age} min open, limit ${slaBreach} min).`,
          recommendedAction: 'Escalate to dispatch and proactively notify the recipient of the delay.',
          autoActionable: true,
        });
      } else if (age >= slaWarn) {
        out.push({
          kind: 'SLA_PRE_BREACH',
          severity: 'medium',
          confidence: 0.8,
          entity: { type: 'shipment', id: s.id, ref },
          summary: `Shipment ${ref} is approaching its SLA (${age} min open, breach at ${slaBreach} min).`,
          recommendedAction: 'Flag to dispatch now to head off a breach.',
          autoActionable: true,
        });
      }
    }
    return out;
  }

  private async detectStalled(companyId: string): Promise<OpsSignal[]> {
    const inTransit = await this.prisma.shipment.findMany({
      where: { companyId, status: 'IN_TRANSIT' },
      include: {
        waybill: { select: { trackingNumber: true } },
        driver: { select: { name: true } },
      },
      take: 200,
    });
    const now = Date.now();
    const out: OpsSignal[] = [];
    for (const s of inTransit) {
      const sinceUpdate = this.minutesSince(s.updatedAt);
      const etaPassed = s.estimatedDelivery && new Date(s.estimatedDelivery).getTime() < now;
      if (sinceUpdate >= STALL_MINUTES || etaPassed) {
        const ref = s.waybill?.trackingNumber ?? s.id.slice(-8);
        out.push({
          kind: 'STALLED_DELIVERY',
          severity: 'high',
          confidence: etaPassed ? 0.9 : 0.85,
          entity: { type: 'shipment', id: s.id, ref },
          summary: etaPassed
            ? `Shipment ${ref} is past its ETA and still in transit${s.driver?.name ? ` (driver ${s.driver.name})` : ''}.`
            : `Shipment ${ref} has had no movement for ${sinceUpdate} min${s.driver?.name ? ` (driver ${s.driver.name})` : ''}.`,
          recommendedAction: 'Ping the driver, re-confirm the route, and escalate if no response.',
          autoActionable: true,
        });
      }
    }
    return out;
  }

  private async detectCodMismatch(companyId: string): Promise<OpsSignal[]> {
    const delivered = await this.prisma.waybill.findMany({
      where: {
        companyId,
        status: 'DELIVERED',
        codAmount: { gt: 0 },
        codCollected: false,
      },
      select: { id: true, trackingNumber: true, codAmount: true },
      take: 100,
    });
    return delivered.map((w) => ({
      kind: 'COD_MISMATCH' as const,
      severity: 'high' as const,
      confidence: 0.9,
      entity: { type: 'waybill', id: w.id, ref: w.trackingNumber },
      summary: `Waybill ${w.trackingNumber} was delivered but its COD of R${(w.codAmount ?? 0).toFixed(2)} is not marked collected.`,
      recommendedAction: 'Reconcile the driver wallet and confirm cash collection with finance.',
      autoActionable: true,
    }));
  }

  private async detectUnassigned(companyId: string): Promise<OpsSignal[]> {
    const pending = await this.prisma.collection.findMany({
      where: { companyId, status: 'PENDING', driverId: null },
      select: { id: true, clientName: true, createdAt: true, scheduledAt: true },
      take: 100,
    });
    const out: OpsSignal[] = [];
    for (const c of pending) {
      const age = this.minutesSince(c.createdAt);
      const overdue = c.scheduledAt && new Date(c.scheduledAt).getTime() < Date.now();
      if (age >= UNASSIGNED_MINUTES || overdue) {
        out.push({
          kind: 'UNASSIGNED_COLLECTION',
          severity: overdue ? 'high' : 'medium',
          confidence: overdue ? 0.92 : 0.85,
          entity: { type: 'collection', id: c.id, ref: c.clientName },
          summary: overdue
            ? `Pickup for ${c.clientName} is past its scheduled time and still has no driver.`
            : `Pickup for ${c.clientName} has been unassigned for ${age} min.`,
          recommendedAction: 'Auto-assign to the least-loaded available driver.',
          autoActionable: true,
        });
      }
    }
    return out;
  }

  // ── Execution ──────────────────────────────────────────────────────────────

  /**
   * Detect, then auto-execute the eligible signals (when `auto` and the
   * confidence clears the tenant's aggression threshold). Every action is
   * recorded as an AiEvent so it shows up in the AI Control Tower.
   */
  async run(companyId: string, auto = true) {
    await this.assertEntitled(companyId);
    const cfg = (await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { autopilotAggression: true } as any,
    })) as any;
    const override = cfg?.autopilotAggression ?? null;

    const signals = await this.detectSignals(companyId);
    let executed = 0;

    for (const sig of signals) {
      if (!auto || !sig.autoActionable || !this.shouldAct(sig.confidence, override)) continue;
      try {
        const result = await this.execute(companyId, sig);
        sig.executed = true;
        sig.executionResult = result;
        executed += 1;
      } catch (e: any) {
        sig.executed = false;
        sig.executionResult = `Auto-action failed: ${e.message}`;
        this.logger.error(`Autopilot action failed for ${sig.kind} ${sig.entity.id}: ${e.message}`);
      }
    }

    return {
      ranAt: new Date().toISOString(),
      totalSignals: signals.length,
      executed,
      recommendedOnly: signals.filter((s) => !s.executed).length,
      signals,
    };
  }

  private async execute(companyId: string, sig: OpsSignal): Promise<string> {
    if (sig.kind === 'UNASSIGNED_COLLECTION') {
      return this.autoAssignCollection(companyId, sig);
    }
    // SLA / stalled / COD: raise a tracked escalation (safe, non-destructive)
    await this.logEvent(companyId, sig, 'escalated');
    return 'Escalation raised to the AI Control Tower.';
  }

  private async autoAssignCollection(companyId: string, sig: OpsSignal): Promise<string> {
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true, status: 'AVAILABLE' },
      select: { id: true, name: true },
    });
    if (drivers.length === 0) {
      await this.logEvent(companyId, sig, 'no-driver');
      return 'No available driver — left as a recommendation.';
    }
    // Pick the driver with the fewest active (PENDING) pickups.
    const loads = await Promise.all(
      drivers.map(async (d) => ({
        d,
        load: await this.prisma.collection.count({
          where: { companyId, driverId: d.id, status: 'PENDING' },
        }),
      })),
    );
    loads.sort((a, b) => a.load - b.load);
    const chosen = loads[0].d;

    await this.prisma.collection.update({
      where: { id: sig.entity.id },
      data: { driverId: chosen.id },
    });
    await this.logEvent(companyId, { ...sig, summary: `${sig.summary} Auto-assigned to ${chosen.name}.` }, 'assigned', {
      driverId: chosen.id,
      driverName: chosen.name,
    });
    return `Assigned pickup to ${chosen.name}.`;
  }

  private async logEvent(companyId: string, sig: OpsSignal, action: string, extra: Record<string, any> = {}) {
    const sev = sig.severity === 'critical' ? 'critical' : sig.severity === 'high' ? 'warning' : 'info';
    await this.prisma.aiEvent.create({
      data: {
        companyId,
        type: `AUTOPILOT_${sig.kind}`,
        title: `Autopilot ${action}: ${sig.kind.replace(/_/g, ' ').toLowerCase()}`,
        body: sig.summary,
        severity: sev,
        sourceType: 'AUTOPILOT',
        sourceId: sig.entity.id,
        metadata: { kind: sig.kind, confidence: sig.confidence, action, ...extra } as any,
        resolved: false,
      },
    });
  }

  /** Recent autopilot activity, for the console + audit. */
  async getLog(companyId: string, limit = 50) {
    await this.assertEntitled(companyId);
    return this.prisma.aiEvent.findMany({
      where: { companyId, sourceType: 'AUTOPILOT' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  // ── Scheduled autonomous sweep ───────────────────────────────────────────────

  /** Hourly: run autopilot for every Enterprise tenant that has it switched on. */
  @Cron('0 * * * *')
  async scheduledSweep(): Promise<void> {
    let companies: { id: string }[] = [];
    try {
      companies = (await this.prisma.company.findMany({
        where: { isActive: true, autopilotEnabled: true } as any,
        select: { id: true },
      })) as any;
    } catch (e: any) {
      this.logger.error(`Autopilot sweep could not list tenants: ${e.message}`);
      return;
    }
    if (companies.length === 0) return;

    this.logger.log(`🤖 Autopilot sweep across ${companies.length} tenant(s)...`);
    for (const c of companies) {
      try {
        if (!(await this.billing.hasFeature(c.id, 'clawAutopilot'))) continue;
        const res = await this.run(c.id, true);
        if (res.executed > 0) {
          this.logger.log(`Autopilot[${c.id.slice(-8)}]: executed ${res.executed}/${res.totalSignals} signals.`);
        }
      } catch (e: any) {
        this.logger.error(`Autopilot run failed for ${c.id}: ${e.message}`);
      }
    }
  }
}
