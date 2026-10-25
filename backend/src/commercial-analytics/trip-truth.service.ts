import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommercialAnalyticsService } from './commercial-analytics.service';
import { NotificationsService } from '../notifications/notifications.service';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** UTC calendar-day key — driver-day pools bucket by this, on both sides. */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Straight-line sender→recipient distance. An estimate input, never truth. */
function haversineKm(
  lat1?: number | null, lng1?: number | null,
  lat2?: number | null, lng2?: number | null,
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return round1(2 * R * Math.asin(Math.sqrt(a)));
}

type DeliveredWaybill = {
  id: string;
  trackingNumber: string;
  totalAmount: number | null;
  senderName: string;
  senderAddress: string;
  recipientAddress: string;
  senderLat: number | null;
  senderLng: number | null;
  recipientLat: number | null;
  recipientLng: number | null;
  weight: number | null;
  podDeliveredAt: Date | null;
  updatedAt: Date;
  manifestWaybills: { manifest: { driverId: string | null } }[];
};

type CostAcc = {
  fuel: number;
  tolls: number;
  other: number;
  entryIds: Set<string>;
  hasDirect: boolean;
  hasAllocated: boolean;
  methods: Set<string>;
};

/**
 * Trip Truth — the allocation engine (roadmap Slice 2).
 *
 * Turns recorded TripCostEntry rows (Slice 1) into a true cost per delivered
 * waybill, written to DeliveryCostAllocation with an explicit provenance:
 *
 *  - MEASURED  — every cent comes from entries recorded against the trip
 *    (direct waybill entries; pools may contribute only via ALLOCATED).
 *  - ALLOCATED — recorded entries shared across trips were split by a
 *    stated rule: manifest-linked entries split across that manifest's
 *    delivered waybills, and driver entries with no trip link split across
 *    the waybills that driver delivered the same (UTC) day. Splits are
 *    weight-proportional; a waybill without recorded weight counts as 1.
 *  - ESTIMATED — no recorded costs reached this trip, so the CommercialConfig
 *    rate model fills the row. Flagged, itemised, and never blended into
 *    measured totals by the readers in this service.
 *
 * Recorded entries that cannot be tied to any delivered trip (e.g. fuel
 * logged on a day the driver delivered nothing) are reported as
 * unallocated — visible, never smeared across other trips.
 *
 * Deliberately NOT costed in v1: labour/vehicle/overhead on measured rows
 * stay 0 until they are captured per trip; adding config-rate guesses to a
 * "measured" row would corrupt the very truth this engine exists to keep.
 * Recompute is idempotent (upsert by waybill) and safe to re-run.
 */
