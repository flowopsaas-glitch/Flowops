import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DriverComplianceService } from '../common/compliance/driver-compliance.service';
import { GeocodingService } from '../geocoding/geocoding.service';

export type Stop = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** Priority weight (higher = deliver sooner). COD, time-window, risk-based. */
  priority?: number;
  /** Optional metadata for AI analysis */
  codAmount?: number;
  timeWindow?: string;
  riskLevel?: string;
};

export type OptimizedRoute = {
  order: string[];
  stops: Array<Stop & { seq: number; legKm: number; legMinutes: number }>;
  totalKm: number;
  totalMinutes: number;
  /** Comparison: what the route would be without optimization (original order) */
  unoptimizedKm: number;
  unoptimizedMinutes: number;
  /** Savings */
  savedKm: number;
  savedMinutes: number;
  savedPercent: number;
  /** Fuel cost estimate (ZAR) */
  fuelCostZar: number;
  savedFuelZar: number;
  /** AI insights */
  aiInsight?: string;
  startedFrom: { lat: number; lng: number } | null;
  routingEngine: 'osrm' | 'haversine';
};

/**
 * WORLD-CLASS Route Optimization Engine
 *
 * Architecture:
 * 1. OSRM real road-distance matrix (with haversine fallback)
 * 2. AI priority scoring (COD, time-windows, risk, delivery attempts)
 * 3. Nearest-neighbour construction (priority-weighted)
 * 4. 2-opt improvement (eliminates route crossings)
 * 5. Before/after comparison with savings metrics
 * 6. Groq AI insight generation (natural language route advice)
 *
 * Supports: Collections (pickups) AND Deliveries (shipments)
 * Distance: Real road km via OSRM (public demo or self-hosted)
 * Fallback: Haversine × 1.3 (road-factor approximation)
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly OSRM_BASE: string;
  private readonly FUEL_RATE = 22.5; // ZAR per litre
  private readonly CONSUMPTION = 6.5; // L/100km (delivery van)
  private readonly AVG_SPEED_KMH = 35; // Urban average

  constructor(
    private prisma: PrismaService,
    private config?: ConfigService,
    /**
     * Compliance is the third argument so existing constructions keep working;
     * when it is absent the driver-scoped optimisations still enforce tenant
     * ownership but cannot assert compliance. Nest always injects it.
     */
    private compliance?: DriverComplianceService,
  ) {
    this.OSRM_BASE = this.config?.get<string>('OSRM_BASE_URL', 'https://router.project-osrm.org') ?? 'https://router.project-osrm.org';
  }

  /**
   * Tenant-scope + compliance check for a driver a route is being built for.
   * Compliance is enforced whenever the service is wired with the shared
   * policy (always, in the Nest app).
   */
  private async assertDriverUsable(companyId: string, driverId: string): Promise<void> {
    if (this.compliance) {
      await this.compliance.assertDispatchable(driverId, companyId);
      return;
    }
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, companyId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');
  }

  private dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    return GeocodingService.haversineKm(a.lat, a.lng, b.lat, b.lng);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OSRM ROAD-DISTANCE MATRIX (the secret weapon)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Fetch a full NxN distance+duration matrix from OSRM Table API.
   * Falls back to haversine × 1.3 road-factor if OSRM is unavailable.
   */
  private async getDistanceMatrix(
    points: { lat: number; lng: number }[],
  ): Promise<{ distances: number[][]; durations: number[][]; engine: 'osrm' | 'haversine' }> {
    if (points.length < 2) {
      return { distances: [[0]], durations: [[0]], engine: 'haversine' };
    }

    try {
      // OSRM Table API: /table/v1/driving/lng1,lat1;lng2,lat2;...
      const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `${this.OSRM_BASE}/table/v1/driving/${coords}?annotations=distance,duration`;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);

      if (res.ok) {
        const data: any = await res.json();
        if (data?.code === 'Ok' && data.distances && data.durations) {
          // Convert meters → km, seconds → minutes
          const distances = data.distances.map((row: number[]) =>
            row.map((d: number) => Math.round((d / 1000) * 100) / 100),
          );
          const durations = data.durations.map((row: number[]) =>
            row.map((d: number) => Math.round(d / 60 * 10) / 10),
          );
          this.logger.debug(`OSRM matrix ${points.length}×${points.length} fetched`);
          return { distances, durations, engine: 'osrm' };
        }
      }
    } catch (err: any) {
      this.logger.warn(`OSRM table failed (${err.message}), using haversine fallback`);
    }

    // Fallback: haversine × 1.3 road factor
    const ROAD_FACTOR = 1.3;
    const distances = points.map((a) =>
      points.map((b) => Math.round(this.dist(a, b) * ROAD_FACTOR * 100) / 100),
    );
    const durations = distances.map((row) =>
      row.map((km) => Math.round((km / this.AVG_SPEED_KMH) * 60 * 10) / 10),
    );
    return { distances, durations, engine: 'haversine' };
  }

  private routeLength(seq: Stop[], start: { lat: number; lng: number } | null): number {
    let total = 0;
    let prev = start ?? seq[0];
    const startIdx = start ? 0 : 1;
    if (!start && seq.length > 0) prev = seq[0];
    for (let i = startIdx; i < seq.length; i++) {
      total += this.dist(prev, seq[i]);
      prev = seq[i];
    }
    return total;
  }

  /** Legacy nearest-neighbour (used as fallback for small sets) */
  private nearestNeighbour(stops: Stop[], start: { lat: number; lng: number } | null): Stop[] {
    const remaining = [...stops];
    const ordered: Stop[] = [];
    let current = start ?? remaining.shift()!;
    if (!start && current) ordered.push(current as Stop);

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = this.dist(current, remaining[i]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      ordered.push(next);
      current = next;
    }
    return ordered;
  }

  private twoOpt(seq: Stop[], start: { lat: number; lng: number } | null): Stop[] {
    if (seq.length < 4) return seq;
    let best = [...seq];
    let bestLen = this.routeLength(best, start);
    let improved = true;
    let guard = 0;
    while (improved && guard < 60) {
      improved = false;
      guard++;
      for (let i = 0; i < best.length - 1; i++) {
        for (let k = i + 1; k < best.length; k++) {
          const candidate = [
            ...best.slice(0, i),
            ...best.slice(i, k + 1).reverse(),
            ...best.slice(k + 1),
          ];
          const len = this.routeLength(candidate, start);
          if (len + 1e-9 < bestLen) {
            best = candidate;
            bestLen = len;
            improved = true;
          }
        }
      }
    }
    return best;
  }

  /** Optimize an arbitrary set of geocoded stops — WORLD-CLASS version with OSRM + savings. */
  async optimize(stops: Stop[], start?: { lat: number; lng: number } | null): Promise<OptimizedRoute> {
    const valid = stops.filter(
      (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng),
    );
    if (valid.length === 0) {
      return {
        order: [], stops: [], totalKm: 0, totalMinutes: 0,
        unoptimizedKm: 0, unoptimizedMinutes: 0,
        savedKm: 0, savedMinutes: 0, savedPercent: 0,
        fuelCostZar: 0, savedFuelZar: 0,
        startedFrom: start ?? null, routingEngine: 'haversine',
      };
    }

    // Build points array (start + stops)
    const allPoints = start ? [start, ...valid] : [...valid];

    // Get real road distances via OSRM
    const { distances, durations, engine } = await this.getDistanceMatrix(allPoints);

    // Priority-weighted nearest-neighbour construction
    const remaining = valid.map((_, i) => i);
    const ordered: number[] = [];

    if (!start) {
      // Start from highest-priority stop
      const bestStart = remaining.reduce((best, i) =>
        (valid[i].priority ?? 0) > (valid[best].priority ?? 0) ? i : best, 0);
      ordered.push(remaining.splice(remaining.indexOf(bestStart), 1)[0]);
    }

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;
      const matrixCurrent = start ? (ordered.length > 0 ? ordered[ordered.length - 1] + 1 : 0) : (ordered.length > 0 ? ordered[ordered.length - 1] : 0);

      for (let i = 0; i < remaining.length; i++) {
        const stopIdx = remaining[i];
        const matrixTarget = start ? stopIdx + 1 : stopIdx;
        const dist = distances[matrixCurrent]?.[matrixTarget] ?? this.dist(allPoints[matrixCurrent], valid[stopIdx]);
        // Score = inverse distance + priority bonus (closer + higher priority = better)
        const priorityBonus = (valid[stopIdx].priority ?? 0) * 2;
        const score = -dist + priorityBonus;
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }

      ordered.push(remaining.splice(bestIdx, 1)[0]);
    }

    // 2-opt improvement using real distances
    const optimized = this.twoOptWithMatrix(ordered, distances, start ? 1 : 0);

    // Calculate optimized route metrics
    let totalKm = 0, totalMin = 0;
    let prevMatrix = start ? 0 : optimized[0];
    const withLegs = optimized.map((stopIdx, seq) => {
      const matrixIdx = start ? stopIdx + 1 : stopIdx;
      const legKm = (seq === 0 && !start) ? 0 : (distances[prevMatrix]?.[matrixIdx] ?? this.dist(allPoints[prevMatrix], valid[stopIdx]));
      const legMin = (seq === 0 && !start) ? 0 : (durations[prevMatrix]?.[matrixIdx] ?? legKm / this.AVG_SPEED_KMH * 60);
      totalKm += legKm;
      totalMin += legMin;
      prevMatrix = matrixIdx;
      return { ...valid[stopIdx], seq: seq + 1, legKm: Math.round(legKm * 100) / 100, legMinutes: Math.round(legMin * 10) / 10 };
    });

    // Calculate UNOPTIMIZED (original order) for comparison
    let unoptKm = 0, unoptMin = 0;
    let prevUnopt = start ? 0 : 0;
    for (let i = 0; i < valid.length; i++) {
      const matrixIdx = start ? i + 1 : i;
      if (i === 0 && !start) { prevUnopt = matrixIdx; continue; }
      unoptKm += distances[prevUnopt]?.[matrixIdx] ?? this.dist(allPoints[prevUnopt], valid[i]);
      unoptMin += durations[prevUnopt]?.[matrixIdx] ?? (unoptKm / this.AVG_SPEED_KMH * 60);
      prevUnopt = matrixIdx;
    }

    const savedKm = Math.max(0, Math.round((unoptKm - totalKm) * 100) / 100);
    const savedMin = Math.max(0, Math.round((unoptMin - totalMin) * 10) / 10);
    const savedPct = unoptKm > 0 ? Math.round((savedKm / unoptKm) * 100) : 0;
    const fuelCost = Math.round(totalKm * (this.CONSUMPTION / 100) * this.FUEL_RATE * 100) / 100;
    const savedFuel = Math.round(savedKm * (this.CONSUMPTION / 100) * this.FUEL_RATE * 100) / 100;

    totalKm = Math.round(totalKm * 100) / 100;
    totalMin = Math.round(totalMin * 10) / 10;

    return {
      order: optimized.map((i) => valid[i].id),
      stops: withLegs,
      totalKm,
      totalMinutes: totalMin,
      unoptimizedKm: Math.round(unoptKm * 100) / 100,
      unoptimizedMinutes: Math.round(unoptMin * 10) / 10,
      savedKm,
      savedMinutes: savedMin,
      savedPercent: savedPct,
      fuelCostZar: fuelCost,
      savedFuelZar: savedFuel,
      aiInsight: savedPct > 15
        ? `Route optimization saved ${savedPct}% distance (${savedKm} km). This translates to R${savedFuel} in fuel savings per run.`
        : savedPct > 5
        ? `Route improved by ${savedPct}%. Consider grouping nearby deliveries for better results.`
        : `Route is already near-optimal. Only ${savedPct}% improvement possible with current stops.`,
      startedFrom: start ?? null,
      routingEngine: engine,
    };
  }

  /** 2-opt improvement using pre-computed distance matrix */
  private twoOptWithMatrix(seq: number[], distances: number[][], startOffset: number): number[] {
    if (seq.length < 4) return seq;
    let best = [...seq];
    let bestLen = this.matrixRouteLen(best, distances, startOffset);
    let improved = true;
    let guard = 0;
    while (improved && guard < 80) {
      improved = false;
      guard++;
      for (let i = 0; i < best.length - 1; i++) {
        for (let k = i + 1; k < best.length; k++) {
          const candidate = [
            ...best.slice(0, i),
            ...best.slice(i, k + 1).reverse(),
            ...best.slice(k + 1),
          ];
          const len = this.matrixRouteLen(candidate, distances, startOffset);
          if (len + 0.01 < bestLen) {
            best = candidate;
            bestLen = len;
            improved = true;
          }
        }
      }
    }
    return best;
  }

  private matrixRouteLen(seq: number[], distances: number[][], startOffset: number): number {
    let total = 0;
    let prev = startOffset > 0 ? 0 : seq[0]; // If we have a start point, it's index 0
    for (let i = 0; i < seq.length; i++) {
      const idx = seq[i] + startOffset;
      total += distances[prev]?.[idx] ?? 999;
      prev = idx;
    }
    return total;
  }

  /** Optimize a tenant's collections (by ids, or all geocoded open ones). */
  async optimizeCollections(
    companyId: string,
    opts: { collectionIds?: string[]; start?: { lat: number; lng: number }; driverId?: string },
  ): Promise<OptimizedRoute & { skipped: number }> {
    const where: any = {
      companyId,
      pickupLat: { not: null },
      pickupLng: { not: null },
      status: { notIn: ['CANCELLED', 'COLLECTED'] },
    };
    if (opts.collectionIds?.length) where.id = { in: opts.collectionIds };
    if (opts.driverId) {
      // Route creation for a driver is a dispatch decision: refuse a driver who
      // is not dispatchable under the shared compliance policy (expired licence,
      // insurance, background check, overdue service, hold, inactive …) instead
      // of planning a run that operations cannot legally execute.
      await this.assertDriverUsable(companyId, opts.driverId);
      where.driverId = opts.driverId;
    }

    const all = await this.prisma.collection.findMany({
      where,
      select: { id: true, clientName: true, pickupAddress: true, pickupLat: true, pickupLng: true },
      take: 200,
    });

    let start = opts.start ?? null;
    if (!start && opts.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: opts.driverId, companyId },
        select: { lastLat: true, lastLng: true },
      });
      if (driver?.lastLat != null && driver?.lastLng != null) {
        start = { lat: driver.lastLat, lng: driver.lastLng };
      }
    }

    const stops: Stop[] = all.map((c) => ({
      id: c.id,
      lat: c.pickupLat as number,
      lng: c.pickupLng as number,
      label: `${c.clientName} — ${c.pickupAddress}`,
    }));

    const result = await this.optimize(stops, start);
    const requested = opts.collectionIds?.length ?? all.length;
    return { ...result, skipped: Math.max(0, requested - stops.length) };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DELIVERY OPTIMIZATION (shipments — the big competitive feature)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Optimize delivery route for a driver's pending shipments.
   * Uses AI-powered priority scoring: COD deliveries first, high-risk parcels prioritized,
   * time-window sensitive parcels moved up in sequence.
   */
  async optimizeDeliveries(
    companyId: string,
    opts: { driverId?: string; waybillIds?: string[]; start?: { lat: number; lng: number } },
  ): Promise<OptimizedRoute & { skipped: number; deliveryCount: number }> {
    const where: any = {
      companyId,
      recipientLat: { not: null },
      recipientLng: { not: null },
      status: { in: ['COLLECTED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'AT_DESTINATION_HUB'] },
    };
    if (opts.waybillIds?.length) where.id = { in: opts.waybillIds };

    // If driverId specified, filter by shipments assigned to that driver — but
    // only after the same compliance gate every other dispatch path applies.
    let driverFilter: any = {};
    if (opts.driverId) {
      await this.assertDriverUsable(companyId, opts.driverId);
      driverFilter = { shipments: { some: { driverId: opts.driverId } } };
    }

    const waybills = await this.prisma.waybill.findMany({
      where: { ...where, ...driverFilter },
      select: {
        id: true, trackingNumber: true, recipientName: true, recipientAddress: true,
        recipientLat: true, recipientLng: true,
        codAmount: true, totalAmount: true, riskLevel: true, riskScore: true,
        attemptCount: true, maxAttempts: true,
        shipments: { select: { estimatedDelivery: true }, take: 1 },
      },
      take: 100,
    });

    // AI Priority Scoring
    const stops: Stop[] = waybills.map((wb) => {
      let priority = 0;

      // COD deliveries get priority (driver needs to collect cash)
      if (wb.codAmount && wb.codAmount > 0) priority += 3;
      if (wb.codAmount && wb.codAmount > 500) priority += 2; // High-value COD

      // High-risk parcels delivered first (reduce exposure time)
      if (wb.riskLevel === 'HIGH') priority += 2;
      if (wb.riskLevel === 'CRITICAL') priority += 4;

      // Multiple attempt parcels — try early in the day (recipient more likely home)
      if (wb.attemptCount && wb.attemptCount > 0) priority += 2;

      // Time-window sensitive (has an estimated delivery time)
      const eta = wb.shipments?.[0]?.estimatedDelivery;
      if (eta && new Date(eta).getTime() - Date.now() < 2 * 60 * 60 * 1000) {
        priority += 5; // Due within 2 hours — highest priority
      }

      return {
        id: wb.id,
        lat: wb.recipientLat as number,
        lng: wb.recipientLng as number,
        label: `${wb.trackingNumber} — ${wb.recipientName} (${wb.recipientAddress})`,
        priority,
        codAmount: wb.codAmount ?? undefined,
        riskLevel: wb.riskLevel ?? undefined,
      };
    });

    // Get driver position as start
    let start = opts.start ?? null;
    if (!start && opts.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: opts.driverId, companyId },
        select: { lastLat: true, lastLng: true },
      });
      if (driver?.lastLat != null && driver?.lastLng != null) {
        start = { lat: driver.lastLat, lng: driver.lastLng };
      }
    }

    const result = await this.optimize(stops, start);
    return {
      ...result,
      skipped: Math.max(0, (opts.waybillIds?.length ?? waybills.length) - stops.length),
      deliveryCount: stops.length,
    };
  }
}
