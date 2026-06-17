import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geocoding/geocoding.service';

export type Stop = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
};

export type OptimizedRoute = {
  order: string[];
  stops: Array<Stop & { seq: number; legKm: number }>;
  totalKm: number;
  startedFrom: { lat: number; lng: number } | null;
};

/**
 * Route optimization (the headline competitive gap). Solves a single-vehicle
 * stop-sequencing problem (open TSP) with a nearest-neighbour construction
 * followed by 2-opt improvement — a well-known, fast heuristic that gets close
 * to optimal for the stop counts a courier route realistically has.
 *
 * Distances are great-circle (haversine) km. This is honest and useful without
 * a paid routing engine; a road-network/traffic-aware engine (OSRM/Google) can
 * be slotted in behind the same interface later.
 */
@Injectable()
export class RoutingService {
  constructor(private prisma: PrismaService) {}

  private dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    return GeocodingService.haversineKm(a.lat, a.lng, b.lat, b.lng);
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

  /** Optimize an arbitrary set of geocoded stops. */
  optimize(stops: Stop[], start?: { lat: number; lng: number } | null): OptimizedRoute {
    const valid = stops.filter(
      (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng),
    );
    if (valid.length === 0) {
      return { order: [], stops: [], totalKm: 0, startedFrom: start ?? null };
    }

    const nn = this.nearestNeighbour(valid, start ?? null);
    const optimized = this.twoOpt(nn, start ?? null);

    let prev = start ?? optimized[0];
    const withLegs = optimized.map((s, idx) => {
      const legKm = start || idx > 0 ? this.dist(prev, s) : 0;
      prev = s;
      return { ...s, seq: idx + 1, legKm: Math.round(legKm * 100) / 100 };
    });

    const totalKm = Math.round(withLegs.reduce((sum, s) => sum + s.legKm, 0) * 100) / 100;
    return {
      order: optimized.map((s) => s.id),
      stops: withLegs,
      totalKm,
      startedFrom: start ?? null,
    };
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
    if (opts.driverId) where.driverId = opts.driverId;

    const all = await this.prisma.collection.findMany({
      where,
      select: { id: true, clientName: true, pickupAddress: true, pickupLat: true, pickupLng: true },
      take: 200,
    });

    let start = opts.start ?? null;
    // If a driver is given and has a known position, start the route there.
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

    const result = this.optimize(stops, start);
    const requested = opts.collectionIds?.length ?? all.length;
    return { ...result, skipped: Math.max(0, requested - stops.length) };
  }
}