@Injectable()
export class TripTruthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commercial: CommercialAnalyticsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Recompute ────────────────────────────────────────────────────────────

  async recompute(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();
    const { start, end } = this.periodRange(targetPeriod);
    const cfg = await this.commercial.getConfig(companyId);

    const delivered = await this.findDelivered(companyId, start, end);
    const deliveredIds = new Set(delivered.map((w) => w.id));
    const deliveredAt = new Map(delivered.map((w) => [w.id, w.podDeliveredAt ?? w.updatedAt]));
    const driverOf = new Map<string, string | null>(
      delivered.map((w) => [w.id, w.manifestWaybills.find((m) => m.manifest.driverId)?.manifest.driverId ?? null]),
    );
    const weightOf = new Map(delivered.map((w) => [w.id, w.weight && w.weight > 0 ? w.weight : 1]));

    const acc = new Map<string, CostAcc>();
    const accFor = (id: string): CostAcc => {
      let a = acc.get(id);
      if (!a) {
        a = { fuel: 0, tolls: 0, other: 0, entryIds: new Set(), hasDirect: false, hasAllocated: false, methods: new Set() };
        acc.set(id, a);
      }
      return a;
    };
    const addEntry = (waybillId: string, e: { id: string; type: string; amount: number }, direct: boolean, method: string) => {
      const a = accFor(waybillId);
      if (e.type === 'FUEL') a.fuel += e.amount;
      else if (e.type === 'TOLL') a.tolls += e.amount;
      else a.other += e.amount;
      a.entryIds.add(e.id);
      if (direct) a.hasDirect = true;
      else a.hasAllocated = true;
      a.methods.add(method);
    };

    // All entries that could belong to this period's trips: directly linked
    // to a delivered waybill (whenever recorded — the entry names the trip),
    // or recorded inside the period (pool candidates).
    const entries = await this.prisma.tripCostEntry.findMany({
      where: {
        companyId,
        OR: [{ waybillId: { in: [...deliveredIds] } }, { occurredAt: { gte: start, lt: end } }],
      },
      select: { id: true, driverId: true, waybillId: true, manifestId: true, type: true, amount: true, occurredAt: true },
    });

    let unallocatedCost = 0;
    let unallocatedEntries = 0;
    const markUnallocated = (amount: number) => {
      unallocatedCost += amount;
      unallocatedEntries += 1;
    };

    // (a) Direct entries — the strongest evidence.
    for (const e of entries) {
      if (e.waybillId && deliveredIds.has(e.waybillId)) {
        addEntry(e.waybillId, e, true, 'direct entry');
      }
    }

    // (b) Manifest pools — entries recorded against a whole run.
    const manifestPools = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!e.waybillId && e.manifestId) {
        const list = manifestPools.get(e.manifestId) ?? [];
        list.push(e);
        manifestPools.set(e.manifestId, list);
      }
    }
    if (manifestPools.size > 0) {
      const links = await this.prisma.manifestWaybill.findMany({
        where: { manifestId: { in: [...manifestPools.keys()] } },
        select: { manifestId: true, waybillId: true },
      });
      const manifestTrips = new Map<string, string[]>();
      for (const l of links) {
        if (!deliveredIds.has(l.waybillId)) continue;
        const list = manifestTrips.get(l.manifestId) ?? [];
        list.push(l.waybillId);
        manifestTrips.set(l.manifestId, list);
      }
      for (const [manifestId, pool] of manifestPools) {
        const trips = manifestTrips.get(manifestId) ?? [];
        if (trips.length === 0) {
          for (const e of pool) markUnallocated(e.amount);
          continue;
        }
        const totalWeight = trips.reduce((s, id) => s + (weightOf.get(id) ?? 1), 0);
        for (const e of pool) {
          for (const id of trips) {
            addEntry(id, { ...e, amount: (e.amount * (weightOf.get(id) ?? 1)) / totalWeight }, false, 'manifest share');
          }
        }
      }
    }

    // (c) Driver-day pools — fuel/tolls a driver logged with no trip link,
    // split across what that driver delivered that (UTC) day.
    const dayPools = new Map<string, typeof entries>();
    for (const e of entries) {
      if (e.waybillId || e.manifestId) continue;
      const key = `${e.driverId}|${dayKey(e.occurredAt)}`;
      const list = dayPools.get(key) ?? [];
      list.push(e);
      dayPools.set(key, list);
    }
    const tripsByDriverDay = new Map<string, string[]>();
    for (const w of delivered) {
      const driverId = driverOf.get(w.id);
      if (!driverId) continue;
      const key = `${driverId}|${dayKey(deliveredAt.get(w.id)!)}`;
      const list = tripsByDriverDay.get(key) ?? [];
      list.push(w.id);
      tripsByDriverDay.set(key, list);
    }
    for (const [key, pool] of dayPools) {
      const trips = tripsByDriverDay.get(key) ?? [];
      if (trips.length === 0) {
        for (const e of pool) markUnallocated(e.amount);
        continue;
      }
      const totalWeight = trips.reduce((s, id) => s + (weightOf.get(id) ?? 1), 0);
      for (const e of pool) {
        for (const id of trips) {
          addEntry(id, { ...e, amount: (e.amount * (weightOf.get(id) ?? 1)) / totalWeight }, false, 'driver-day share');
        }
      }
    }

    // Existing exception states, so recompute preserves acknowledgements
    // and only notifies on a genuine transition into below-cost.
    const existingRows = await this.prisma.deliveryCostAllocation.findMany({
      where: { companyId, waybillId: { in: [...deliveredIds] } },
      select: { waybillId: true, exceptionStatus: true },
    });
    const existingException = new Map(existingRows.map((r) => [r.waybillId, r.exceptionStatus]));

    // Write one allocation per delivered waybill.
    const counts = { MEASURED: 0, ALLOCATED: 0, ESTIMATED: 0 };
    let recordedCost = 0;
    let estimatedCostTotal = 0;
    const computed: { waybillId: string; trackingNumber: string; provenance: string; grossMargin: number }[] = [];
    const writes = delivered.map((w) => {
      const a = acc.get(w.id);
      const recorded = a ? a.fuel + a.tolls + a.other : 0;
      const revenue = w.totalAmount ?? 0;
      const distanceKm = haversineKm(w.senderLat, w.senderLng, w.recipientLat, w.recipientLng);

      let data: Record<string, unknown>;
      if (a && recorded > 0) {
        const provenance = a.hasAllocated ? 'ALLOCATED' : 'MEASURED';
        counts[provenance] += 1;
        recordedCost += recorded;
        const totalCost = round2(recorded);
        data = {
          fuelCost: round2(a.fuel),
          labourCost: 0,
          vehicleCost: 0,
          overheadCost: 0,
          tollsCost: round2(a.tolls),
          otherCost: round2(a.other),
          totalCost,
          grossMargin: round2(revenue - totalCost),
          marginPercent: revenue > 0 ? round1(((revenue - totalCost) / revenue) * 100) : 0,
          provenance,
          sourceEntryCount: a.entryIds.size,
          allocationNote: [...a.methods].join(' + '),
        };
      } else {
        counts.ESTIMATED += 1;
        const km = distanceKm ?? cfg.avgKmPerDelivery;
        const fuel = cfg.fuelCostPerKm * km;
        const vehicle = cfg.vehicleCostPerKm * km;
        const labour = cfg.driverHourlyCost * (cfg.avgDeliveryMinutes / 60);
        const totalCost = round2(fuel + vehicle + labour + cfg.overheadPerDelivery);
        estimatedCostTotal += totalCost;
        data = {
          fuelCost: round2(fuel),
          labourCost: round2(labour),
          vehicleCost: round2(vehicle),
          overheadCost: round2(cfg.overheadPerDelivery),
          tollsCost: 0,
          otherCost: 0,
          totalCost,
          grossMargin: round2(revenue - totalCost),
          marginPercent: revenue > 0 ? round1(((revenue - totalCost) / revenue) * 100) : 0,
          provenance: 'ESTIMATED',
          sourceEntryCount: 0,
          allocationNote: `no recorded costs — config-rate estimate over ${km} km`,
        };
      }

      computed.push({
        waybillId: w.id,
        trackingNumber: w.trackingNumber,
        provenance: String((data as { provenance: string }).provenance),
        grossMargin: (data as { grossMargin: number }).grossMargin,
      });

      const base = {
        period: targetPeriod,
        revenue,
        fromZone: w.senderAddress,
        toZone: w.recipientAddress,
        distanceKm,
        driverId: driverOf.get(w.id) ?? null,
        clientName: w.senderName,
        ...(data as object),
      };
      return this.prisma.deliveryCostAllocation.upsert({
        where: { waybillId: w.id },
        create: { companyId, waybillId: w.id, ...base },
        update: base,
      });
    });
    // Sequential chunks: a failed write leaves earlier rows valid and a
    // re-run converges (upserts are idempotent).
    for (let i = 0; i < writes.length; i += 200) {
      await Promise.all(writes.slice(i, i + 200));
    }

    // ── Below-cost exception lifecycle (Slice 3) ──────────────────────────
    // Only MEASURED/ALLOCATED trips can raise an exception: acting on an
    // estimate would mean acting on a guess. A trip that recovers (margin
    // back above water, or evidence changes) auto-resolves. Notifications
    // fire once per transition into OPEN — never per recompute.
    const now = new Date();
    const newlyOpened: typeof computed = [];
    const exceptionWrites: Promise<unknown>[] = [];
    for (const c of computed) {
      const prev = existingException.get(c.waybillId) ?? null;
      const belowCost =
        (c.provenance === 'MEASURED' || c.provenance === 'ALLOCATED') && c.grossMargin < 0;
      if (belowCost && (prev === null || prev === 'RESOLVED')) {
        exceptionWrites.push(
          this.prisma.deliveryCostAllocation.updateMany({
            where: { waybillId: c.waybillId, companyId },
            data: { exceptionStatus: 'OPEN', exceptionAt: now, exceptionBy: null, exceptionNote: null },
          }),
        );
        newlyOpened.push(c);
      } else if (!belowCost && (prev === 'OPEN' || prev === 'ACKNOWLEDGED')) {
        exceptionWrites.push(
          this.prisma.deliveryCostAllocation.updateMany({
            where: { waybillId: c.waybillId, companyId },
            data: { exceptionStatus: 'RESOLVED', exceptionAt: now, exceptionBy: null },
          }),
        );
      }
    }
    await Promise.all(exceptionWrites);

    if (newlyOpened.length > 0) {
      const worst = newlyOpened.reduce((a, b) => (b.grossMargin < a.grossMargin ? b : a));
      await this.notifications.broadcast(
        companyId,
        newlyOpened.length === 1
          ? 'A measured trip landed below cost'
          : `${newlyOpened.length} measured trips landed below cost`,
        `Trip Truth (${targetPeriod}): worst is ${worst.trackingNumber} at ` +
          `${worst.grossMargin.toFixed(2)} margin on recorded costs. Open ` +
          'Commercial Analytics → Trip Truth to acknowledge and act.',
        'warning',
        '/commercial-analytics?tab=truth',
      );
    }

    const exceptionsOpen = await this.prisma.deliveryCostAllocation.count({
      where: { companyId, period: targetPeriod, exceptionStatus: { in: ['OPEN', 'ACKNOWLEDGED'] } },
    });

    return {
      period: targetPeriod,
      computedAt: new Date().toISOString(),
      trips: delivered.length,
      measured: counts.MEASURED,
      allocated: counts.ALLOCATED,
      estimated: counts.ESTIMATED,
      recordedCost: round2(recordedCost),
      estimatedCost: round2(estimatedCostTotal),
      unallocatedCost: round2(unallocatedCost),
      unallocatedEntries,
      exceptionsOpened: newlyOpened.length,
      exceptionsOpen,
    };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  async listTrips(
    companyId: string,
    query: { period?: string; belowCostOnly?: boolean; provenance?: string; limit?: number; offset?: number },
  ) {
    const targetPeriod = query.period || this.currentPeriod();
    const { start, end } = this.periodRange(targetPeriod);

    const where: Record<string, unknown> = { companyId, period: targetPeriod };
    if (query.belowCostOnly) where.grossMargin = { lt: 0 };
    if (query.provenance === 'MEASURED' || query.provenance === 'ALLOCATED' || query.provenance === 'ESTIMATED') {
      where.provenance = query.provenance;
    }

    const limit = Math.min(200, Math.max(1, query.limit ?? 100));
    const offset = Math.max(0, query.offset ?? 0);

    const [rows, filteredTotal, periodRows, delivered] = await Promise.all([
      this.prisma.deliveryCostAllocation.findMany({
        where,
        orderBy: [{ grossMargin: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.deliveryCostAllocation.count({ where }),
      this.prisma.deliveryCostAllocation.findMany({
        where: { companyId, period: targetPeriod },
        select: { waybillId: true, provenance: true, revenue: true, totalCost: true, grossMargin: true },
      }),
      this.findDelivered(companyId, start, end, true),
    ]);

    const tracking = new Map<string, string>();
    if (rows.length > 0) {
      const waybills = await this.prisma.waybill.findMany({
        where: { id: { in: rows.map((r) => r.waybillId) }, companyId },
        select: { id: true, trackingNumber: true },
      });
      for (const w of waybills) tracking.set(w.id, w.trackingNumber);
    }

    const sum = (list: typeof periodRows) => ({
      trips: list.length,
      revenue: round2(list.reduce((s, r) => s + r.revenue, 0)),
      cost: round2(list.reduce((s, r) => s + r.totalCost, 0)),
      margin: round2(list.reduce((s, r) => s + r.grossMargin, 0)),
    });
    const measuredRows = periodRows.filter((r) => r.provenance === 'MEASURED' || r.provenance === 'ALLOCATED');
    const estimatedRows = periodRows.filter((r) => r.provenance === 'ESTIMATED');
    const computedIds = new Set(periodRows.map((r) => r.waybillId));

    return {
      period: targetPeriod,
      computedAt: rows.length > 0 ? rows.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), rows[0].updatedAt).toISOString() : null,
      trips: rows.map((r) => ({ ...r, trackingNumber: tracking.get(r.waybillId) ?? null })),
      total: filteredTotal,
      summary: {
        // Headline truth: measured + allocated only. Estimates are reported
        // alongside, never blended in.
        measured: sum(measuredRows),
        estimated: sum(estimatedRows),
        deliveredNotComputed: delivered.filter((w) => !computedIds.has(w.id)).length,
      },
    };
  }

  async getTrip(companyId: string, waybillId: string) {
    const allocation = await this.prisma.deliveryCostAllocation.findFirst({
      where: { waybillId, companyId },
    });
    if (!allocation) throw new NotFoundException('No computed cost for this trip yet — run Recompute');

    const waybill = await this.prisma.waybill.findFirst({
      where: { id: waybillId, companyId },
      select: {
        id: true, trackingNumber: true, status: true, senderName: true,
        podDeliveredAt: true, updatedAt: true,
        manifestWaybills: { select: { manifestId: true, manifest: { select: { driverId: true } } } },
      },
    });
    if (!waybill) throw new NotFoundException('Waybill not found');

    const deliveredAt = waybill.podDeliveredAt ?? waybill.updatedAt;
    const manifestIds = waybill.manifestWaybills.map((m) => m.manifestId);
    const driverId = allocation.driverId
      ?? waybill.manifestWaybills.find((m) => m.manifest.driverId)?.manifest.driverId
      ?? null;

    const entrySelect = {
      id: true, type: true, amount: true, litres: true, odometerKm: true,
      note: true, occurredAt: true, source: true, driverId: true,
    } as const;

    const [direct, manifestPool, driverDayPool] = await Promise.all([
      this.prisma.tripCostEntry.findMany({
        where: { companyId, waybillId },
        select: entrySelect,
        orderBy: { occurredAt: 'asc' },
      }),
      manifestIds.length > 0
        ? this.prisma.tripCostEntry.findMany({
            where: { companyId, manifestId: { in: manifestIds }, waybillId: null },
            select: entrySelect,
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
      driverId
        ? this.prisma.tripCostEntry.findMany({
            where: {
              companyId,
              driverId,
              waybillId: null,
              manifestId: null,
              occurredAt: {
                gte: new Date(`${dayKey(deliveredAt)}T00:00:00.000Z`),
                lt: new Date(`${dayKey(deliveredAt)}T23:59:59.999Z`),
              },
            },
            select: entrySelect,
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    return {
      allocation,
      waybill: {
        id: waybill.id,
        trackingNumber: waybill.trackingNumber,
        status: waybill.status,
        clientName: waybill.senderName,
        deliveredAt: deliveredAt.toISOString(),
      },
      sources: {
        direct,
        manifestPool,
        driverDayPool,
      },
    };
  }

  // ── Below-cost exception queue (Slice 3) ─────────────────────────────────

  async listExceptions(companyId: string, query: { period?: string; status?: string }) {
    const targetPeriod = query.period || this.currentPeriod();
    const statuses = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];
    const where: Record<string, unknown> = {
      companyId,
      period: targetPeriod,
      exceptionStatus: query.status && statuses.includes(query.status)
        ? query.status
        : { in: ['OPEN', 'ACKNOWLEDGED'] },
    };
    const [rows, openCount, ackCount] = await Promise.all([
      this.prisma.deliveryCostAllocation.findMany({
        where,
        orderBy: [{ exceptionAt: 'desc' }],
        take: 100,
      }),
      this.prisma.deliveryCostAllocation.count({
        where: { companyId, period: targetPeriod, exceptionStatus: 'OPEN' },
      }),
      this.prisma.deliveryCostAllocation.count({
        where: { companyId, period: targetPeriod, exceptionStatus: 'ACKNOWLEDGED' },
      }),
    ]);

    const tracking = new Map<string, string>();
    if (rows.length > 0) {
      const waybills = await this.prisma.waybill.findMany({
        where: { id: { in: rows.map((r) => r.waybillId) }, companyId },
        select: { id: true, trackingNumber: true },
      });
      for (const w of waybills) tracking.set(w.id, w.trackingNumber);
    }

    return {
      period: targetPeriod,
      exceptions: rows.map((r) => ({ ...r, trackingNumber: tracking.get(r.waybillId) ?? null })),
      counts: { open: openCount, acknowledged: ackCount },
    };
  }

  async updateException(
    companyId: string,
    waybillId: string,
    dto: { status?: string; note?: string },
    actorId?: string,
  ) {
    const status = String(dto?.status ?? '').toUpperCase();
    if (!['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].includes(status)) {
      throw new BadRequestException('status must be OPEN, ACKNOWLEDGED or RESOLVED');
    }
    const existing = await this.prisma.deliveryCostAllocation.findFirst({
      where: { waybillId, companyId },
      select: { id: true, exceptionStatus: true, exceptionNote: true },
    });
    if (!existing || !existing.exceptionStatus) {
      throw new NotFoundException('No below-cost exception recorded for this trip');
    }
    await this.prisma.deliveryCostAllocation.updateMany({
      where: { waybillId, companyId },
      data: {
        exceptionStatus: status as 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED',
        exceptionNote:
          typeof dto.note === 'string' && dto.note.trim()
            ? dto.note.trim().slice(0, 500)
            : existing.exceptionNote,
        exceptionBy: actorId ?? null,
        exceptionAt: new Date(),
      },
    });
    return this.prisma.deliveryCostAllocation.findFirst({ where: { waybillId, companyId } });
  }

  // ── Per-truck month-end pack + loaded/empty km (Slices 4–5) ─────────────

  /**
   * One honest page per truck per month, rolled up from the SAME allocation
   * rows Trip Truth shows per trip — nothing here re-derives numbers by a
   * different route, so the pack always reconciles with the trip list.
   *
   * Money rules: revenue/cost/margin headline figures use MEASURED +
   * ALLOCATED trips only; estimated trips are counted and totalled apart.
   * Workshop/service spend (VehicleService records, scoped via company
   * drivers — the table has no companyId) is a separate line, and
   * netMargin = tripMargin − serviceCost. A truck can look fine per trip
   * and still lose money at the workshop; owners deserve both numbers.
   *
   * Kilometre rules (Slice 5): loaded km = Σ straight-line sender→recipient
   * distance over delivered trips with coordinates (labelled as such —
   * road km is longer). Total km evidence = odometer readings logged with
   * trip costs and services in the period; empty km = odometer span −
   * loaded km, shown ONLY when both sides are measured, and labelled an
   * upper bound (loaded is straight-line). Where evidence is missing the
   * pack says "not measured" — it never invents an empty-km figure.
   */
  async getTruckPack(companyId: string, period?: string) {
    const targetPeriod = period || this.currentPeriod();
    const { start, end } = this.periodRange(targetPeriod);

    const [rows, companyDrivers, readings] = await Promise.all([
      this.prisma.deliveryCostAllocation.findMany({ where: { companyId, period: targetPeriod } }),
      this.prisma.driver.findMany({ where: { companyId }, select: { id: true } }),
      this.prisma.tripCostEntry.findMany({
        where: { companyId, occurredAt: { gte: start, lt: end }, odometerKm: { not: null } },
        select: { driverId: true, odometerKm: true },
      }),
    ]);
    const companyDriverIds = companyDrivers.map((d) => d.id);

    const services = companyDriverIds.length
      ? await this.prisma.vehicleService.findMany({
          where: { driverId: { in: companyDriverIds }, servicedAt: { gte: start, lt: end } },
          select: { driverId: true, cost: true, kmAtService: true },
        })
      : [];

    // Odometer evidence per driver: fuel-entry readings + service readings.
    const readingsByDriver = new Map<string, number[]>();
    const addReading = (driverId: string, km: number | null) => {
      if (km == null) return;
      const list = readingsByDriver.get(driverId) ?? [];
      list.push(km);
      readingsByDriver.set(driverId, list);
    };
    for (const r of readings) addReading(r.driverId, r.odometerKm);
    for (const s of services) addReading(s.driverId, s.kmAtService);

    const serviceByDriver = new Map<string, { cost: number; events: number }>();
    for (const s of services) {
      const agg = serviceByDriver.get(s.driverId) ?? { cost: 0, events: 0 };
      agg.cost += s.cost ?? 0;
      agg.events += 1;
      serviceByDriver.set(s.driverId, agg);
    }

    type TruckAcc = {
      driverId: string;
      trips: number;
      measuredTrips: number;
      estimatedTrips: number;
      revenue: number;
      recordedCost: number;
      estimatedRevenue: number;
      estimatedCost: number;
      tripsWithDistance: number;
      loadedKm: number;
      belowCostTrips: number;
      openExceptions: number;
      worstTripMargin: number | null;
    };
    const blank = (driverId: string): TruckAcc => ({
      driverId, trips: 0, measuredTrips: 0, estimatedTrips: 0,
      revenue: 0, recordedCost: 0, estimatedRevenue: 0, estimatedCost: 0,
      tripsWithDistance: 0, loadedKm: 0, belowCostTrips: 0, openExceptions: 0,
      worstTripMargin: null,
    });
    const trucks = new Map<string, TruckAcc>();
    const unassigned = blank('__unassigned__');

    for (const r of rows) {
      const acc = r.driverId ? (trucks.get(r.driverId) ?? blank(r.driverId)) : unassigned;
      if (r.driverId) trucks.set(r.driverId, acc);
      acc.trips += 1;
      const measured = r.provenance === 'MEASURED' || r.provenance === 'ALLOCATED';
      if (measured) {
        acc.measuredTrips += 1;
        acc.revenue += r.revenue;
        acc.recordedCost += r.totalCost;
        if (r.grossMargin < 0) acc.belowCostTrips += 1;
        acc.worstTripMargin =
          acc.worstTripMargin === null ? r.grossMargin : Math.min(acc.worstTripMargin, r.grossMargin);
      } else if (r.provenance === 'ESTIMATED') {
        acc.estimatedTrips += 1;
        acc.estimatedRevenue += r.revenue;
        acc.estimatedCost += r.totalCost;
      }
      if (r.distanceKm != null) {
        acc.tripsWithDistance += 1;
        acc.loadedKm += r.distanceKm;
      }
      if (r.exceptionStatus === 'OPEN' || r.exceptionStatus === 'ACKNOWLEDGED') {
        acc.openExceptions += 1;
      }
    }
    // Trucks with workshop spend or readings but no delivered trips still
    // belong in the pack — an idle truck at the workshop is a cost centre.
    for (const driverId of serviceByDriver.keys()) {
      if (!trucks.has(driverId)) trucks.set(driverId, blank(driverId));
    }

    const driverIds = [...trucks.keys()];
    const driverDetails = driverIds.length
      ? await this.prisma.driver.findMany({
          where: { companyId, id: { in: driverIds } },
          select: { id: true, name: true, vehicleReg: true },
        })
      : [];
    const detailOf = new Map(driverDetails.map((d) => [d.id, d]));

    const pack = [...trucks.values()].map((acc) => {
      const detail = detailOf.get(acc.driverId);
      const svc = serviceByDriver.get(acc.driverId) ?? { cost: 0, events: 0 };
      const tripMargin = round2(acc.revenue - acc.recordedCost);
      const loadedKm = acc.tripsWithDistance > 0 ? round1(acc.loadedKm) : null;

      const readingsList = readingsByDriver.get(acc.driverId) ?? [];
      const span =
        readingsList.length >= 2
          ? Math.max(...readingsList) - Math.min(...readingsList)
          : null;
      let km: {
        status: 'MEASURED' | 'PARTIAL' | 'NOT_MEASURED';
        loadedKm: number | null;
        odometerSpanKm: number | null;
        readings: number;
        emptyKm: number | null;
        emptyPct: number | null;
        note: string;
      };
      if (span === null || span <= 0) {
        km = {
          status: 'NOT_MEASURED', loadedKm, odometerSpanKm: null,
          readings: readingsList.length, emptyKm: null, emptyPct: null,
          note: 'No odometer span this period — log the odometer with fuel entries and empty km becomes measurable.',
        };
      } else if (loadedKm === null) {
        km = {
          status: 'PARTIAL', loadedKm: null, odometerSpanKm: span,
          readings: readingsList.length, emptyKm: null, emptyPct: null,
          note: 'Loaded km unknown — delivered trips lack sender/recipient coordinates, so empty km is not shown.',
        };
      } else if (span < loadedKm) {
        km = {
          status: 'PARTIAL', loadedKm, odometerSpanKm: span,
          readings: readingsList.length, emptyKm: null, emptyPct: null,
          note: `Odometer span (${span} km) is below loaded distance (${loadedKm} km) — readings are incomplete, so empty km is not shown rather than guessed.`,
        };
      } else {
        const emptyKm = round1(span - loadedKm);
        km = {
          status: 'MEASURED', loadedKm, odometerSpanKm: span,
          readings: readingsList.length, emptyKm,
          emptyPct: round1((emptyKm / span) * 100),
          note: 'Empty km is an upper bound: loaded distance is straight-line, real road distance is longer.',
        };
      }

      return {
        driverId: acc.driverId,
        driverName: detail?.name ?? 'Unknown driver',
        vehicleReg: detail?.vehicleReg ?? null,
        trips: acc.trips,
        measuredTrips: acc.measuredTrips,
        estimatedTrips: acc.estimatedTrips,
        revenue: round2(acc.revenue),
        recordedCost: round2(acc.recordedCost),
        tripMargin,
        marginPct: acc.revenue > 0 ? round1((tripMargin / acc.revenue) * 100) : 0,
        estimatedRevenue: round2(acc.estimatedRevenue),
        estimatedCost: round2(acc.estimatedCost),
        serviceCost: round2(svc.cost),
        serviceEvents: svc.events,
        netMargin: round2(tripMargin - svc.cost),
        costPerKm:
          loadedKm !== null && loadedKm > 0 && acc.recordedCost > 0
            ? {
                value: round2(acc.recordedCost / loadedKm),
                loadedKm,
                tripsWithDistance: acc.tripsWithDistance,
                trips: acc.trips,
              }
            : null,
        belowCostTrips: acc.belowCostTrips,
        openExceptions: acc.openExceptions,
        worstTripMargin: acc.worstTripMargin === null ? null : round2(acc.worstTripMargin),
        km,
      };
    });

    pack.sort((a, b) => a.netMargin - b.netMargin);

    const fleet = {
      trucks: pack.length,
      trips: pack.reduce((s, t) => s + t.trips, 0),
      measuredTrips: pack.reduce((s, t) => s + t.measuredTrips, 0),
      estimatedTrips: pack.reduce((s, t) => s + t.estimatedTrips, 0),
      revenue: round2(pack.reduce((s, t) => s + t.revenue, 0)),
      recordedCost: round2(pack.reduce((s, t) => s + t.recordedCost, 0)),
      tripMargin: round2(pack.reduce((s, t) => s + t.tripMargin, 0)),
      serviceCost: round2(pack.reduce((s, t) => s + t.serviceCost, 0)),
      netMargin: round2(pack.reduce((s, t) => s + t.netMargin, 0)),
    };

    return {
      period: targetPeriod,
      trucks: pack,
      unassigned:
        unassigned.trips > 0
          ? {
              trips: unassigned.trips,
              measuredTrips: unassigned.measuredTrips,
              estimatedTrips: unassigned.estimatedTrips,
              revenue: round2(unassigned.revenue),
              recordedCost: round2(unassigned.recordedCost),
              tripMargin: round2(unassigned.revenue - unassigned.recordedCost),
            }
          : null,
      fleet,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findDelivered(companyId: string, start: Date, end: Date): Promise<DeliveredWaybill[]>;
  private async findDelivered(companyId: string, start: Date, end: Date, idsOnly: true): Promise<{ id: string }[]>;
  private async findDelivered(companyId: string, start: Date, end: Date, idsOnly = false) {
    // A delivery counts in the period it was delivered: POD timestamp when
    // present, else the last status update. (The commercial dashboard keys
    // on createdAt; Trip Truth deliberately uses delivery time.)
    const where = {
      companyId,
      status: 'DELIVERED' as const,
      OR: [
        { podDeliveredAt: { gte: start, lt: end } },
        { podDeliveredAt: null, updatedAt: { gte: start, lt: end } },
      ],
    };
    if (idsOnly) {
      return this.prisma.waybill.findMany({ where, select: { id: true } });
    }
    return this.prisma.waybill.findMany({
      where,
      select: {
        id: true, trackingNumber: true, totalAmount: true, senderName: true,
        senderAddress: true, recipientAddress: true,
        senderLat: true, senderLng: true, recipientLat: true, recipientLng: true,
        weight: true, podDeliveredAt: true, updatedAt: true,
        manifestWaybills: { select: { manifest: { select: { driverId: true } } } },
      },
    }) as Promise<DeliveredWaybill[]>;
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private periodRange(period: string): { start: Date; end: Date } {
    const [year, month] = period.split('-').map(Number);
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
  }
}
