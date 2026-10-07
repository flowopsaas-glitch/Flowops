import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriverComplianceService } from '../common/compliance/driver-compliance.service';
import type { DriverComplianceSnapshot } from '../common/compliance/driver-compliance.policy';

/**
 * AUTO-DISPATCH ENGINE — assignment that is safe to run concurrently.
 *
 * Guarantees implemented here (and pinned by auto-dispatch.service.spec.ts):
 *
 *  1. `suggest()` is READ-ONLY. It scores candidates and writes nothing. The
 *     old implementation called `dispatch()`, so previewing a suggestion could
 *     silently assign a driver — a mutation from a GET-shaped action.
 *
 *  2. `dispatch()` claims the waybill with a compare-and-set INSIDE the
 *     transaction:
 *       updateMany({ where: { id, companyId, status: IN assignable },
 *                    data: { status: 'OUT_FOR_DELIVERY' } })
 *     Postgres locks the row, so of N concurrent dispatch jobs exactly one sees
 *     count === 1; every other job gets a ConflictException instead of writing
 *     a second shipment. Nothing is left half-committed because the shipment
 *     write happens in the same transaction.
 *
 *  3. A driver who is not compliant (licence/insurance/background/service/
 *     safety/availability — see DriverComplianceService) is never scored or
 *     assigned, and a driver already carrying the parcel IN_TRANSIT cannot be
 *     silently replaced by another dispatch job.
 *
 *  4. `areaSuccessRate` is real data (90-day shipment outcomes per driver) or
 *     `null` — never the hardcoded 75 that used to be shown to dispatchers as
 *     if it were a measurement.
 */

export type DispatchMode = 'PROXIMITY' | 'BALANCED' | 'INTELLIGENT';

export interface DispatchCandidate {
  driverId: string;
  driverName: string;
  phone: string;
  distanceKm: number;
  currentLoad: number;
  /** Real 90-day delivery success rate, or null when the driver has no history. */
  areaSuccessRate: number | null;
  score: number;
  reason: string;
  vehicleType?: string;
  status: string;
  /** Non-blocking compliance warnings (expiring documents, service due soon). */
  complianceWarnings?: string[];
}

/** Waybill states a dispatch job may legitimately claim. */
export const DISPATCHABLE_WAYBILL_STATUSES = [
  'PENDING',
  'COLLECTED',
  'AT_ORIGIN_HUB',
  'AT_DESTINATION_HUB',
  'FAILED_DELIVERY',
] as const;

/** Statuses that mean somebody already has this parcel on the road. */
const ACTIVE_SHIPMENT_STATUSES = ['PENDING', 'IN_TRANSIT'];

export interface AutoDispatchResult {
  assigned: boolean;
  waybillId: string;
  trackingNumber: string;
  selectedDriver: DispatchCandidate | null;
  candidates: DispatchCandidate[];
  mode: DispatchMode;
  reason: string;
}

const SUCCESS_RATE_WINDOW_DAYS = 90;
const MINIMUM_SCORE = 20;

@Injectable()
export class AutoDispatchService {
  private readonly logger = new Logger('AUTO_DISPATCH');

