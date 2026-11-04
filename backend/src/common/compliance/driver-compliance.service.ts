import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DriverComplianceOptions,
  DriverComplianceResult,
  DriverComplianceSnapshot,
  describeCompliance,
  evaluateDriverCompliance,
} from './driver-compliance.policy';

/**
 * DriverComplianceService — the ONLY place compliance is decided.
 *
 * Every path that puts a driver on a parcel must call this service before it
 * writes:
 *   - AutoDispatchService.dispatch()/suggest()      (auto dispatch)
 *   - WaybillsService.assignDriver()                (manual assignment)
 *   - LogisticsOpsService.autoReassignAtDestination (hub auto-reassign)
 *   - DriverPortalService.confirmLinehaulDelivery()  (linehaul hand-off)
 *   - RoutingService.optimize*() when a driverId is given (route creation)
 *
 * The service is deliberately strict about tenancy: the driver is loaded with
 * `{ id, companyId }` and a driver that exists in another tenant is reported as
 * not found — never as "compliant" because the caller only passed an id.
 */
@Injectable()
export class DriverComplianceService {
  private readonly logger = new Logger(DriverComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Operational policy switches come from the environment, read per call so a
   *  rollout decision does not need a redeploy on every node. */
  private options(overrides: DriverComplianceOptions = {}): DriverComplianceOptions {
    const requireDocuments =
      overrides.requireDocuments ?? process.env.DRIVER_REQUIRE_DOCUMENTS === 'true';
    const warningWindowDays = overrides.warningWindowDays ?? this.numberFromEnv('DRIVER_EXPIRY_WARNING_DAYS', 14);
    return { ...overrides, requireDocuments, warningWindowDays };
  }

  private numberFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw == null || raw === '') return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  /**
   * Load the compliance snapshot for one driver in one tenant.
   * Throws NotFoundException when the driver does not exist in that company.
   */
  async snapshot(driverId: string, companyId: string): Promise<DriverComplianceSnapshot> {
    if (!driverId || !companyId) {
      throw new NotFoundException('Driver not found');
    }

    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId },
      select: {
        id: true,
        name: true,
        companyId: true,
        isActive: true,
        status: true,
        licenseExpiry: true,
        insuranceExpiry: true,
        backgroundCheckExpiry: true,
        nextServiceDate: true,
        currentKm: true,
        nextServiceKm: true,
        complianceHold: true,
        complianceHoldReason: true,
      },
    });

    if (!driver) throw new NotFoundException('Driver not found');

    // Unresolved CRITICAL safety alerts are part of the snapshot: a driver with
    // an open critical alert must not be dispatched. One query, tenant scoped,
    // shared with the fleet report so the two can never disagree.
    const counts = await this.criticalAlertCounts(companyId, [driverId]);
    const criticalSafetyAlerts = counts ? counts.get(driverId) ?? 0 : null;

    // `driverId` is the public shape of the snapshot; the row's `id` is the
    // same value, so callers never have to remember which to read.
    return { ...driver, driverId: driver.id, criticalSafetyAlerts };
  }

  /**
   * Unresolved CRITICAL safety alerts per driver, in one grouped query.
   *
   * Returns `null` — not an empty map — when the check could not run, because
   * "we could not check" and "there are none" must not collapse into the same
   * answer. The policy blocks on `null`.
   */
  private async criticalAlertCounts(
    companyId: string,
    driverIds: string[],
  ): Promise<Map<string, number> | null> {
    if (!driverIds.length) return new Map();
    try {
      const safetyAlert = (this.prisma as any).safetyAlert;
      // Older schemas may not carry the model at all; that is unavailability,
      // not a clean record.
      if (!safetyAlert?.groupBy) return null;
      const rows: Array<{ driverId: string; _count?: { _all?: number } }> = await safetyAlert.groupBy({
        by: ['driverId'],
        where: { companyId, driverId: { in: driverIds }, riskLevel: 'CRITICAL', acknowledged: false },
        _count: { _all: true },
      });
      return new Map(rows.map((row) => [row.driverId, row._count?._all ?? 0]));
    } catch (err: any) {
      this.logger.warn(`Safety-alert check unavailable for company ${companyId}: ${err?.message ?? err}`);
      return null;
    }
  }

  /** Evaluate without throwing — for filtering candidate lists. */
  async evaluate(
    driverId: string,
    companyId: string,
    options: DriverComplianceOptions = {},
  ): Promise<DriverComplianceResult> {
    const snapshot = await this.snapshot(driverId, companyId);
    return evaluateDriverCompliance(snapshot, this.options(options));
  }

  /**
   * Evaluate a snapshot already in memory (e.g. the driver row a dispatch query
   * just returned) — avoids an extra round trip on hot paths.
   */
  evaluateSnapshot(
    snapshot: DriverComplianceSnapshot,
    options: DriverComplianceOptions = {},
  ): DriverComplianceResult {
    return evaluateDriverCompliance(snapshot, this.options(options));
  }

  /**
   * Throw unless the driver may be dispatched. Callers that mutate must call
   * this BEFORE writing anything, inside the same request that performs the
   * write, so a policy change cannot be raced by a long-lived UI session.
   */
  async assertDispatchable(
    driverId: string,
    companyId: string,
    options: DriverComplianceOptions = {},
  ): Promise<DriverComplianceResult> {
    const snapshot = await this.snapshot(driverId, companyId);
    const result = this.evaluateSnapshot(snapshot, options);
    if (!result.compliant) {
      // 403 + the exact policy reasons: a dispatcher must be able to fix the
      // cause without reading server logs.
      throw new ForbiddenException(
        `Driver ${driverId} is not dispatchable (${result.blockers
          .map((b) => b.code)
          .join(', ')}): ${describeCompliance(result)}`,
      );
    }
    return result;
  }

  /**
   * Filter a list of candidate snapshots (or ids) down to the dispatchable ones.
   * Used by auto-dispatch so a non-compliant driver is never even scored.
   */
  filterDispatchable<T extends DriverComplianceSnapshot>(
    snapshots: T[],
    options: DriverComplianceOptions = {},
  ): Array<{ snapshot: T; compliance: DriverComplianceResult }> {
    return snapshots
      .map((snapshot) => ({ snapshot, compliance: this.evaluateSnapshot(snapshot, options) }))
      .filter((row) => row.compliance.compliant);
  }

  // ── Fleet reporting & evidence capture (the ops-side of the policy) ─────────

  /**
   * A fleet-wide compliance report: exactly who is blocked and why, plus the
   * document coverage that says whether `DRIVER_REQUIRE_DOCUMENTS` can be
   * switched on yet.
   *
   * This is the screen operations uses to fix data, so it is deliberately
   * explicit about *what is missing* rather than only reporting a pass/fail.
   */
  async fleetReport(
    companyId: string,
    opts: { status?: string; onlyProblems?: boolean; take?: number } = {},
  ) {
    const take = Math.min(Math.max(Number(opts.take) || 200, 1), 500);
    const drivers = await this.prisma.driver.findMany({
      where: { companyId, ...(opts.status ? { status: opts.status as any } : {}) },
      orderBy: [{ name: 'asc' }],
      take,
      select: {
        id: true,
        name: true,
        status: true,
        isActive: true,
        companyId: true,
        licenseExpiry: true,
        insuranceExpiry: true,
        backgroundCheckExpiry: true,
        nextServiceDate: true,
        currentKm: true,
        nextServiceKm: true,
        complianceHold: true,
        complianceHoldReason: true,
      },
    });

    const policy = this.policy();
    // One grouped query for the whole page. Per-driver counts here would be an
    // N+1 on a 200-row list, and a page that silently omitted the check would
    // report every driver as clear — which is how a fleet report certifies a
    // driver nobody looked at.
    const alertCounts = await this.criticalAlertCounts(companyId, drivers.map((d) => d.id));
    const rows = drivers.map((driver) => {
      const snapshot: DriverComplianceSnapshot = {
        ...driver,
        driverId: driver.id,
        criticalSafetyAlerts: alertCounts ? alertCounts.get(driver.id) ?? 0 : null,
      };
      const compliance = this.evaluateSnapshot(snapshot, policy);
      return {
        driverId: driver.id,
        name: driver.name,
        status: driver.status,
        isActive: driver.isActive,
        compliant: compliance.compliant,
        dispatchable: compliance.dispatchable,
        blockerCodes: compliance.blockers.map((b) => b.code),
        blockers: compliance.blockers.map((b) => b.message),
        warnings: compliance.warnings.map((w) => w.message),
        unverifiedDocuments: compliance.unverifiedDocuments,
        documents: {
          licenseExpiry: driver.licenseExpiry,
          insuranceExpiry: driver.insuranceExpiry,
          backgroundCheckExpiry: driver.backgroundCheckExpiry,
        },
        service: { nextServiceDate: driver.nextServiceDate, currentKm: driver.currentKm, nextServiceKm: driver.nextServiceKm },
        complianceHold: driver.complianceHold,
      };
    });

    const visible = opts.onlyProblems ? rows.filter((r) => !r.compliant) : rows;

    // Coverage: a driver counts as documented only when all three files carry a
    // date. The percentage is null (not 0%) when the fleet is empty.
    const documented = rows.filter((r) => r.unverifiedDocuments.length === 0).length;
    return {
      generatedAt: new Date(),
      policy,
      summary: {
        drivers: rows.length,
        dispatchable: rows.filter((r) => r.dispatchable).length,
        blocked: rows.filter((r) => !r.compliant).length,
        withWarnings: rows.filter((r) => r.warnings.length > 0).length,
        documented,
        undocumented: rows.length - documented,
        documentCoveragePercentage: rows.length
          ? Math.round((documented / rows.length) * 1000) / 10
          : null,
      },
      /** Whether the fleet is ready for DRIVER_REQUIRE_DOCUMENTS=true. */
      readyToRequireDocuments: rows.length > 0 && documented === rows.length,
      drivers: visible,
    };
  }

  /** The active policy switches, so the UI can show how strict the account is. */
  policy(): { requireDocuments: boolean; warningWindowDays: number; availableStatuses: string[] } {
    const options = this.options();
    return {
      requireDocuments: options.requireDocuments === true,
      warningWindowDays: options.warningWindowDays ?? 14,
      availableStatuses: [...(options.availableStatuses ?? ['AVAILABLE'])],
    };
  }

  /**
   * Record the evidence the policy judges: document expiry dates, the next
   * service date/kms, and the operational hold.
   *
   * Deliberate properties:
   *  - every field is optional and only what was sent is written;
   *  - a null is an explicit "not on file" (it is what makes the policy report
   *    the document as unverified) — so clearing a date is possible and visible;
   *  - the change is audited with before/after, because "who cleared the
   *    insurance date" and "who lifted the hold" are the questions asked after
   *    an incident;
   *  - the response is the re-evaluated compliance result, so the caller sees
   *    the effect of what they just wrote.
   */
  async recordEvidence(
    driverId: string,
    companyId: string,
    patch: {
      licenseExpiry?: string | null;
      insuranceExpiry?: string | null;
      backgroundCheckExpiry?: string | null;
      nextServiceDate?: string | null;
      currentKm?: number | null;
      nextServiceKm?: number | null;
      complianceHold?: boolean | null;
      complianceHoldReason?: string | null;
    },
    actor?: { id?: string; email?: string; name?: string; role?: string },
  ) {
    const before = await this.snapshot(driverId, companyId);

    const data: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    const dateField = (key: keyof typeof patch & string, label: string) => {
      if (!(key in patch)) return;
      const raw = patch[key];
      let value: Date | null = null;
      if (raw != null && raw !== '') {
        const parsed = new Date(raw as string);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException(`${label} is not a valid date`);
        }
        value = parsed;
      }
      data[key] = value;
      changes[key] = { from: (before as any)[key] ?? null, to: value };
    };

    dateField('licenseExpiry', 'Licence expiry');
    dateField('insuranceExpiry', 'Insurance expiry');
    dateField('backgroundCheckExpiry', 'Background-check expiry');
    dateField('nextServiceDate', 'Next service date');

    const numberField = (key: 'currentKm' | 'nextServiceKm', label: string) => {
      if (!(key in patch)) return;
      const raw = patch[key];
      if (raw == null || raw === ('' as any)) {
        data[key] = null;
        changes[key] = { from: (before as any)[key] ?? null, to: null };
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new BadRequestException(`${label} must be a non-negative number`);
      }
      data[key] = parsed;
      changes[key] = { from: (before as any)[key] ?? null, to: parsed };
    };

    numberField('currentKm', 'Odometer reading');
    numberField('nextServiceKm', 'Next service odometer');

    if ('complianceHold' in patch) {
      if (patch.complianceHold == null) {
        throw new BadRequestException('complianceHold must be true or false when provided');
      }
      data.complianceHold = patch.complianceHold;
      changes.complianceHold = { from: before.complianceHold ?? false, to: patch.complianceHold };
    }
    if ('complianceHoldReason' in patch) {
      const reason = patch.complianceHoldReason?.toString().trim() || null;
      data.complianceHoldReason = reason;
      changes.complianceHoldReason = { from: before.complianceHoldReason ?? null, to: reason };
    }
    // A hold without a reason is unactionable for the next person on shift.
    if (data.complianceHold === true && !('complianceHoldReason' in patch) && !before.complianceHoldReason) {
      throw new BadRequestException('A compliance hold requires a reason (complianceHoldReason)');
    }
    if (data.complianceHold === false && data.complianceHoldReason === undefined) {
      // Lifting a hold clears the stale reason, so the driver card is not left
      // showing why they were suspended after they were reinstated.
      data.complianceHoldReason = null;
      changes.complianceHoldReason = { from: before.complianceHoldReason ?? null, to: null };
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No compliance fields supplied');
    }

    await this.prisma.driver.update({ where: { id: driverId }, data: data as any });

    void this.audit.record({
      action: 'driver.compliance_evidence_updated',
      actorType: 'tenant',
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      targetType: 'driver',
      targetId: driverId,
      targetName: (before as any).name ?? null,
      metadata: { companyId, changes, actorRole: actor?.role ?? null, module: 'compliance' },
    });

    const after = await this.snapshot(driverId, companyId);
    return {
      driverId,
      changed: Object.keys(changes),
      compliance: this.evaluateSnapshot(after),
    };
  }

}
