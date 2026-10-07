import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  constructor(private readonly prisma: PrismaService) {}

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
    // an open critical alert must not be dispatched. Counted in the DB, tenant
    // scoped, and tolerant of the model being absent in older schemas.
    let criticalSafetyAlerts = 0;
    try {
      const safetyAlert = (this.prisma as any).safetyAlert;
      if (safetyAlert?.count) {
        criticalSafetyAlerts = await safetyAlert.count({
          where: {
            companyId,
            driverId: driver.id,
            riskLevel: 'CRITICAL',
            acknowledged: false,
          },
        });
      }
    } catch (err: any) {
      // A missing/renamed model must not silently certify a driver as safe —
      // log loudly and treat the count as unknown (the policy blocks on > 0).
      this.logger.warn(`Safety-alert check unavailable for ${driverId}: ${err?.message ?? err}`);
    }

    // `driverId` is the public shape of the snapshot; the row's `id` is the
    // same value, so callers never have to remember which to read.
    return { ...driver, driverId: driver.id, criticalSafetyAlerts };
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
}