  constructor(
    private prisma: PrismaService,
    private compliance: DriverComplianceService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // READ-ONLY RANKING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Rank the drivers eligible for a waybill. Pure read: no writes, no state.
   * Returns an empty list (with a reason) when the waybill is missing, already
   * assigned, or when there is no compliant driver.
   */
  async rankCandidates(
    companyId: string,
    waybillId: string,
    opts?: { maxCandidates?: number },
  ): Promise<{ candidates: DispatchCandidate[]; reason?: string; trackingNumber: string }> {
    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId },
      select: {
        id: true,
        trackingNumber: true,
        recipientAddress: true,
        recipientLat: true,
        recipientLng: true,
        senderAddress: true,
        senderLat: true,
        senderLng: true,
        status: true,
      },
    });

    if (!waybill) {
      return { candidates: [], reason: 'Waybill not found', trackingNumber: '' };
    }

    if (!(DISPATCHABLE_WAYBILL_STATUSES as readonly string[]).includes(waybill.status)) {
      return {
        candidates: [],
        reason:
          waybill.status === 'OUT_FOR_DELIVERY'
            ? 'Waybill already assigned'
            : `Waybill status ${waybill.status} is not dispatchable`,
        trackingNumber: waybill.trackingNumber,
      };
    }

    const drivers = await this.prisma.driver.findMany({
      where: { companyId, isActive: true, status: 'AVAILABLE' as any },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        lastLat: true,
        lastLng: true,
        vehicleType: true,
      },
    });

    if (drivers.length === 0) {
      return {
        candidates: [],
        reason: 'No available drivers',
        trackingNumber: waybill.trackingNumber,
      };
    }

    // ── Compliance gate (single policy, applied before scoring) ─────────────
    const snapshots = await this.loadComplianceSnapshots(companyId, drivers.map((d) => d.id));
    const allowed = this.compliance.filterDispatchable(
      snapshots.filter((s) => s) as DriverComplianceSnapshot[],
    );
    const allowedById = new Map(allowed.map((row) => [row.snapshot.driverId, row.compliance]));

    const eligible = drivers.filter((d) => allowedById.has(d.id));
    if (eligible.length === 0) {
      return {
        candidates: [],
        reason: 'No compliant drivers available',
        trackingNumber: waybill.trackingNumber,
      };
    }

    // ── Current load (active shipments per driver) ─────────────────────────
    const activeShipments = await this.prisma.shipment.groupBy({
      by: ['driverId'],
      where: {
        companyId,
        driverId: { in: eligible.map((d) => d.id) },
        status: { in: ACTIVE_SHIPMENT_STATUSES as any },
      },
      _count: { _all: true },
    });
    const loadMap = new Map(activeShipments.map((s) => [s.driverId, s._count._all]));

    // ── Real success rate over a bounded window ────────────────────────────
    const successRates = await this.driverSuccessRates(companyId, eligible.map((d) => d.id));

    const pickupLat = waybill.senderLat || waybill.recipientLat;
    const pickupLng = waybill.senderLng || waybill.recipientLng;

    const candidates: DispatchCandidate[] = eligible.map((driver) => {
      let score = 100;
      let reason: string;

      let distanceKm = 999;
      if (pickupLat && pickupLng && driver.lastLat && driver.lastLng) {
        distanceKm = this.haversineKm(driver.lastLat, driver.lastLng, pickupLat, pickupLng);
      }
      score -= Math.min(40, distanceKm * 4);

      const currentLoad = loadMap.get(driver.id) || 0;
      score -= Math.min(30, Number(currentLoad) * 3);

      // Success rate only counts when measured: an unmeasured driver gets no
      // bonus and no penalty (previously every driver got a constant 75, which
      // both fabricated a metric and flattened the ranking).
      const areaSuccessRate = successRates.get(driver.id) ?? null;
      if (areaSuccessRate !== null) {
        if (areaSuccessRate >= 90) score += 20;
        else if (areaSuccessRate >= 80) score += 10;
        else if (areaSuccessRate < 60) score -= 10;
      }

      if (driver.status === 'AVAILABLE') score += 5;

      if (distanceKm < 3) reason = `Nearest driver (${distanceKm.toFixed(1)}km)`;
      else if (currentLoad === 0) reason = 'No current load';
      else reason = `${distanceKm.toFixed(1)}km away, ${currentLoad} active deliveries`;

      const compliance = allowedById.get(driver.id);
      return {
        driverId: driver.id,
        driverName: driver.name,
        phone: driver.phone,
        distanceKm: Math.round(distanceKm * 10) / 10,
        currentLoad,
        areaSuccessRate,
        score: Math.max(0, Math.round(score)),
        reason,
        vehicleType: driver.vehicleType || undefined,
        status: driver.status,
        complianceWarnings: compliance?.warnings.map((w) => w.message),
      };
    });

    candidates.sort((a, b) => b.score - a.score);

    return {
      candidates: candidates.slice(0, opts?.maxCandidates ?? 10),
      trackingNumber: waybill.trackingNumber,
    };
  }

  /**
   * Suggestions for a waybill — READ ONLY. Safe to call from a GET endpoint
   * and from polling UIs.
   */
  async suggest(companyId: string, waybillId: string): Promise<DispatchCandidate[]> {
    const { candidates } = await this.rankCandidates(companyId, waybillId, { maxCandidates: 10 });
    return candidates;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ATOMIC ASSIGNMENT
  // ══════════════════════════════════════════════════════════════════════════

  async dispatch(
    companyId: string,
    waybillId: string,
    opts?: { mode?: DispatchMode; maxCandidates?: number },
  ): Promise<AutoDispatchResult> {
    const mode = opts?.mode || 'INTELLIGENT';
    const maxCandidates = opts?.maxCandidates || 10;

    // Read-only pass: decides whether there is anything to assign at all.
    const ranked = await this.rankCandidates(companyId, waybillId, { maxCandidates });
    if (ranked.candidates.length === 0 || ranked.reason) {
      return {
        assigned: false,
        waybillId,
        trackingNumber: ranked.trackingNumber,
        selectedDriver: null,
        candidates: ranked.candidates,
        mode,
        reason: ranked.reason ?? 'No suitable driver found (all scores below threshold)',
      };
    }

    const selected = ranked.candidates[0];
    if (selected.score < MINIMUM_SCORE) {
      return {
        assigned: false,
        waybillId,
        trackingNumber: ranked.trackingNumber,
        selectedDriver: null,
        candidates: ranked.candidates,
        mode,
        reason: 'No suitable driver found (all scores below threshold)',
      };
    }

    try {
      // ── ONE transaction: claim the waybill, then write the shipment ───────
      await this.prisma.$transaction(async (tx) => {
        // Compare-and-set on the waybill status. The UPDATE takes a row lock,
        // so a concurrent dispatcher re-evaluates this WHERE after we commit
        // and gets 0 rows — the race is closed by the database, not by luck.
        const claim = await tx.waybill.updateMany({
          where: {
            id: waybillId,
            companyId,
            status: { in: DISPATCHABLE_WAYBILL_STATUSES as any },
          },
          data: { status: 'OUT_FOR_DELIVERY' },
        });

        if (claim.count === 0) {
          throw new ConflictException(
            'Waybill is no longer assignable — it was dispatched or closed by another job',
          );
        }

        // One active shipment per waybill. A PENDING shipment (e.g. the
        // collecting driver's custody record) may be handed over to the
        // assigned driver inside this transaction; an IN_TRANSIT shipment for a
        // different driver is a genuine conflict and must be resolved
        // deliberately, not overwritten by a background job.
        const existing = await tx.shipment.findFirst({
          where: { waybillId, companyId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, driverId: true, status: true },
        });

        if (
          existing &&
          existing.driverId &&
          existing.driverId !== selected.driverId &&
          existing.status === 'IN_TRANSIT'
        ) {
          throw new ConflictException(
            'Waybill is already being delivered by another driver — use the reassignment flow',
          );
        }

        if (existing) {
          await tx.shipment.update({
            where: { id: existing.id },
            data: { driverId: selected.driverId, status: 'PENDING' },
          });
        } else {
          await tx.shipment.create({
            data: {
              waybillId,
              driverId: selected.driverId,
              companyId,
              status: 'PENDING',
            },
          });
        }

        // Audit trail: who got the parcel, decided by which engine.
        await tx.trackingEvent.create({
          data: {
            waybillId,
            companyId,
            event: 'OUT_FOR_DELIVERY',
            status: 'OUT_FOR_DELIVERY',
            description: `Auto-dispatched to ${selected.driverName} (score ${selected.score}, ${selected.distanceKm}km).`,
            actorType: 'SYSTEM',
            actorName: `AUTO_DISPATCH:${mode}`,
            metadata: {
              mode,
              driverId: selected.driverId,
              score: selected.score,
              distanceKm: selected.distanceKm,
              currentLoad: selected.currentLoad,
              areaSuccessRate: selected.areaSuccessRate,
              complianceWarnings: selected.complianceWarnings ?? [],
            },
          },
        });
      });

      this.logger.log(
        `Auto-dispatched ${ranked.trackingNumber} → ${selected.driverName} (score: ${selected.score}, ${selected.distanceKm}km)`,
      );

      return {
        assigned: true,
        waybillId,
        trackingNumber: ranked.trackingNumber,
        selectedDriver: selected,
        candidates: ranked.candidates.slice(0, maxCandidates),
        mode,
        reason: `Assigned to ${selected.driverName} (score: ${selected.score})`,
      };
    } catch (err: any) {
      if (err instanceof ConflictException) {
        return {
          assigned: false,
          waybillId,
          trackingNumber: ranked.trackingNumber,
          selectedDriver: null,
          candidates: ranked.candidates.slice(0, maxCandidates),
          mode,
          reason: err.message,
        };
      }
      throw err;
    }
  }

  /**
   * Batch auto-dispatch. Sequential on purpose: each waybill's claim is its own
   * transaction, and two jobs overlapping on the same waybill are resolved by
   * the compare-and-set above rather than by batching them together.
   */
  async batchDispatch(
    companyId: string,
    waybillIds: string[],
    mode?: DispatchMode,
  ): Promise<{ results: AutoDispatchResult[]; summary: any }> {
    const results: AutoDispatchResult[] = [];

    for (const waybillId of waybillIds) {
      const result = await this.dispatch(companyId, waybillId, { mode });
      results.push(result);
    }

    const assigned = results.filter((r) => r.assigned).length;
    const failed = results.filter((r) => !r.assigned).length;

    return {
      results,
      summary: {
        total: waybillIds.length,
        assigned,
        failed,
        // 0/0 must not be reported as "100% helped" or "0% failed": no attempts
        // means no rate at all.
        successRate: waybillIds.length > 0 ? Math.round((assigned / waybillIds.length) * 100) : null,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DATA LOADERS
  // ══════════════════════════════════════════════════════════════════════════

  /** Compliance snapshots for a candidate list, tenant-scoped, in one query. */
  private async loadComplianceSnapshots(
    companyId: string,
    driverIds: string[],
  ): Promise<Array<DriverComplianceSnapshot | null>> {
    if (driverIds.length === 0) return [];

    const rows = await this.prisma.driver.findMany({
      where: { id: { in: driverIds }, companyId },
      select: {
        id: true,
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

    // Critical safety alerts, grouped in one query.
    let alertsByDriver = new Map<string, number>();
    try {
      const grouped = await (this.prisma as any).safetyAlert.groupBy({
        by: ['driverId'],
        where: {
          companyId,
          driverId: { in: driverIds },
          riskLevel: 'CRITICAL',
          acknowledged: false,
        },
        _count: { _all: true },
      });
      alertsByDriver = new Map(
        (grouped as Array<{ driverId: string; _count: { _all: number } }>).map((g) => [
          g.driverId,
          g._count._all,
        ]),
      );
    } catch (err: any) {
      this.logger.warn(`Safety-alert lookup failed during dispatch: ${err?.message ?? err}`);
    }

    return rows.map((row) => ({
      driverId: row.id,
      companyId: row.companyId,
      isActive: row.isActive,
      status: row.status,
      licenseExpiry: row.licenseExpiry,
      insuranceExpiry: row.insuranceExpiry,
      backgroundCheckExpiry: row.backgroundCheckExpiry,
      nextServiceDate: row.nextServiceDate,
      currentKm: row.currentKm,
      nextServiceKm: row.nextServiceKm,
      complianceHold: row.complianceHold,
      complianceHoldReason: row.complianceHoldReason,
      criticalSafetyAlerts: alertsByDriver.get(row.id) ?? 0,
    }));
  }

  /**
   * Real delivery success rate per driver over the last 90 days:
   * DELIVERED / (DELIVERED + FAILED) on that driver's shipments.
   * Drivers with no completed deliveries are absent from the map (no rate).
   */
  private async driverSuccessRates(
    companyId: string,
    driverIds: string[],
  ): Promise<Map<string, number>> {
    if (driverIds.length === 0) return new Map();

    const since = new Date(Date.now() - SUCCESS_RATE_WINDOW_DAYS * 86_400_000);
    const groups = await this.prisma.shipment.groupBy({
      by: ['driverId', 'status'],
      where: {
        companyId,
        driverId: { in: driverIds },
        status: { in: ['DELIVERED', 'FAILED'] as any },
        updatedAt: { gte: since },
      },
      _count: { _all: true },
    });

    const delivered = new Map<string, number>();
    const failed = new Map<string, number>();
    for (const group of groups) {
      const key = group.driverId as string;
      if (!key) continue;
      if (group.status === 'DELIVERED') delivered.set(key, group._count._all);
      if (group.status === 'FAILED') failed.set(key, group._count._all);
    }

    const rates = new Map<string, number>();
    for (const driverId of new Set([...delivered.keys(), ...failed.keys()])) {
      const ok = delivered.get(driverId) ?? 0;
      const bad = failed.get(driverId) ?? 0;
      if (ok + bad === 0) continue;
      rates.set(driverId, Math.round((ok / (ok + bad)) * 100));
    }
    return rates;
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}
